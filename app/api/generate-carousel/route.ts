import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { openai, CAROUSEL_SYSTEM_PROMPT, TWITTER_CAROUSEL_SYSTEM_PROMPT, WEB_SEARCH_PROMPT_ADDENDUM } from '@/lib/openai';
import { requireCredits, refundCredits } from '@/lib/subscription';
import { requireEntitlement } from '@/lib/entitlements';
import { CREDIT_COSTS } from '@/lib/credits';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { BrandContext, formatBrandContextAsPrompt, getBrandContext } from '@/lib/brand-context';
import { GenerateCarouselInput, CarouselAIResponse } from '@/types';

export const maxDuration = 60;

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
  try {
    const body: GenerateCarouselInput & { manual?: boolean } = await req.json();

    // Superfície MANUAL (esqueleto vazio): sem IA e sem crédito. Aceita free e
    // pro — só exige estar autenticado. NÃO passa por requireCredits.
    if (body.manual) {
      const ent = await requireEntitlement();
      if (!ent.ok) return ent.response;

      const slides = Array.from({ length: body.slideCount }, (_, i) => ({
        id: i + 1,
        title: i === 0 ? 'Título da Capa' : i === body.slideCount - 1 ? 'Me segue pra mais!' : `Slide ${i + 1}`,
        description: i === 0 ? 'Subtítulo aqui' : '',
        highlightWord: '',
        backgroundColor: i === 0 || i === body.slideCount - 1 ? '#0A0A0A' : '#111111',
      }));
      return NextResponse.json({ slides, caption: '', hashtags: [] });
    }

    // Superfície de IA: exige plano PAGO e nega o free CEDO, com code
    // 'plan_required', ANTES de qualquer débito ou chamada à OpenAI.
    const ent = await requireEntitlement({ requirePlan: 'pro' });
    if (!ent.ok) return ent.response;

    const cost = CREDIT_COSTS.carousel;
    const guard = await requireCredits(cost);
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

    return NextResponse.json(aiData);
  } catch (err) {
    // Geração falhou após debitar: estorna os créditos.
    if (userId && charged > 0) await refundCredits(userId, charged);
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
  const prompt = buildPromptBody(body);
  const contexto = formatBrandContextAsPrompt(brandContext);
  return contexto ? `${contexto}\n\n---\n\n${prompt}` : prompt;
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
O leitor deve querer ir para o próximo slide em cada etapa.`;
}
