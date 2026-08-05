import specJson from './spec.json';

/**
 * TEMPLATE 2 — spec tipado + helpers.
 *
 * O `spec.json` é cópia VERBATIM do spec da skill `creatools-template-2` e é
 * read-only: é a régua contra a qual a fidelidade é medida. Este módulo lê dali
 * tudo o que descreve a forma (posição, cor, tipografia, limites) e não redigita
 * número nenhum.
 *
 * Diferença estrutural em relação ao Template 1: o spec do T1 é um dump de nós
 * do Figma (`slides[].nodes[]` com box e tipografia), então o render percorre
 * nós. O do T2 é uma descrição de TOKENS + LAYOUTS, e quem descreve o desenho de
 * verdade é o renderizador de referência (`scripts/generate.py` da skill). Por
 * isso o `Template02Slide.tsx` é um porte do `generate.py`, e nada do motor do
 * T1 (`template01Nodes`, `template01Tops`, o reflow por âncora) vale aqui: o T2
 * centra o grupo título+corpo com flexbox dentro do container de conteúdo, o que
 * já resolve crescimento de texto sozinho.
 */

// ─── Tipos do spec ──────────────────────────────────────────────

export interface Template02ColorToken {
  value: string;
  uso?: string;
  razao?: string;
}

export interface Template02FontToken {
  family: string;
  postScript: string;
  weight: number;
  uso?: string;
}

/** Papel tipográfico do spec — a chave de `tokens.font`. */
export type Template02FontRole = 'display' | 'serif' | 'body' | 'ui';

export interface Template02TypeToken {
  /** Tamanho com as casas decimais do Figma. Arredondar muda a quebra de linha. */
  exact: number;
  normalized: number;
  letterSpacing: number;
  lineHeight: number;
  font: Template02FontRole;
  case?: string;
  align?: string;
}

export type Template02TypeName =
  | 'coverHeadline'
  | 'slideTitle'
  | 'slideBody'
  | 'ctaLabel'
  | 'imageLabel'
  | 'headerMeta';

export interface Template02Grid {
  marginX: number;
  contentTop: number;
  contentBottom: number;
  contentHeight: number;
  verticalCenter: number;
  headerY: number;
  headerMarginX: number;
  imageColumnWidth: number;
  textColumnWidth: number;
  columnGap: number;
  nota?: string;
}

export interface Template02GradientStop {
  pos: number;
  color: string;
  razao?: string;
}

export interface Template02BackgroundLayer {
  z: number;
  tipo: 'imageSlot' | 'gradient' | 'conteudo';
  id?: string;
  focus?: string;
  stops?: Template02GradientStop[];
}

export interface Template02Element {
  id: string;
  tipo: string;
  /** `"auto"` nos elementos centrados da capa. */
  x?: number | string;
  y?: number;
  w?: number;
  h?: number;
  radius?: number;
  paddingX?: number;
  paddingY?: number;
  style?: Template02TypeName;
  color?: string;
  align?: string;
  conteudoExemplo?: string;
}

export type Template02LayoutId = 'cover' | 'content-left' | 'content-right';

export interface Template02Layout {
  id: Template02LayoutId;
  nome: string;
  background: string | { tipo: string; camadas: Template02BackgroundLayer[] };
  elementos: Template02Element[];
}

export interface Template02Limits {
  maxChar?: number;
  maxCharPorLinha?: number;
  maxLinhas?: number;
  regra?: string;
  /** Como o corpo se divide, em português — o prompt da IA cita isto. */
  paragrafos?: string;
  quebra?: string;
  medidoEm?: string;
}

export interface Template02Spec {
  id: string;
  name: string;
  canvas: { width: number; height: number; aspectRatio: string };
  tokens: {
    color: Record<string, Template02ColorToken>;
    font: Record<Template02FontRole, Template02FontToken>;
    /**
     * As duas constantes que valem para TODOS os textos do template:
     * entrelinha = 109.14% do corpo, tracking = -6% nos display e -5% nos de
     * corpo/UI. Cada entrada de `typeScale` já traz os números aplicados; isto
     * é a régua que prova que continuam batendo.
     */
    typeRules: {
      lineHeightRatio: number;
      letterSpacingRatio: { display: number; body: number };
      nota?: string;
    };
    typeScale: Record<Template02TypeName, Template02TypeToken>;
    radius: { none: number; card: number; pill: number };
    grid: Template02Grid;
  };
  chrome: { descricao: string; elementos: Template02Element[] };
  layouts: Template02Layout[];
  regrasDeLayout: { gapTituloCorpo: number; [k: string]: unknown };
  regrasDeGeracao: {
    sequenciaPadrao: Template02LayoutId[];
    limitesDeTexto: Record<string, Template02Limits>;
    [k: string]: unknown;
  };
  camposEditaveis: {
    global: Record<string, { tipo: string; default: string; case?: string; maxChar?: number }>;
    [k: string]: unknown;
  };
}

export const TEMPLATE_02_SPEC = specJson as unknown as Template02Spec;

export const TEMPLATE_02_WIDTH = TEMPLATE_02_SPEC.canvas.width;
export const TEMPLATE_02_HEIGHT = TEMPLATE_02_SPEC.canvas.height;

/** Hex de cada token de cor, pelo nome do spec (`ink`, `paper`, `accent`…). */
export const TEMPLATE_02_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(TEMPLATE_02_SPEC.tokens.color).map(([k, v]) => [k, v.value])
);

export const TEMPLATE_02_GRID = TEMPLATE_02_SPEC.tokens.grid;

// ─── Desvios deliberados do spec ────────────────────────────────

/**
 * AJUSTES DE DESIGN PEDIDOS PELO RAFAEL (dono do produto) — desvios conscientes
 * do spec, e o ÚNICO lugar onde eles existem.
 *
 * O `spec.json` é read-only: é o gabarito contra o qual a fidelidade é medida, e
 * editá-lo apagaria a régua junto com o desvio. Por isso o ajuste vive aqui,
 * como camada por cima, com o valor ORIGINAL do spec anotado ao lado.
 *
 * Critério de fidelidade: 0px contra o gabarito em tudo, EXCETO o que estiver
 * listado aqui.
 */
export const TEMPLATE_02_DESIGN_TWEAKS = {
  /**
   * Família serifada dos títulos internos (`slideTitle`).
   *
   * spec: `Newsreader` (Google Fonts / SIL OFL). O motivo está escrito no
   * próprio spec — *"IvyOra Text é fonte comercial (Ivy Foundry). Precisa de
   * licença de webfont"*.
   *
   * **Esse motivo não vale mais.** O Rafael tem a licença e o projeto web do
   * Adobe Fonts já está carregado (o `<link>` do Typekit em `app/layout.tsx`),
   * servindo a família `ivyora-text`. Ele pediu explicitamente que o serifado do
   * T2 seja IvyOra, como no Template 1.
   *
   * ⚠️ Nunca escreva `'IvyOra Text'` nesta pilha. O app declara um `@font-face`
   * com esse nome que resolve só por `local()`; quando não acha nada, o Chrome
   * trata a família como definida-e-vazia e pula direto para a `serif` genérica
   * (Georgia) em vez de cair no `T01Serif`. Medido no T1: 334px contra 305px.
   * `ivyora-text` não tem esse problema porque é uma face que baixa de verdade:
   * se o download falhar, a família some da cascata e o próximo nome vale.
   */
  serif: {
    spec: TEMPLATE_02_SPEC.tokens.font.serif.family, // 'Newsreader'
    stack: "'ivyora-text', 'T01Serif', serif",
    motivo: 'Rafael tem a licença da IvyOra; o Typekit já serve `ivyora-text`.',
  },
} as const;

/**
 * DIVERGÊNCIAS CONHECIDAS CONTRA O GABARITO (`scripts/generate.py` da skill).
 *
 * Quem rodar o `generate.py` e comparar com o app VAI ver diferença. São estas
 * três, todas deliberadas e todas já decididas — a lista existe para ninguém
 * recomeçar a investigação. Fora daqui, a conferência de 05/08/2026 mediu
 * **0.00px** em toda a geometria do spec (bloco de imagem, coluna de texto,
 * container da headline, pílula de CTA, scrim, canvas).
 *
 * O critério, então, é: 0px contra o gabarito EXCETO nos três itens abaixo.
 */
export const TEMPLATE_02_GABARITO_DIVERGENCES = [
  {
    o_que: 'família serifada dos títulos internos',
    gabarito: 'Newsreader (Google Fonts)',
    aqui: "'ivyora-text', 'T01Serif', serif",
    porque:
      'O spec trocou a IvyOra por Newsreader alegando licença comercial. O motivo caducou: ' +
      'o Rafael tem a licença, o Typekit já está no layout.tsx e ele pediu IvyOra. ' +
      'Ver TEMPLATE_02_DESIGN_TWEAKS.serif.',
  },
  {
    o_que: 'margem horizontal do cabeçalho',
    gabarito: '85px (o generate.py usa `grid.marginX`)',
    aqui: '71px (`grid.headerMarginX`)',
    porque:
      'O spec diz 71 em três lugares (grid.headerMarginX e os dois chrome.elementos[].x) e ' +
      'ainda lista o 71/63 do Figma em `inconsistenciasDetectadas` recomendando normalizar ' +
      'para 71/71. No Figma o cabeçalho é MAIS largo que o conteúdo; o generate.py colapsou ' +
      'as duas margens numa só. Onde o gabarito contradiz o spec E o spec explica o próprio ' +
      'número, vale o spec. Decidido pelo Orquestrador em 05/08/2026.',
  },
  {
    o_que: 'família de `body` e `ui` (corpo, CTA, cabeçalho, label da imagem)',
    gabarito: "'Inter'",
    aqui: "'T01InterDisplay' (o corte Display, como o spec manda)",
    porque:
      'O spec pede `Inter Display` (postScript InterDisplay-Regular/Medium). O generate.py ' +
      'colapsa os três papéis em Inter porque só carrega essa família do Google Fonts, que ' +
      'não serve o corte Display — o próprio spec anota isso em `riscosDeImplementacao`. ' +
      'É limitação do gabarito, não decisão de desenho. Efeito visível: o corpo quebra em ' +
      'MENOS linhas que no PNG de referência, ou seja, os limites de caractere do spec ' +
      'continuam valendo com folga e nunca estouram. Decidido pelo Orquestrador em 05/08/2026.',
  },
] as const;

/**
 * Família CSS de cada papel tipográfico.
 *
 * As sem-serifa são as faces já embutidas em `app/globals.css` (`T01Inter`,
 * `T01InterDisplay`), prefixadas para não colidirem com as do resto do app.
 * A serifada é o desvio acima.
 *
 * 🔸 `body` e `ui` seguem o SPEC (`Inter Display`, o corte optical-size). O
 * `generate.py` colapsa os três papéis em `'Inter'` porque carrega só a família
 * `Inter` do Google Fonts, que não serve o corte Display — limitação do
 * gabarito, não decisão de desenho. Aqui as duas faces existem localmente, então
 * o spec manda.
 */
const FONT_STACK: Record<Template02FontRole, string> = {
  display: "'T01Inter', sans-serif",
  body: "'T01InterDisplay', sans-serif",
  ui: "'T01InterDisplay', sans-serif",
  serif: TEMPLATE_02_DESIGN_TWEAKS.serif.stack,
};

export function template02FontStack(role: Template02FontRole): string {
  return FONT_STACK[role];
}

// ─── Tipografia ─────────────────────────────────────────────────

export interface Template02Type {
  fontFamily: string;
  /** Dízima de propósito (76.5495px) — fidelidade ao Figma. */
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  fontWeight: number;
  /** `true` quando o spec marca o bloco como caixa-alta. */
  upper: boolean;
}

/** Tipografia de um papel do spec, já com a família resolvida. */
export function template02Type(name: Template02TypeName): Template02Type {
  const t = TEMPLATE_02_SPEC.tokens.typeScale[name];
  return {
    fontFamily: template02FontStack(t.font),
    fontSize: t.exact,
    letterSpacing: t.letterSpacing,
    lineHeight: t.lineHeight,
    fontWeight: TEMPLATE_02_SPEC.tokens.font[t.font].weight,
    upper: t.case === 'UPPERCASE',
  };
}

// ─── Modelos ────────────────────────────────────────────────────
//
// O template tem 3 MODELOS de slide (capa, conteúdo-à-esquerda,
// conteúdo-à-direita) e, ao contrário do T1, NÃO tem número fixo de slides — o
// deck padrão é 5, mas o usuário adiciona quantos quiser alternando os modelos
// 2 e 3.
//
// 🔴 O modelo é DADO do slide (`Slide.templateModel`), nunca a posição. Deck
// reordenado, com modelo repetido ou com 12 slides continua desenhando certo.

export const TEMPLATE_02_MODELS: number[] = [1, 2, 3];

/** Modelo → layout do spec, na ordem de `layouts`. */
export const TEMPLATE_02_MODEL_LAYOUTS: Record<number, Template02LayoutId> = {
  1: 'cover',
  2: 'content-left',
  3: 'content-right',
};

/** O deck padrão do spec (`regrasDeGeracao.sequenciaPadrao`), em modelos. */
export const TEMPLATE_02_DEFAULT_MODELS: number[] =
  TEMPLATE_02_SPEC.regrasDeGeracao.sequenciaPadrao.map(
    (id) => Number(Object.keys(TEMPLATE_02_MODEL_LAYOUTS).find((m) => TEMPLATE_02_MODEL_LAYOUTS[Number(m)] === id))
  );

export function isTemplate02Model(value: unknown): value is number {
  return typeof value === 'number' && TEMPLATE_02_MODELS.includes(value);
}

/** Só o que interessa do slide para resolver o modelo. */
export interface Template02Modeled {
  templateModel?: number;
}

/**
 * O modelo do slide.
 *
 * 🔴 COMPATIBILIDADE: deck salvo (ou recém-gerado) sem `templateModel` deriva o
 * modelo da POSIÇÃO, seguindo a `sequenciaPadrao` do spec: posição 0 é a capa e
 * daí em diante alterna 2, 3, 2, 3… Nunca dois iguais seguidos.
 */
export function template02ModelOf(
  slide: Template02Modeled | null | undefined,
  position: number
): number {
  if (isTemplate02Model(slide?.templateModel)) return slide.templateModel;
  return template02ModelAt(position);
}

/**
 * O modelo que a POSIÇÃO pede, seguindo a `sequenciaPadrao` do spec: a capa
 * primeiro, e daí em diante alternando 2, 3, 2, 3…
 *
 * A geração usa isto para GRAVAR `templateModel` em cada slide. Deixar o modelo
 * sair da posição na hora de desenhar é o que quebra quando o usuário reordena
 * ou insere um slide no meio — por isso ele é gravado, não inferido.
 */
export function template02ModelAt(position: number): number {
  const p = Math.max(0, Math.trunc(position));
  if (p === 0) return 1;
  return p % 2 === 1 ? 2 : 3;
}

/**
 * O próximo modelo da alternância. Depois da capa vem o modelo 2; depois de um
 * slide de conteúdo vem o outro. É a regra `alternancia` do spec.
 */
export function template02NextModel(model: number): number {
  return model === 2 ? 3 : 2;
}

/** O layout do spec de um modelo. Cai na capa se pedirem um inexistente. */
export function template02LayoutOf(model: number): Template02Layout {
  const id = TEMPLATE_02_MODEL_LAYOUTS[model] ?? 'cover';
  return TEMPLATE_02_SPEC.layouts.find((l) => l.id === id) ?? TEMPLATE_02_SPEC.layouts[0];
}

/** `x` de um elemento do layout — os slides internos espelham por este número. */
export function template02ElementX(model: number, elementId: string): number {
  const el = template02LayoutOf(model).elementos.find((e) => e.id === elementId);
  return typeof el?.x === 'number' ? el.x : 0;
}

/** Fundo chapado do modelo: preto na capa, creme nos internos. */
export function template02Background(model: number): string {
  return model === 1 ? TEMPLATE_02_COLORS.ink : TEMPLATE_02_COLORS.paper;
}

// ─── Adaptação de formato ───────────────────────────────────────
//
// Os três formatos (4:5 · 1:1 · 9:16) compartilham a LARGURA 1080 — só a altura
// muda (ver `lib/formats.ts`). Nada horizontal se mexe.
//
// 🔴 No 4:5 toda conta daqui tem de ser NO-OP: se algo mudar 1px ali, a régua
// contra o gabarito já era. Por isso as distâncias são ABSOLUTAS (medidas do
// topo ou do rodapé), nunca proporcionais — margem que escala vira margem
// gigante no 9:16.

/** Distância ABSOLUTA da base do bloco de conteúdo ao rodapé: 1350 − 1236. */
const CONTENT_BOTTOM_GAP = TEMPLATE_02_HEIGHT - TEMPLATE_02_GRID.contentBottom;

/**
 * Caixa do conteúdo dos slides internos: mesmo `top` do spec e a mesma distância
 * do rodapé, em qualquer formato. O bloco de imagem e a coluna de texto usam a
 * MESMA caixa — o centro vertical do texto acompanha sozinho.
 */
export function template02ContentBox(height: number): { top: number; height: number } {
  return {
    top: TEMPLATE_02_GRID.contentTop,
    height: height - TEMPLATE_02_GRID.contentTop - CONTENT_BOTTOM_GAP,
  };
}

/** Distância ABSOLUTA da headline da capa ao rodapé: 1350 − 755. */
const COVER_HEADLINE_BOTTOM = TEMPLATE_02_HEIGHT - 755;
/** Distância ABSOLUTA da pílula de CTA ao rodapé: 1350 − 1127. */
const COVER_PILL_BOTTOM = TEMPLATE_02_HEIGHT - 1127;

/**
 * `top` da headline e da pílula de CTA da capa. As duas são ancoradas ao RODAPÉ:
 * a imagem e o scrim são full-bleed e acompanham a altura, mas a composição de
 * texto encosta embaixo.
 */
export function template02CoverTops(height: number): { headline: number; pill: number } {
  return {
    headline: height - COVER_HEADLINE_BOTTOM,
    pill: height - COVER_PILL_BOTTOM,
  };
}

/** `y` do cabeçalho — absoluto em todo formato. */
export const TEMPLATE_02_HEADER_Y = TEMPLATE_02_GRID.headerY;

/**
 * Margem horizontal do cabeçalho.
 *
 * 🔸 Vem do spec (`grid.headerMarginX` = 71, e `chrome.elementos[].x` = 71). O
 * Figma original tinha 71 à esquerda e 63 à direita — o spec lista isso em
 * `inconsistenciasDetectadas` e recomenda normalizar para 71/71, que é o que
 * fazemos.
 *
 * O `generate.py` usa `grid.marginX` (85) nos dois lados. É divergência do
 * gabarito em relação ao próprio spec; aqui manda o spec, que é a fonte da
 * verdade da forma e diz 71 em três lugares.
 */
export const TEMPLATE_02_HEADER_MARGIN_X = TEMPLATE_02_GRID.headerMarginX;

// ─── Slots ──────────────────────────────────────────────────────
//
// As chaves são as do spec e NÃO mudam: é o que fica gravado no `templateSlots`
// de todo carrossel salvo. Rótulo é só interface.

/** Texto ou URL de imagem por slot, ex: `{ 'content.title': 'Marca não é logo' }`. */
export type Template02Slots = Record<string, string>;

export interface Template02SlotDescriptor {
  slot: string;
  kind: 'text' | 'image';
  /** Rótulo da barra lateral. É só interface — a CHAVE do slot nunca muda. */
  label: string;
  /**
   * `deck` = vale para o carrossel inteiro (o cabeçalho, editado uma vez só).
   * `slide` = por slide.
   */
  scope: 'slide' | 'deck';
  /** Ordem VISUAL do campo no slide — a barra lateral segue esta ordem. */
  order: number;
  /** Quebras manuais (`\n`) fazem parte do conteúdo. */
  multiline: boolean;
  /** O spec marca o bloco como caixa-alta. */
  upper: boolean;
  maxLines?: number;
  maxCharsPerLine?: number;
  maxChars?: number;
  /** Texto de exemplo do spec; usado quando o slot não foi preenchido. */
  defaultValue: string;
}

interface SlotDef {
  slot: string;
  models: number[];
  kind: 'text' | 'image';
  label: string;
  scope: 'slide' | 'deck';
  order: number;
  multiline: boolean;
  /** Papel tipográfico, para derivar a caixa-alta do spec. */
  style?: Template02TypeName;
}

/**
 * Os slots do template, na ordem visual do slide.
 *
 * `content.*` repete entre os slides de conteúdo e isso está certo:
 * `templateSlots` é por slide, então não há colisão. Só `header.*` é global.
 */
const SLOT_DEFS: SlotDef[] = [
  { slot: 'header.category', models: [1, 2, 3], kind: 'text',  label: 'Categoria',       scope: 'deck',  order: 0, multiline: false, style: 'headerMeta' },
  { slot: 'header.handle',   models: [1, 2, 3], kind: 'text',  label: '@ do perfil',     scope: 'deck',  order: 1, multiline: false, style: 'headerMeta' },
  { slot: 'cover.image',     models: [1],       kind: 'image', label: 'Imagem de fundo', scope: 'slide', order: 2, multiline: false },
  { slot: 'cover.headline',  models: [1],       kind: 'text',  label: 'Título',          scope: 'slide', order: 3, multiline: true,  style: 'coverHeadline' },
  { slot: 'cover.highlight', models: [1],       kind: 'text',  label: 'Destaque',        scope: 'slide', order: 4, multiline: false, style: 'coverHeadline' },
  { slot: 'cover.cta',       models: [1],       kind: 'text',  label: 'Chamada',         scope: 'slide', order: 5, multiline: false, style: 'ctaLabel' },
  { slot: 'content.image',   models: [2, 3],    kind: 'image', label: 'Imagem',          scope: 'slide', order: 2, multiline: false },
  { slot: 'content.title',   models: [2, 3],    kind: 'text',  label: 'Título',          scope: 'slide', order: 3, multiline: false, style: 'slideTitle' },
  { slot: 'content.body',    models: [2, 3],    kind: 'text',  label: 'Descrição',       scope: 'slide', order: 4, multiline: true,  style: 'slideBody' },
];

/** Todos os slots do template, sem repetição. */
export const TEMPLATE_02_SLOTS: string[] = SLOT_DEFS.map((d) => d.slot);

export function template02SlotLabel(slot: string, fallback = ''): string {
  return SLOT_DEFS.find((d) => d.slot === slot)?.label ?? fallback ?? slot;
}

/**
 * Limites de texto de um slot — lidos de `regrasDeGeracao.limitesDeTexto`.
 *
 * O spec fala duas línguas: `maxCharPorLinha` na headline (que tem quebra
 * manual) e `maxChar` (total) nos demais. As duas viram campos distintos aqui em
 * vez de virarem uma média — são regras diferentes.
 */
function limitsOf(slot: string): Pick<
  Template02SlotDescriptor,
  'maxLines' | 'maxCharsPerLine' | 'maxChars'
> {
  const l = TEMPLATE_02_SPEC.regrasDeGeracao.limitesDeTexto[slot] ?? {};
  return {
    maxLines: l.maxLinhas,
    maxCharsPerLine: l.maxCharPorLinha,
    maxChars: l.maxChar,
  };
}

/**
 * Conteúdo de fábrica de um slot, no modelo pedido.
 *
 * Os textos do cabeçalho vêm de `camposEditaveis.global`; os do slide, do
 * `conteudoExemplo` do elemento no layout — e por isso `content.title` do modelo
 * 2 é diferente do modelo 3, exatamente como no spec.
 */
/**
 * Slot → id do elemento no spec, quando os dois nomes divergem.
 *
 * A pílula do CTA é dois elementos no spec (`cover.ctaPill`, o retângulo, e
 * `cover.ctaText`, o texto). Para quem edita é um campo só — a `Chamada` — e o
 * nome do slot é o do SKILL.md (`cta`).
 */
const SPEC_ELEMENT_ID: Record<string, string> = {
  'cover.cta': 'cover.ctaText',
};

function defaultValueOf(slot: string, model: number): string {
  const global = TEMPLATE_02_SPEC.camposEditaveis.global[slot];
  if (global) return global.default;
  // O spec não dá `conteudoExemplo` para o marcador. Ele sai da primeira linha
  // do headline de fábrica: `inconsistenciasDetectadas` conta que no Figma o
  // lime cobria a linha 1 e só "NOVA TIPOGRAFIA" ficou com o texto em preto.
  if (slot === 'cover.highlight') return 'NOVA TIPOGRAFIA';
  const id = SPEC_ELEMENT_ID[slot] ?? slot;
  const el = template02LayoutOf(model).elementos.find((e) => e.id === id);
  return el?.conteudoExemplo ?? '';
}

/** Descritores dos slots de um modelo (inclui os globais do cabeçalho). */
export function template02SlotsForModel(model: number): Template02SlotDescriptor[] {
  return SLOT_DEFS.filter((d) => d.models.includes(model))
    .map((d) => ({
      slot: d.slot,
      kind: d.kind,
      label: d.label,
      scope: d.scope,
      order: d.order,
      multiline: d.multiline,
      upper: d.style ? template02Type(d.style).upper : false,
      ...limitsOf(d.slot),
      defaultValue: d.kind === 'image' ? '' : defaultValueOf(d.slot, model),
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Slots de TEXTO do slide, sem o cabeçalho.
 *
 * O cabeçalho é do DECK e tem painel próprio (editar num slide e ver os outros
 * divergirem seria bug, não liberdade) — por isso ele sai daqui.
 */
export function template02TextSlotsForModel(model: number): Template02SlotDescriptor[] {
  return template02SlotsForModel(model).filter((d) => d.kind === 'text' && d.scope === 'slide');
}

/** Os slots globais do cabeçalho, na ordem em que aparecem no slide. */
export function template02HeaderSlotsForModel(model: number): Template02SlotDescriptor[] {
  return template02SlotsForModel(model).filter((d) => d.scope === 'deck');
}

/** Papel tipográfico de um slot, ou `undefined` nos slots de imagem. */
export function template02SlotType(slot: string): Template02TypeName | undefined {
  return SLOT_DEFS.find((d) => d.slot === slot)?.style;
}

/**
 * Tipografia de FÁBRICA de um slot — o que a barra lateral mostra quando o
 * usuário ainda não mexeu em nada.
 *
 * O `letterSpacing` sai em `em` porque é assim que `templateSlotStyles` grava (o
 * mesmo formato do Template 1). O spec guarda em px; a razão entre os dois é
 * exatamente o `letterSpacingRatio` do `typeRules`.
 */
export function template02SlotDefaults(
  slot: string
): { fontSizePx: number; letterSpacingEm: number } | undefined {
  const name = template02SlotType(slot);
  if (!name) return undefined;
  const t = template02Type(name);
  return { fontSizePx: t.fontSize, letterSpacingEm: t.letterSpacing / t.fontSize };
}

/**
 * Cor de FÁBRICA de um slot, lida do spec.
 *
 * Existe para o seletor de cor abrir mostrando o que está NA TELA, nunca um
 * padrão do editor. O cabeçalho da capa é o caso torto: a cor dele é
 * condicional à imagem de fundo (`regraCabecalho`), e o que devolvemos aqui é a
 * cor-base — é ela que o controle substitui quando o usuário escolhe outra.
 */
export function template02SlotColor(slot: string, model: number): string {
  if (slot === 'cover.highlight') return TEMPLATE_02_COLORS.ink;
  const id = SPEC_ELEMENT_ID[slot] ?? slot;
  const el =
    template02LayoutOf(model).elementos.find((e) => e.id === id) ??
    TEMPLATE_02_SPEC.chrome.elementos.find((e) => e.id === id);
  return TEMPLATE_02_COLORS[el?.color ?? ''] ?? TEMPLATE_02_COLORS.ink;
}

/** Slot de imagem do modelo: o fundo da capa, ou o bloco 380×1089 dos internos. */
export function template02ImageSlot(model: number): string {
  return model === 1 ? 'cover.image' : 'content.image';
}

/** Conteúdo original do spec — estado inicial de um slide daquele modelo. */
export function template02DefaultSlots(model: number): Template02Slots {
  const out: Template02Slots = {};
  for (const d of template02SlotsForModel(model)) {
    if (d.kind === 'text') out[d.slot] = d.defaultValue;
  }
  return out;
}

// ─── Conteúdo gerado ────────────────────────────────────────────

/**
 * Par primário de cada modelo — por onde o conteúdo genérico do wizard
 * (título + descrição por slide) entra no template.
 *
 * A capa não tem corpo: ela é headline + marcador + chamada. O `description` que
 * o wizard traz para a posição 0 não tem onde caber, e é descartado de
 * propósito — inventar um bloco para ele mudaria o desenho do template.
 */
export const TEMPLATE_02_PRIMARY_SLOTS: Record<number, { title: string; body?: string }> = {
  1: { title: 'cover.headline' },
  2: { title: 'content.title', body: 'content.body' },
  3: { title: 'content.title', body: 'content.body' },
};

/**
 * Slots de texto que NÃO são o par primário — o marcador e a chamada da capa.
 *
 * Eles existem no desenho e a IA precisa escrevê-los: o texto de fábrica do spec
 * ("CHAMADA PARA AÇÃO", o headline do FC Barcelona) é ilustrativo e não pode
 * sobrar num carrossel gerado. A chave é o nome curto do contrato da IA; o
 * valor, o slot do spec.
 */
export const TEMPLATE_02_EXTRA_SLOTS: Record<number, Record<string, string>> = {
  1: { highlight: 'cover.highlight', cta: 'cover.cta' },
};

export interface Template02ContentInput {
  title: string;
  description: string;
  imageUrl?: string;
  /** Slots secundários, pelo nome curto do contrato da IA (`highlight`, `cta`). */
  extras?: Record<string, string>;
}

/**
 * Monta os slots de um slide gerado.
 *
 * REGRA DURA, herdada do Template 1: um deck gerado não pode exibir NENHUM texto
 * ilustrativo do spec. Por isso todo slot de texto do slide sai preenchido — com
 * o que a IA escreveu ou, na falta, com string VAZIA. Vazio é pior visualmente
 * que o headline do FC Barcelona? Não: o texto do spec é uma mentira sobre o
 * conteúdo do usuário, e o vazio ele conserta num campo da barra lateral.
 *
 * O caminho "sem slots" (`templateSlots` ausente) continua caindo no texto do
 * spec — é dele que sai a fidelidade de 0px, e nada aqui o toca.
 */
export function template02SlotsFromContent(
  model: number,
  input: Template02ContentInput
): Template02Slots {
  const primary = TEMPLATE_02_PRIMARY_SLOTS[model];
  if (!primary) return {};

  const slots: Template02Slots = {};
  for (const d of template02TextSlotsForModel(model)) slots[d.slot] = '';

  if (input.title.trim()) slots[primary.title] = input.title.trim();
  if (primary.body && input.description.trim()) slots[primary.body] = input.description.trim();

  for (const [key, slot] of Object.entries(TEMPLATE_02_EXTRA_SLOTS[model] ?? {})) {
    const value = input.extras?.[key];
    if (typeof value === 'string' && value.trim()) slots[slot] = value.trim();
  }

  if (input.imageUrl) slots[template02ImageSlot(model)] = input.imageUrl;
  return slots;
}

/**
 * Cabeçalho de um deck gerado: assinatura e @ do usuário. São dados DELE (marca
 * e handle do onboarding), não estilo — por isso a geração pode escrevê-los. Sem
 * marca nem handle o slot sai vazio, nunca com o "@OANDRELONA" do spec.
 */
export function template02HeaderSlots(brandName?: string, handle?: string): Template02Slots {
  const at = (handle ?? '').trim().replace(/^@+/, '');
  return {
    'header.category': (brandName ?? '').trim().toUpperCase(),
    'header.handle': at ? `@${at.toUpperCase()}` : '',
  };
}

// ─── Marcador da capa ───────────────────────────────────────────

/**
 * Índice da linha do headline que contém o marcador, ou -1.
 *
 * A regra do spec é "o marcador nunca cruza duas linhas": como o destaque é
 * procurado DENTRO de cada linha, ele é estruturalmente impossível de cruzar —
 * ou cabe numa linha, ou não aparece. Esta função é o que o render e a validação
 * usam para saber qual é o caso.
 */
export function template02HighlightLine(headline: string, highlight?: string): number {
  const h = (highlight ?? '').trim();
  if (!h) return -1;
  return headline.split('\n').findIndex((line) => line.includes(h));
}

// ─── Medição contra os limites ──────────────────────────────────

export interface Template02SlotMeasure {
  lines: number;
  longestLine: number;
  chars: number;
  over: boolean;
}

/**
 * Mede um slot contra os limites do spec.
 *
 * `maxCharsPerLine` só existe onde a quebra é MANUAL (a headline da capa): ali o
 * limite é por linha escrita. Nos demais o que vale é o total de caracteres —
 * a quebra é do navegador e contar `\n` não diria nada.
 *
 * `maxLines` do corpo é o teto de linhas RENDERIZADAS, que só o navegador sabe;
 * aqui ele serve para pegar o caso grosseiro (parágrafos demais). O limite que
 * de fato prende o corpo é o de caracteres.
 */
export function template02Measure(
  value: string,
  limits: { maxLines?: number; maxCharsPerLine?: number; maxChars?: number }
): Template02SlotMeasure {
  const lines = value.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const overLines = limits.maxLines != null && lines.length > limits.maxLines;
  const overPerLine = limits.maxCharsPerLine != null && longest > limits.maxCharsPerLine;
  const overChars = limits.maxChars != null && value.length > limits.maxChars;
  return {
    lines: lines.length,
    longestLine: longest,
    chars: value.length,
    over: overLines || overPerLine || overChars,
  };
}

export interface Template02Overflow extends Template02SlotMeasure {
  slot: string;
  maxLines?: number;
  maxCharsPerLine?: number;
  maxChars?: number;
}

/** Confere os limites de todos os slots de texto de um slide. */
export function template02Overflows(model: number, slots: Template02Slots): Template02Overflow[] {
  const out: Template02Overflow[] = [];
  for (const d of template02SlotsForModel(model)) {
    if (d.kind !== 'text') continue;
    const value = slots[d.slot];
    // O conteúdo de fábrica não é auditado: os limites são estéticos e o texto
    // que veio do Figma passa de alguns sem estourar a caixa. Acusar o que já
    // está no template só ensinaria a ignorar o aviso.
    if (value == null || value === d.defaultValue) continue;
    const m = template02Measure(value, d);
    if (m.over) {
      out.push({
        slot: d.slot,
        maxLines: d.maxLines,
        maxCharsPerLine: d.maxCharsPerLine,
        maxChars: d.maxChars,
        ...m,
      });
    }
  }
  return out;
}

// ─── Contrato da geração por IA ─────────────────────────────────

/**
 * TEMPLATE 2 — a CAPA não tem o par título/descrição dos outros slides: ela é
 * uma headline de quebra manual, um marcador e uma chamada. Sem estes campos ela
 * sairia com a copy ilustrativa do spec (o headline do FC Barcelona, o "CHAMADA
 * PARA AÇÃO") em todo carrossel gerado.
 *
 * Usa o mesmo mecanismo `extras` que o Template 1 já criou — não há campo novo
 * no `CarouselAIResponse`.
 *
 * 🔴 Os limites são LIDOS de `regrasDeGeracao.limitesDeTexto` do spec, nunca
 * redigitados: eles foram medidos contra a caixa do desenho, e uma cópia à mão
 * envelheceria em silêncio na primeira vez que o spec mudasse.
 */
export function template02Addendum(): string {
  const L = TEMPLATE_02_SPEC.regrasDeGeracao.limitesDeTexto;
  const headline = L['cover.headline'];
  const titulo = L['content.title'];
  const corpo = L['content.body'];

  return `

TEMPLATE 2 — a CAPA é diferente dos demais slides.

O slide 1 é a capa e NÃO tem descrição. Nele:
- "title" é a headline, em CAIXA ALTA, com as quebras de linha escritas por você
  usando \\n. Máximo ${headline.maxLinhas} linhas e ${headline.maxCharPorLinha} caracteres POR LINHA — acima
  disso o texto vaza a caixa de 836px do desenho. Quebre por SENTIDO, e nunca
  deixe uma linha com uma palavra só.
- "description" do slide 1 é ignorada. Não gaste texto nela.
- "extras": { "highlight": "...", "cta": "..." }
  · highlight é o trecho que recebe o marcador amarelo. Ele TEM de estar contido
    em UMA ÚNICA linha da headline, escrito exatamente igual — se não estiver, o
    marcador simplesmente não aparece e o usuário não descobre por quê. Escolha a
    palavra que carrega a tensão da frase, nunca um conectivo.
  · cta é a chamada da pílula, em CAIXA ALTA, até ${L['cover.cta'].maxChar} caracteres.

Nos demais slides (2 em diante), "title" e "description" são usados normalmente:
- title: até ${titulo.maxChar} caracteres, no máximo ${titulo.maxLinhas} linhas.
- description: até ${corpo.maxChar} caracteres, ${corpo.paragrafos}.
Cada slide entrega UMA ideia: o título é a afirmação, a descrição é a
justificativa. Se o título precisa da descrição para fazer sentido, ele está
fraco. O último slide fecha com consequência ou virada, nunca com "e é isso".

Nunca devolva texto de exemplo, nome de marca ou assunto que não sejam os do
tema pedido.`;
}

// ─── Lorem ipsum dentro dos limites ─────────────────────────────

/**
 * Palavras do lorem clássico. Fonte única para todo texto de exemplo: nenhum
 * slide novo pode nascer com a copy do spec ("FC Barcelona", "@OANDRELONA",
 * "BRANDING & DESIGN DE MARCA") — isso é conteúdo ilustrativo de outra marca.
 */
const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
];

/**
 * Texto de exemplo com no MÁXIMO `budget` caracteres, cortado em palavra
 * inteira. Determinístico: a mesma entrada dá sempre a mesma saída, senão os
 * testes de limite virariam loteria.
 */
function loremUpTo(budget: number, offset = 0): string {
  if (budget <= 0) return '';
  let out = '';
  for (let i = 0; out.length < budget; i++) {
    const word = LOREM_WORDS[(i + offset) % LOREM_WORDS.length];
    const next = out ? `${out} ${word}` : word;
    if (next.length > budget) break;
    out = next;
  }
  if (!out) out = LOREM_WORDS[offset % LOREM_WORDS.length].slice(0, budget);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Fração do orçamento que o lorem ocupa.
 *
 * O limite pressupõe empacotamento perfeito, e a quebra real do navegador
 * desperdiça o fim de cada linha. Encher o orçamento faria o texto transbordar
 * para uma linha a mais no render mesmo com o contador no verde — exatamente o
 * estouro que o slide novo não pode ter.
 */
const LOREM_FILL = 0.7;

/** Texto de exemplo de UM slot, dentro dos limites dele. */
export function template02LoremForSlot(d: Template02SlotDescriptor): string {
  let text: string;
  if (d.maxCharsPerLine != null) {
    // Quebra manual: o exemplo já nasce quebrado, senão a linha única estoura o
    // limite POR LINHA e o contador da barra lateral abriria no vermelho.
    const perLine = Math.max(1, Math.floor(d.maxCharsPerLine * LOREM_FILL));
    const lines = Math.max(1, (d.maxLines ?? 3) - 1);
    text = Array.from({ length: lines }, (_, i) => loremUpTo(perLine, i * 3)).join('\n');
  } else if (d.maxChars != null) {
    text = loremUpTo(Math.max(1, Math.floor(d.maxChars * LOREM_FILL)));
  } else {
    text = loremUpTo(40);
  }
  return d.upper ? text.toUpperCase() : text;
}

/**
 * Slots de um slide NOVO do modelo pedido: lorem em todo slot de texto, imagem
 * vazia (o usuário escolhe a dele) e o cabeçalho herdado do deck.
 *
 * O cabeçalho não é lorem: é marca e @ do usuário, vindos do onboarding, e vale
 * para o deck inteiro — copiá-lo do slide vizinho é o que mantém a regra.
 */
export function template02NewSlideSlots(
  model: number,
  inheritedHeader?: Template02Slots
): Template02Slots {
  const out: Template02Slots = {};
  for (const d of template02SlotsForModel(model)) {
    if (d.scope === 'deck') {
      out[d.slot] = inheritedHeader?.[d.slot] ?? '';
      continue;
    }
    if (d.kind === 'text') out[d.slot] = template02LoremForSlot(d);
  }
  // O marcador tem de caber numa linha do headline: a primeira linha É o valor,
  // então a regra do spec nasce satisfeita.
  if (out['cover.headline']) out['cover.highlight'] = out['cover.headline'].split('\n')[0];
  return out;
}
