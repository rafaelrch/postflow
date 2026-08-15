import { randomUUID } from 'node:crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { openai, CAROUSEL_SYSTEM_PROMPT, TWITTER_CAROUSEL_SYSTEM_PROMPT, WEB_SEARCH_PROMPT_ADDENDUM } from '@/lib/openai';
import { requireActiveSubscription, requireCredits, refundCredits } from '@/lib/subscription';
import { CREDIT_COSTS } from '@/lib/credits';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { BrandContext, formatBrandContextAsPrompt, getBrandContext } from '@/lib/brand-context';
import { GenerateCarouselInput, CarouselAIResponse } from '@/types';
import { template02Addendum } from '@/lib/templates/template-02';
import { normalizeGenerationError, recordAiGenerationBestEffort } from '@/lib/product-events';

export const maxDuration = 60;

function analyticsAfter(task: () => Promise<void>) {
  try { after(task); } catch { void task(); }
}

function sanitizeJson(str: string): string {
  // Remove control characters inside JSON string values (ASCII 0x00–0x1F except \t \n \r)
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
}

function parseAIJson(text: string): CarouselAIResponse {
  const cleaned = sanitizeJson(
    text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  );
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta da IA inválida — não foi possível parsear JSON');
    return JSON.parse(match[0]);
  }
}

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let charged = 0;
  const startedAt = Date.now();
  const operationId = randomUUID();
  const chargeOperationId = randomUUID();
  const refundOperationId = randomUUID();
  let metadata: Partial<Pick<GenerateCarouselInput, 'style' | 'slideCount' | 'language'>> = {};
  try {
    const body: GenerateCarouselInput & { manual?: boolean } = await req.json();
    metadata = { style: body.style, slideCount: body.slideCount, language: body.language };

    // Superfície MANUAL (esqueleto vazio): sem IA e sem crédito, então NÃO
    // passa por requireCredits. Exige assinatura ativa como o resto do produto
    // — o plano gratuito saiu e voltou a valer o pagamento-primeiro.
    if (body.manual) {
      const manualGuard = await requireActiveSubscription();
      if (!manualGuard.ok) return manualGuard.response;

      const slides = Array.from({ length: body.slideCount }, (_, i) => ({
        id: i + 1,
        title: i === 0 ? 'Título da Capa' : i === body.slideCount - 1 ? 'Me segue pra mais!' : `Slide ${i + 1}`,
        description: i === 0 ? 'Subtítulo aqui' : '',
        highlightWord: '',
        backgroundColor: i === 0 || i === body.slideCount - 1 ? '#0A0A0A' : '#111111',
      }));
      return NextResponse.json({ slides, caption: '', hashtags: [] });
    }

    // Superfície de IA. Não há mais um gate de plano separado: requireCredits
    // já exige assinatura ativa (402 subscription_required) ANTES de debitar
    // crédito ou chamar a OpenAI. Com o free removido, "plano pago" e
    // "assinatura ativa" viraram a mesma pergunta — perguntar duas vezes só
    // criaria dois lugares para errar.
    const cost = CREDIT_COSTS.carousel;
    const guard = await requireCredits(cost, { feature: 'carousel', operationId: chargeOperationId });
    if (!guard.ok) return guard.response;
    userId = guard.userId;
    charged = cost;

    // Contexto de marca do onboarding entra como pano de fundo do prompt.
    // Best-effort: qualquer falha aqui cai no prompt genérico de sempre.
    let brandContext: BrandContext | undefined;
    try {
      const supabase = await createServerSupabaseClient();
      brandContext = await getBrandContext(userId, supabase);
    } catch (err) {
      console.error('[generate-carousel] brand context', err);
    }

    // Build input
    const input: OpenAI.Responses.ResponseInputItem[] = [];
    const userPrompt = buildUserPrompt(body, brandContext);

    if (body.referenceImageBase64) {
      input.push({
        role: 'user',
        content: [
          {
            type: 'input_image',
            detail: 'auto',
            image_url: body.referenceImageBase64.startsWith('data:')
              ? body.referenceImageBase64
              : `data:image/jpeg;base64,${body.referenceImageBase64}`,
          },
          {
            type: 'input_text',
            text: userPrompt,
          },
        ],
      });
    } else {
      input.push({ role: 'user', content: userPrompt });
    }

    const basePrompt = body.style === 'profile' ? TWITTER_CAROUSEL_SYSTEM_PROMPT : CAROUSEL_SYSTEM_PROMPT;

    const response = await openai.responses.create({
      model: 'gpt-5.4-nano',
      max_output_tokens: 4096,
      instructions: body.webSearch ? basePrompt + WEB_SEARCH_PROMPT_ADDENDUM : basePrompt,
      tools: body.webSearch ? [{ type: 'web_search' }] : undefined,
      input,
    });

    const text = response.output_text;
    const aiData = parseAIJson(text);

    analyticsAfter(() => recordAiGenerationBestEffort({
      operationId,
      userId: userId!,
      feature: 'carousel',
      status: 'succeeded',
      model: 'gpt-5.4-nano',
      generationType: body.webSearch ? 'web_search' : 'standard',
      style: body.style,
      language: body.language ?? 'pt-BR',
      slideCount: body.slideCount,
      credits: charged,
      durationMs: Date.now() - startedAt,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    }));

    return NextResponse.json(aiData);
  } catch (err) {
    // Geração falhou após debitar: estorna os créditos.
    if (userId && charged > 0) {
      await refundCredits(userId, charged, { feature: 'carousel', operationId: refundOperationId });
      analyticsAfter(() => recordAiGenerationBestEffort({
        operationId,
        userId: userId!,
        feature: 'carousel',
        status: 'failed',
        model: 'gpt-5.4-nano',
        style: metadata.style,
        language: metadata.language ?? 'pt-BR',
        slideCount: metadata.slideCount,
        credits: charged,
        durationMs: Date.now() - startedAt,
        errorCode: normalizeGenerationError(err),
      }));
    }
    console.error('[generate-carousel]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

/**
 * Prefixa o contexto de marca ao prompt do usuário, sem alterá-lo.
 * Sem contexto, a string devolvida é exatamente a de antes.
 */
function buildUserPrompt(body: GenerateCarouselInput, brandContext?: BrandContext): string {
  const prompt = buildPromptBody(body) + buildContentDirectives(body);
  const contexto = formatBrandContextAsPrompt(brandContext);
  return contexto ? `${contexto}\n\n---\n\n${prompt}` : prompt;
}

const LANGUAGE_LABELS: Record<string, string> = {
  'pt-BR': 'português do Brasil',
  'en-US': 'inglês (EUA)',
  'es-ES': 'espanhol',
};

/**
 * Diretivas opcionais do wizard (idioma e conteúdo exato).
 *
 * Entram DEPOIS do addendum do template, para não competir com os limites de
 * slot. Sem nenhuma das duas — o caso de qualquer chamador antigo — devolve
 * string vazia e o prompt final fica idêntico ao de antes.
 */
function buildContentDirectives(body: GenerateCarouselInput): string {
  const linhas: string[] = [];

  // pt-BR é o padrão histórico e já está embutido no system prompt.
  if (body.language && body.language !== 'pt-BR') {
    linhas.push(`IDIOMA: escreva todo o conteúdo dos slides em ${LANGUAGE_LABELS[body.language] ?? body.language}.`);
  }

  if (body.exactContent) {
    linhas.push(
      'CONTEÚDO EXATO: use o texto acima literalmente, apenas distribuindo-o entre os slides. ' +
      'Não reescreva, não resuma e não invente frases novas.'
    );
  }

  return linhas.length ? `\n\n${linhas.join('\n')}` : '';
}

function buildPromptBody(body: GenerateCarouselInput): string {
  if (body.style === 'profile') {
    const format = body.twitterFormat ?? 'B';

    if (format === 'A') {
      return `FORMATO A — Tweet Único (1 slide)

Tema: "${body.prompt}"
${body.profileData ? `Perfil: ${body.profileData.name} (${body.profileData.handle})` : ''}

Crie 1 slide com 2-3 frases contraintuitivas e diretas sobre esse tema.
Use contraste: "não é X, é Y". Sem clichês motivacionais.
Deve revelar algo que o leitor não esperava — factual, provocativo, memorável.`;
    }

    return `FORMATO B — Thread Completa

Tema: "${body.prompt}"
Número de slides: ${body.slideCount}
${body.imageDirection ? `Direcionamento visual: ${body.imageDirection}` : ''}
${body.profileData ? `Perfil: ${body.profileData.name} (${body.profileData.handle})` : ''}

Crie uma thread completa com a estrutura: hook, contexto, tensão/fracassos, virada, síntese e punchline final.
OBRIGATÓRIO: máximo 2-3 frases por slide. Cada description é curta e densa — proibido parágrafo longo.
Use números específicos e contraste. O slide 1 deve prender sozinho. O slide final deve encerrar com punch e CTA.`;
  }

  return `Crie um carrossel sobre: "${body.prompt}"

Número de slides: ${body.slideCount}
Tipo de imagem: ${body.imageType}
${body.imageDirection ? `Direcionamento visual: ${body.imageDirection}` : ''}

Estrutura: hook irresistível na capa → desenvolvimento progressivo (1 ponto por slide) → CTA no final.
OBRIGATÓRIO: description de cada slide = máximo 2 frases. Curto, direto, sem enchimento.
title de cada slide = máximo 7 palavras.
O leitor deve querer ir para o próximo slide em cada etapa.${
    body.style === 'template01' ? TEMPLATE_01_ADDENDUM : ''
  }${body.style === 'template02' ? template02Addendum() : ''}`;
}

/**
 * TEMPLATE 1 — o desenho tem blocos de texto ALÉM do par título/descrição: o
 * chapéu da capa, o remate do slide 3 e a coluna de baixo do slide 5. Sem estes
 * campos eles ficavam com a copy ilustrativa do Figma ("*Barcelona FC cria
 * fonte…") em todo carrossel gerado.
 *
 * Os limites são os de `slots.json` (o mesmo que a barra lateral audita); o que
 * estourar não deixa "apertado", empurra o bloco de baixo.
 */
const TEMPLATE_01_ADDENDUM = `

TEMPLATE 1 — campos extras OBRIGATÓRIOS.
São exatamente 6 slides. Além de "title" e "description", devolva em cada slide
um objeto "extras" com os campos abaixo (só nos slides listados; nos outros
omita "extras"). Respeite os limites — eles são a caixa do desenho:

- slide 1: { "eyebrow": "..." }   1 linha, até 51 caracteres. É o chapéu da
  capa: uma manchete curta do assunto, começando com "*".
- slide 3: { "kicker": "..." }    até 2 linhas de 33 caracteres (use \\n para
  quebrar). É um remate em itálico que fecha o raciocínio do slide.
- slide 5: { "botTitle": "...", "botBody": "..." }
  botTitle: até 3 linhas de 11 caracteres (coluna estreita — palavras curtas,
  quebre com \\n). botBody: até 5 linhas de 36 caracteres.
  O slide 5 tem DUAS faixas: title/description são a de cima, botTitle/botBody
  são a de baixo, e as duas tratam de eixos DIFERENTES do tema.

Nunca devolva texto de exemplo, nome de marca ou assunto que não sejam os do
tema pedido.`;
