import type { SlideStyle } from '@/types';

/**
 * REFINAR TEXTO — a parte PURA da rota /api/refine-text.
 *
 * Módulo sem nenhum import do client da OpenAI, no padrão de
 * `lib/image-prompt.ts`. É o que deixa validar o corpo, montar o prompt e
 * provar o MERGE em teste de node, sem chave de API e sem gastar crédito.
 *
 * O que mora aqui é o que precisa ser afirmado sozinho:
 *
 *  1. `validateRefineBody` — validação do corpo escrita à mão (o projeto não
 *     usa zod), devolvendo mensagem útil em vez de um 400 mudo.
 *  2. `buildRefinePrompt` — o prompt, em texto determinístico.
 *  3. `applyRefinement` — o MERGE. Aqui é onde as regras duras são de fato
 *     garantidas. O prompt PEDE que a IA respeite escopo, contagem, chaves de
 *     slot e teto de tamanho; este merge não CONFIA nisso. Um prompt é uma
 *     súplica, um merge é uma trava — e a trava é o que o teste consegue provar.
 *
 * REGRA DE OURO, herdada do image-prompt: mesma entrada, mesma saída. Nada de
 * data, random ou ordem de chave que mude entre duas chamadas iguais.
 */

export type RefineScope = 'carousel' | 'slide' | 'field';

/** Só as chaves de TEXTO. A rota nunca devolve imagem, cor, fonte ou layout. */
export type RefineSlide = {
  position: number;
  title: string;
  description?: string;
  subtitle?: string;
  templateSlots?: Record<string, string>;
};

export type RefineRequest = {
  scope: RefineScope;
  style: SlideStyle;
  language?: string;
  instruction?: string;
  slides: RefineSlide[];
  slideIndex?: number;
  field?: string;
};

const SCOPES: readonly RefineScope[] = ['carousel', 'slide', 'field'];

/**
 * `satisfies` mantém esta lista amarrada ao union de `types/index.ts`: um
 * estilo novo lá que não entre aqui quebra o build, em vez de virar um 400
 * silencioso em produção.
 */
const STYLES = ['minimalist', 'profile', 'editorial', 'template01', 'template02'] as const satisfies readonly SlideStyle[];

/** Campos de texto de primeira classe do slide. Nada além destes é refinável. */
export const REFINABLE_FIELDS = ['title', 'description', 'subtitle'] as const;
export type RefinableField = (typeof REFINABLE_FIELDS)[number];

export const MAX_SLIDES = 20;
export const MAX_INSTRUCTION_LENGTH = 500;

/**
 * Teto de crescimento por campo: original + 20%. O refinamento não pode
 * estourar a caixa do slide — o desenho é fixo e texto a mais não fica
 * "apertado", empurra o bloco de baixo (mesma razão dos limites de slot do
 * Template 1). Vai no prompt E é aparado no servidor.
 */
export const MAX_GROWTH_RATIO = 1.2;

export function maxLengthFor(original: string): number {
  return Math.ceil(original.length * MAX_GROWTH_RATIO);
}

/**
 * Apara mantendo palavra inteira quando dá. O corte cru no meio da palavra
 * entrega "estratég"; preferimos o último espaço, desde que não jogue fora
 * mais de 25% do texto permitido.
 */
function clampText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace >= max * 0.75 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Slot que guarda IMAGEM (ex.: `s3.image` do Template 1) não é texto e não
 * pode ser tocado por uma rota de texto — regra 1. Detectamos pelo VALOR
 * original, não pelo nome da chave: o nome é convenção de template e muda,
 * a URL é o que de fato quebraria o slide.
 */
function isImageValue(value: string): boolean {
  return /^(https?:\/\/|data:|blob:|\/)/i.test(value.trim());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v === 'string');
}

// ---------------------------------------------------------------------------
// 1. VALIDAÇÃO DO CORPO
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { ok: true; value: RefineRequest }
  | { ok: false; error: string };

function invalid(error: string): ValidationResult {
  return { ok: false, error };
}

export function validateRefineBody(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return invalid('Corpo da requisição deve ser um objeto JSON.');
  const raw = input;

  if (typeof raw.scope !== 'string' || !SCOPES.includes(raw.scope as RefineScope)) {
    return invalid(`"scope" deve ser um de: ${SCOPES.join(', ')}.`);
  }
  const scope = raw.scope as RefineScope;

  if (typeof raw.style !== 'string' || !(STYLES as readonly string[]).includes(raw.style)) {
    return invalid(`"style" deve ser um de: ${STYLES.join(', ')}.`);
  }
  const style = raw.style as SlideStyle;

  let language: string | undefined;
  if (raw.language != null) {
    if (typeof raw.language !== 'string' || raw.language.trim().length === 0 || raw.language.length > 20) {
      return invalid('"language" deve ser uma string curta e não vazia (ex.: "pt-BR").');
    }
    language = raw.language.trim();
  }

  // Direção livre do usuário: acima do teto é REJEITADA, não aparada em
  // silêncio. Aparar mudaria a instrução sem avisar quem a escreveu, e o
  // cliente consegue mostrar o contador antes de enviar.
  let instruction: string | undefined;
  if (raw.instruction != null) {
    if (typeof raw.instruction !== 'string') return invalid('"instruction" deve ser uma string.');
    if (raw.instruction.length > MAX_INSTRUCTION_LENGTH) {
      return invalid(`"instruction" excede ${MAX_INSTRUCTION_LENGTH} caracteres (recebido: ${raw.instruction.length}).`);
    }
    const limpa = raw.instruction.trim();
    if (limpa.length > 0) instruction = limpa;
  }

  if (!Array.isArray(raw.slides) || raw.slides.length === 0) {
    return invalid('"slides" deve ser um array com pelo menos 1 slide.');
  }
  if (raw.slides.length > MAX_SLIDES) {
    return invalid(`"slides" excede o máximo de ${MAX_SLIDES} slides.`);
  }

  const slides: RefineSlide[] = [];
  for (let i = 0; i < raw.slides.length; i += 1) {
    const item = raw.slides[i];
    if (!isPlainObject(item)) return invalid(`slides[${i}] deve ser um objeto.`);
    if (typeof item.position !== 'number' || !Number.isFinite(item.position)) {
      return invalid(`slides[${i}].position deve ser um número.`);
    }
    if (typeof item.title !== 'string') return invalid(`slides[${i}].title deve ser uma string.`);
    if (item.description != null && typeof item.description !== 'string') {
      return invalid(`slides[${i}].description deve ser uma string.`);
    }
    if (item.subtitle != null && typeof item.subtitle !== 'string') {
      return invalid(`slides[${i}].subtitle deve ser uma string.`);
    }
    if (item.templateSlots != null && !isStringMap(item.templateSlots)) {
      return invalid(`slides[${i}].templateSlots deve ser um objeto de string para string.`);
    }
    slides.push({
      position: item.position,
      title: item.title,
      ...(item.description != null ? { description: item.description as string } : {}),
      ...(item.subtitle != null ? { subtitle: item.subtitle as string } : {}),
      ...(item.templateSlots != null ? { templateSlots: { ...(item.templateSlots as Record<string, string>) } } : {}),
    });
  }

  let slideIndex: number | undefined;
  if (scope !== 'carousel') {
    if (typeof raw.slideIndex !== 'number' || !Number.isInteger(raw.slideIndex)) {
      return invalid(`"slideIndex" é obrigatório e deve ser um inteiro quando scope é "${scope}".`);
    }
    if (raw.slideIndex < 0 || raw.slideIndex >= slides.length) {
      return invalid(`"slideIndex" fora do intervalo 0..${slides.length - 1}.`);
    }
    slideIndex = raw.slideIndex;
  }

  let field: string | undefined;
  if (scope === 'field') {
    if (typeof raw.field !== 'string' || raw.field.length === 0) {
      return invalid('"field" é obrigatório quando scope é "field".');
    }
    const alvo = slides[slideIndex!]!;
    const ehCampoBase = (REFINABLE_FIELDS as readonly string[]).includes(raw.field);
    const ehSlot = alvo.templateSlots != null && Object.hasOwn(alvo.templateSlots, raw.field);
    if (!ehCampoBase && !ehSlot) {
      return invalid(`"field" deve ser ${REFINABLE_FIELDS.join(', ')} ou uma chave existente de templateSlots do slide ${slideIndex}.`);
    }
    field = raw.field;
  }

  return {
    ok: true,
    value: {
      scope,
      style,
      ...(language ? { language } : {}),
      ...(instruction ? { instruction } : {}),
      slides,
      ...(slideIndex != null ? { slideIndex } : {}),
      ...(field ? { field } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. PARSE DA RESPOSTA DA IA
// ---------------------------------------------------------------------------

/** Tira caracteres de controle de dentro de strings JSON (0x00–0x1F, exceto \t \n \r). */
function sanitizeJson(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
}

/**
 * Mesmo tratamento do generate-carousel: limpa a cerca de código e, se ainda
 * assim não parsear, tenta o primeiro bloco `{...}` por regex. LANÇA quando
 * não dá — nada de objeto vazio "por garantia", que viraria um refinamento
 * parcial e calado.
 */
export function parseRefineJson(text: string): unknown {
  const cleaned = sanitizeJson(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta da IA inválida — não foi possível parsear JSON');
    return JSON.parse(match[0]);
  }
}

// ---------------------------------------------------------------------------
// 3. O MERGE — onde as regras duras viram trava
// ---------------------------------------------------------------------------

export type RefineFailure =
  | 'invalid_shape'
  | 'slide_count_mismatch'
  | 'position_mismatch';

export type MergeResult =
  | { ok: true; slides: RefineSlide[] }
  | { ok: false; reason: RefineFailure; error: string };

/** O campo `i`/`field` está dentro do escopo pedido? */
function inScope(req: RefineRequest, index: number, field: string): boolean {
  if (req.scope === 'carousel') return true;
  if (index !== req.slideIndex) return false;
  if (req.scope === 'slide') return true;
  return field === req.field;
}

/**
 * Funde a resposta da IA sobre os slides ORIGINAIS.
 *
 * Parte-se sempre do original e só se sobrescreve o que o escopo autoriza —
 * o contrário (partir da resposta da IA e "corrigir") deixaria qualquer campo
 * esquecido passar. Fora do escopo, o slide volta idêntico byte a byte.
 */
export function applyRefinement(req: RefineRequest, aiResponse: unknown): MergeResult {
  if (!isPlainObject(aiResponse) || !Array.isArray(aiResponse.slides)) {
    return { ok: false, reason: 'invalid_shape', error: 'A IA não devolveu um objeto com a lista "slides".' };
  }
  const aiSlides = aiResponse.slides as unknown[];

  // Regra 2: contagem é imutável. Não completa nem corta — é erro.
  if (aiSlides.length !== req.slides.length) {
    return {
      ok: false,
      reason: 'slide_count_mismatch',
      error: `A IA devolveu ${aiSlides.length} slides; o carrossel tem ${req.slides.length}.`,
    };
  }

  const merged: RefineSlide[] = [];

  for (let i = 0; i < req.slides.length; i += 1) {
    const original = req.slides[i]!;
    const bruto = aiSlides[i];

    if (!isPlainObject(bruto)) {
      return { ok: false, reason: 'invalid_shape', error: `slides[${i}] da resposta da IA não é um objeto.` };
    }
    // As positions voltam na mesma ordem: é como o cliente reconcilia os
    // slides. Fora de ordem, não há merge seguro possível.
    if (bruto.position !== original.position) {
      return {
        ok: false,
        reason: 'position_mismatch',
        error: `slides[${i}] voltou com position ${String(bruto.position)}; o esperado era ${original.position}.`,
      };
    }

    // Sempre a partir do ORIGINAL. Qualquer chave que a IA tenha inventado
    // (imagem, cor, fonte, layout) simplesmente não é lida — regra 1.
    const saida: RefineSlide = { position: original.position, title: original.title };

    const escolhe = (field: RefinableField, atual: string): string => {
      if (!inScope(req, i, field)) return atual;
      const proposto = bruto[field];
      if (typeof proposto !== 'string') return atual;
      const limpo = proposto.trim();
      // Campo vazio na origem não é refinável: não há texto para melhorar, e
      // o teto (0 + 20% = 0) não deixaria escrever nada mesmo.
      if (atual.length === 0 || limpo.length === 0) return atual;
      return clampText(limpo, maxLengthFor(atual));
    };

    saida.title = escolhe('title', original.title);
    if (original.description != null) saida.description = escolhe('description', original.description);
    if (original.subtitle != null) saida.subtitle = escolhe('subtitle', original.subtitle);

    if (original.templateSlots != null) {
      // Regra 3: o conjunto de CHAVES é imutável. Iteramos sobre as chaves do
      // ORIGINAL — chave nova da IA nunca é lida (descartada), chave que a IA
      // omitiu cai no valor original (restaurada). Só o VALOR pode mudar.
      const slots: Record<string, string> = {};
      const propostos = isStringMap(bruto.templateSlots) ? bruto.templateSlots : {};
      for (const [chave, valorOriginal] of Object.entries(original.templateSlots)) {
        const proposto = propostos[chave];
        if (
          proposto == null ||
          !inScope(req, i, chave) ||
          isImageValue(valorOriginal) ||
          valorOriginal.length === 0 ||
          proposto.trim().length === 0
        ) {
          slots[chave] = valorOriginal;
          continue;
        }
        slots[chave] = clampText(proposto, maxLengthFor(valorOriginal));
      }
      saida.templateSlots = slots;
    }

    merged.push(saida);
  }

  return { ok: true, slides: merged };
}

// ---------------------------------------------------------------------------
// 4. O PROMPT
// ---------------------------------------------------------------------------

export const REFINE_SYSTEM_PROMPT = `Você é um editor de copy de carrosséis. Seu trabalho é REFINAR um texto que já existe — não reescrever do zero, não mudar o assunto, não inventar fatos novos.

REFINAR significa: deixar mais claro, mais específico, mais forte no ritmo e mais fácil de ler. O leitor deve reconhecer o mesmo texto, melhor escrito.

REGRAS INEGOCIÁVEIS:

1. SÓ TEXTO. Você nunca devolve imagem, cor, fonte, layout, tamanho ou qualquer campo de estilo. As únicas chaves permitidas em cada slide são: "position", "title", "description", "subtitle", "templateSlots".

2. MESMA QUANTIDADE DE SLIDES, NA MESMA ORDEM. Devolva exatamente o mesmo número de slides que recebeu, com os mesmos valores de "position", na mesma sequência. Nunca junte, divida, some ou remova slides.

3. templateSlots: as CHAVES são fixas. Devolva exatamente as mesmas chaves que recebeu, sem criar nem remover nenhuma. Só o valor de cada chave pode mudar.

4. ESCOPO É LITERAL. Você só pode alterar o que o pedido autorizar explicitamente. Todo o resto deve voltar EXATAMENTE como veio, caractere por caractere.

5. IDIOMA. Escreva no mesmo idioma do texto que recebeu.

6. TAMANHO. Cada campo tem um limite de caracteres indicado no pedido. O texto refinado precisa CABER — o desenho do slide é fixo e o que estoura empurra o bloco de baixo. Prefira encurtar a alongar.

7. HIERARQUIA. "title" continua título: curto, de impacto, sem ponto final. "description" continua descrição: explica ou desenvolve o título. "subtitle" continua apoio. Nunca troque o papel de um campo pelo de outro.

FORMATO DA RESPOSTA: devolva APENAS um objeto JSON válido, sem cerca de código e sem comentários, no formato:
{"slides":[{"position":1,"title":"...","description":"...","subtitle":"...","templateSlots":{"chave":"valor"}}]}
Inclua em cada slide apenas as chaves que recebeu naquele slide.`;

const LANGUAGE_LABELS: Record<string, string> = {
  'pt-BR': 'português do Brasil',
  'en-US': 'inglês (EUA)',
  'es-ES': 'espanhol',
};

const STYLE_LABELS: Record<SlideStyle, string> = {
  minimalist: 'minimalista — frases secas, sem adjetivo decorativo',
  profile: 'thread de perfil (Twitter/X) — 2 a 3 frases curtas e densas por slide',
  editorial: 'editorial — tom de reportagem, específico e factual',
  template01: 'template 1 — blocos de texto com caixa estreita e fixa',
  template02: 'template 2 — capa com destaque marcado e slides de apoio',
};

/** Uma linha "campo: texto (máx N)" por campo refinável presente no slide. */
function describeSlide(slide: RefineSlide, index: number, req: RefineRequest): string {
  const linhas: string[] = [`Slide ${index} (position ${slide.position}):`];

  const campo = (nome: string, valor: string) => {
    const editavel = inScope(req, index, nome) && valor.length > 0;
    const marca = editavel ? `máx ${maxLengthFor(valor)} caracteres` : 'NÃO ALTERE — devolva idêntico';
    linhas.push(`  ${nome} [${marca}]: ${JSON.stringify(valor)}`);
  };

  campo('title', slide.title);
  if (slide.description != null) campo('description', slide.description);
  if (slide.subtitle != null) campo('subtitle', slide.subtitle);

  if (slide.templateSlots != null) {
    linhas.push('  templateSlots (chaves fixas):');
    for (const [chave, valor] of Object.entries(slide.templateSlots)) {
      const editavel = inScope(req, index, chave) && valor.length > 0 && !isImageValue(valor);
      const marca = editavel ? `máx ${maxLengthFor(valor)} caracteres` : 'NÃO ALTERE — devolva idêntico';
      linhas.push(`    ${chave} [${marca}]: ${JSON.stringify(valor)}`);
    }
  }

  return linhas.join('\n');
}

function describeScope(req: RefineRequest): string {
  if (req.scope === 'carousel') {
    return 'ESCOPO: o carrossel inteiro. Refine o texto de todos os slides, respeitando o limite de cada campo.';
  }
  if (req.scope === 'slide') {
    return `ESCOPO: APENAS o slide ${req.slideIndex}. Todos os outros slides voltam idênticos, caractere por caractere.`;
  }
  return `ESCOPO: APENAS o campo "${req.field}" do slide ${req.slideIndex}. Todo o resto — os outros campos deste slide e todos os outros slides — volta idêntico, caractere por caractere.`;
}

export function buildRefinePrompt(req: RefineRequest): string {
  const idioma = req.language
    ? `IDIOMA: escreva em ${LANGUAGE_LABELS[req.language] ?? req.language}.`
    : 'IDIOMA: mantenha o mesmo idioma do texto original.';

  const blocos = [
    `ESTILO DO CARROSSEL: ${STYLE_LABELS[req.style]}.`,
    idioma,
    describeScope(req),
    req.instruction ? `DIREÇÃO DO USUÁRIO: ${req.instruction}` : null,
    '',
    `TEXTO ATUAL (${req.slides.length} slide${req.slides.length > 1 ? 's' : ''}):`,
    req.slides.map((slide, i) => describeSlide(slide, i, req)).join('\n\n'),
    '',
    'Devolva o JSON com TODOS os slides acima, na mesma ordem e com as mesmas positions, incluindo os que você não alterou.',
  ];

  return blocos.filter((b) => b !== null).join('\n');
}
