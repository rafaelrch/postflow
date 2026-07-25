import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Contexto de marca coletado no onboarding (tabela `profiles`), injetado como
 * pano de fundo nos prompts dos agentes. Nunca substitui o prompt livre do
 * usuário — só dá à IA o mínimo pra escrever no idioma da marca.
 */
export type BrandContext = {
  niche: string;
  audience: string;
  brandStory: string;
  audiencePains: string;
  tone: string;
  palette: string[];
};

/** Textos longos (nicho, público, história, dores) entram truncados no prompt. */
export const BRAND_TEXT_LIMIT = 200;
/** O tom é uma frase curta; mais que isso vira instrução concorrente. */
export const BRAND_TONE_LIMIT = 100;
export const BRAND_PALETTE_LIMIT = 6;

const HEX_COLOR = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const EMPTY_BRAND_CONTEXT: BrandContext = {
  niche: '',
  audience: '',
  brandStory: '',
  audiencePains: '',
  tone: '',
  palette: [],
};

/** Colapsa quebras de linha/espaços do texto colado no onboarding e trunca. */
function sanitizeText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-') // neutraliza fence forjado (---, ----) sem quebrar hífen legítimo
    .trim()
    .slice(0, limit);
}

function sanitizePalette(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((color): color is string => typeof color === 'string' && HEX_COLOR.test(color))
    .slice(0, BRAND_PALETTE_LIMIT);
}

export function isBrandContextEmpty(ctx: BrandContext | null | undefined): boolean {
  if (!ctx) return true;
  return (
    !ctx.niche && !ctx.audience && !ctx.brandStory && !ctx.audiencePains && !ctx.tone && ctx.palette.length === 0
  );
}

/**
 * Lê o contexto de marca do usuário. Nunca lança e nunca bloqueia a geração:
 * perfil ausente, colunas vazias ou erro de rede viram contexto vazio, e o
 * agente segue com o comportamento genérico de hoje.
 */
export async function getBrandContext(
  userId: string,
  supabase: SupabaseClient,
): Promise<BrandContext> {
  if (!userId) return EMPTY_BRAND_CONTEXT;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('niche, audience, brand_story, audience_pains, default_tone, brand_palette')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      // Loga só o code estável — details/hint do Supabase podem carregar
      // fragmento do valor do perfil.
      if (error) console.error('[getBrandContext] falha ao carregar perfil', { code: (error as { code?: string })?.code });
      return EMPTY_BRAND_CONTEXT;
    }

    return {
      niche: sanitizeText(data.niche, BRAND_TEXT_LIMIT),
      audience: sanitizeText(data.audience, BRAND_TEXT_LIMIT),
      brandStory: sanitizeText(data.brand_story, BRAND_TEXT_LIMIT),
      audiencePains: sanitizeText(data.audience_pains, BRAND_TEXT_LIMIT),
      tone: sanitizeText(data.default_tone, BRAND_TONE_LIMIT),
      palette: sanitizePalette(data.brand_palette),
    };
  } catch (err) {
    console.error('[getBrandContext] erro inesperado', { message: err instanceof Error ? err.message : 'desconhecido' });
    return EMPTY_BRAND_CONTEXT;
  }
}

/**
 * Bloco de contexto pronto pra prepender ao prompt do usuário.
 * Retorna '' quando não há nada preenchido — assim o prompt final fica
 * byte a byte igual ao de hoje pra quem não completou o onboarding.
 */
export function formatBrandContextAsPrompt(ctx: BrandContext | null | undefined): string {
  if (isBrandContextEmpty(ctx)) return '';
  const brand = ctx as BrandContext;

  const linhas = [
    brand.niche && `- Nicho: ${brand.niche}`,
    brand.audience && `- Público: ${brand.audience}`,
    brand.brandStory && `- História da marca: ${brand.brandStory}`,
    brand.audiencePains && `- Dores do público: ${brand.audiencePains}`,
    brand.tone && `- Tom de voz: ${brand.tone}`,
    brand.palette.length > 0 && `- Cores da marca: ${brand.palette.join(', ')}`,
  ].filter(Boolean);

  return `Contexto da marca (pano de fundo — NÃO é o tema do conteúdo e não deve ser citado explicitamente):
${linhas.join('\n')}

Use esse contexto para calibrar exemplos, vocabulário e tom. As instruções abaixo mandam sempre que houver conflito.`;
}
