import { randomUUID } from 'node:crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import { openai, REFINE_SYSTEM_PROMPT } from '@/lib/openai';
import { requireCredits, refundCredits } from '@/lib/subscription';
import { CREDIT_COSTS } from '@/lib/credits';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { normalizeGenerationError, recordAiGenerationBestEffort } from '@/lib/product-events';
import { applyRefinement, buildRefinePrompt, parseRefineJson, validateRefineBody } from '@/lib/refine-text';
import type { RefineRequest } from '@/lib/refine-text';

export const maxDuration = 60;

const MODEL = 'gpt-5.4-nano';

/** Mesmo teto do resto das rotas de IA: refinar é caro e não é ação de rajada. */
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

function analyticsAfter(task: () => Promise<void>) {
  try { after(task); } catch { void task(); }
}

/**
 * REFINAR TEXTO — melhora o texto que JÁ EXISTE num carrossel, em três
 * escopos: o carrossel inteiro, um slide ou um campo.
 *
 * Espelha o generate-carousel na estrutura (guarda de assinatura, parse com
 * limpeza de cerca de código, telemetria best-effort, maxDuration), mas com
 * uma diferença de postura importante: aqui NÃO existe melhor esforço.
 * Contagem errada, JSON quebrado ou forma inesperada viram erro explícito, e
 * o cliente fica com o texto original intacto. Um refinamento parcial e calado
 * corromperia um carrossel que o usuário já tinha pronto.
 *
 * As regras duras (só texto, contagem imutável, chaves de slot imutáveis,
 * escopo literal, teto de tamanho) são garantidas no MERGE de
 * `lib/refine-text.ts`, não no prompt. O prompt pede; o merge trava.
 */
export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let charged = 0;
  const startedAt = Date.now();
  const operationId = randomUUID();
  const chargeOperationId = randomUUID();
  const refundOperationId = randomUUID();
  let pedido: RefineRequest | null = null;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido no corpo da requisição.' }, { status: 400 });
    }

    // Guarda ANTES da validação de corpo: 401/402 não podem depender do que
    // veio no corpo, senão um anônimo descobriria o formato aceito pela rota.
    // requireCredits confere sessão e assinatura ANTES do atalho de custo zero
    // (lib/subscription.ts) — por isso custo 0 não abre a rota.
    // ⚠️ Refinar reusa CREDIT_COSTS.carousel de propósito. Se refinar vai
    // custar crédito é decisão do Rafael e ainda não foi tomada; nenhuma chave
    // nova em CREDIT_COSTS até lá.
    const cost = CREDIT_COSTS.carousel;
    const guard = await requireCredits(cost, { feature: 'carousel', operationId: chargeOperationId });
    if (!guard.ok) return guard.response;
    userId = guard.userId;
    charged = cost;

    const limite = rateLimit(`refine-text:${userId}:${clientIp(req)}`, RATE_LIMIT);
    if (!limite.ok) {
      return NextResponse.json(
        { error: 'Muitos refinamentos seguidos. Aguarde alguns segundos.', code: 'rate_limited' },
        { status: 429, headers: { 'retry-after': String(limite.retryAfterSec) } },
      );
    }

    const validacao = validateRefineBody(body);
    if (!validacao.ok) {
      return NextResponse.json({ error: validacao.error, code: 'invalid_body' }, { status: 400 });
    }
    pedido = validacao.value;

    const response = await openai.responses.create({
      model: MODEL,
      max_output_tokens: 4096,
      instructions: REFINE_SYSTEM_PROMPT,
      input: [{ role: 'user', content: buildRefinePrompt(pedido) }],
    });

    let aiData: unknown;
    try {
      aiData = parseRefineJson(response.output_text ?? '');
    } catch {
      return refinamentoInvalido('invalid_ai_response', 'A IA devolveu uma resposta que não é JSON válido.');
    }

    const merge = applyRefinement(pedido, aiData);
    if (!merge.ok) return refinamentoInvalido(merge.reason, merge.error);

    analyticsAfter(() => recordAiGenerationBestEffort({
      operationId,
      userId: userId!,
      feature: 'carousel',
      status: 'succeeded',
      model: MODEL,
      generationType: `refine_${pedido!.scope}`,
      style: pedido!.style,
      language: pedido!.language ?? 'pt-BR',
      slideCount: pedido!.slides.length,
      credits: charged,
      durationMs: Date.now() - startedAt,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    }));

    return NextResponse.json({ slides: merge.slides });
  } catch (err) {
    // Só estorna se de fato houve débito. Hoje o custo é 0 e este bloco não
    // roda — fica para não comer crédito em silêncio se o custo mudar.
    if (userId && charged > 0) {
      await refundCredits(userId, charged, { feature: 'carousel', operationId: refundOperationId });
    }
    if (userId) {
      analyticsAfter(() => recordAiGenerationBestEffort({
        operationId,
        userId: userId!,
        feature: 'carousel',
        status: 'failed',
        model: MODEL,
        generationType: pedido ? `refine_${pedido.scope}` : 'refine',
        style: pedido?.style,
        language: pedido?.language ?? 'pt-BR',
        slideCount: pedido?.slides.length,
        credits: charged,
        durationMs: Date.now() - startedAt,
        errorCode: normalizeGenerationError(err),
      }));
    }
    console.error('[refine-text]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }

  /**
   * 502 e não 500: a rota funcionou, quem falhou o contrato foi o provedor.
   * O `code` é o que deixa o cliente dizer "não deu, seu texto está intacto"
   * em vez de um erro genérico — e o texto original NUNCA sai daqui alterado.
   */
  function refinamentoInvalido(code: string, error: string) {
    analyticsAfter(() => recordAiGenerationBestEffort({
      operationId,
      userId: userId!,
      feature: 'carousel',
      status: 'failed',
      model: MODEL,
      generationType: pedido ? `refine_${pedido.scope}` : 'refine',
      style: pedido?.style,
      language: pedido?.language ?? 'pt-BR',
      slideCount: pedido?.slides.length,
      credits: charged,
      durationMs: Date.now() - startedAt,
      errorCode: 'invalid_provider_response',
    }));
    return NextResponse.json({ error, code }, { status: 502 });
  }
}
