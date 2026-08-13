/**
 * TEMPLATE 1 — carrossel de 6 slides extraído do Figma.
 *
 * `spec.json` é a fonte da verdade da FORMA (posição, cor, tipografia, degradê)
 * e é uma cópia verbatim de `.claude/skills/creatools-template-01/template-01.spec.json`.
 * Nunca edite o spec aqui: reextraia na skill e copie de volta.
 *
 * A única coisa que varia entre carrosséis é o texto dos slots e as imagens —
 * tudo o resto é imutável. Este módulo só expõe o spec tipado e os helpers de
 * conteúdo; quem desenha é `components/slides/Template01Slide.tsx`.
 */
import specJson from './spec.json';

// ─── Formato do spec ────────────────────────────────────────────

export interface SpecBox {
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
}

export interface SpecPaint {
  type: string;
  blendMode?: string;
  opacity?: number;
  visible?: boolean;
  color?: string;
  alpha?: number;
  css?: string;
  /** Só nos paints de degradê — os slides 1 e 2 do Template 1. */
  stops?: { color: string; alpha?: number; position?: number }[];
}

export interface SpecTypography {
  fontFamily: string;
  fontPostScriptName: string;
  fontStyle: string;
  fontWeight: number | null;
  italic: boolean;
  fontSizePx: number;
  lineHeightPx: number;
  lineHeightRatio: number;
  letterSpacingPx: number;
  letterSpacingEm: number;
  textAlignHorizontal: string;
  textAlignVertical: string;
  textAutoResize: string;
  textCase: string;
}

export interface SpecStyledRun {
  styleKey: string;
  start: number;
  end: number;
  text: string;
  override?: {
    fontFamily?: string;
    fontPostScriptName?: string;
    fontStyle?: string;
    fontWeight?: number;
    italic?: boolean;
    fills?: SpecPaint[];
  };
}

export interface SpecText {
  characters: string;
  lines: string[];
  lineCount: number;
  maxLineChars: number;
  totalChars: number;
  styledRuns?: SpecStyledRun[];
}

export interface SpecNode {
  id: string;
  name: string;
  type: 'TEXT' | 'RECTANGLE' | 'VECTOR' | 'GROUP';
  box: SpecBox;
  opacity: number;
  blendMode: string;
  fills?: SpecPaint[];
  strokes?: SpecPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  cornerRadius?: number;
  rotationDeg?: number;
  arrowHeadWidth?: number;
  text?: SpecText;
  typography?: SpecTypography;
  anchor?: { mode: 'left' | 'right' | 'center-x' };
  slot?: string;
  role?: string;
  editable?: boolean;
}

export interface SpecBackgroundLayer {
  z: number;
  type: 'IMAGE_SLOT' | 'GRADIENT_SCRIM';
  slot?: string;
  css?: string;
  fit?: string;
  position?: string;
  size?: string;
  note?: string;
}

export interface SpecSlide {
  index: number;
  figmaId: string;
  figmaName: string;
  canvas: { w: number; h: number };
  background: SpecPaint[];
  clipsContent: boolean;
  nodes: SpecNode[];
  backgroundLayers?: SpecBackgroundLayer[];
}

export interface SpecSlotInfo {
  figmaId: string;
  role: string;
  editable: boolean;
  type?: string;
  maxLines?: number;
  maxCharsPerLine?: number;
  font?: string;
  size?: string;
  note?: string;
}

export interface TemplateSpec {
  $schema: string;
  template: {
    id: string;
    figmaFileKey: string;
    figmaFileName: string;
    slideCount: number;
    canvas: { w: number; h: number };
  };
  slides: SpecSlide[];
  slotIndex: Record<string, SpecSlotInfo>;
}

export const TEMPLATE_01_SPEC = specJson as unknown as TemplateSpec;

// ─── Desvios deliberados do Figma ───────────────────────────────

/**
 * AJUSTES DE DESIGN PEDIDOS PELO RAFAEL (dono do produto) — desvios conscientes
 * do Figma, e o ÚNICO lugar onde eles existem.
 *
 * O `spec.json` e o `slots.json` da skill são read-only: são o gabarito contra o
 * qual a fidelidade é medida, e editá-los apagaria a régua junto com o desvio.
 * Por isso o ajuste vive aqui, como uma camada por cima do spec, com o valor
 * ORIGINAL do Figma anotado ao lado de cada entrada.
 *
 * O critério de fidelidade passa a ser: 0 px contra o gabarito em tudo, EXCETO
 * os slots listados abaixo. Acrescentar entrada aqui é decisão de produto, não
 * de implementação — cada uma tem teste próprio em `tests/template-01.test.tsx`.
 */
export const TEMPLATE_01_DESIGN_TWEAKS = {
  /**
   * Alinhamento horizontal que substitui o do spec.
   *
   * `s3.title` — Figma: LEFT. A caixa dele é simétrica no frame (x=153, w=774),
   * mas o corpo e o remate do mesmo slide são CENTER: com o título à esquerda o
   * slide inteiro parecia desalinhado. Pedido: centralizar os textos do slide 3.
   */
  align: {
    's3.title': 'center',
  } as Record<string, 'left' | 'center' | 'right'>,

  /**
   * Tamanho de fonte que substitui o do spec, em px do canvas.
   *
   * `s5.top.title` / `s5.bot.title` — Figma: 55.163px. A coluna tem 211px
   * (topo) e 217px (base): a 55.163px cabem 9 caracteres por linha, então quase
   * qualquer palavra de pauta ("crescimento", "investimento") estourava.
   *
   * 44px é o MAIOR tamanho em que uma palavra real de 12 caracteres
   * ("investimento" = 207px) cabe na coluna de 211px — a 45px ela já mede 213px
   * e vaza. A 44px cabem 12 caracteres por linha nas duas colunas, contra 9 e 10
   * do Figma; é daí que sai o `maxCharsPerLine` novo, logo abaixo.
   *
   * A entrelinha acompanha na mesma razão (58.512/55.163 = 1.0607), senão as
   * linhas descolariam do desenho.
   */
  fontSizePx: {
    's5.top.title': 44,
    's5.bot.title': 44,
  } as Record<string, number>,

  /**
   * Limite de caracteres por linha que substitui o do `slots.json`.
   *
   * `s5.top.title` — slots.json: 10. `s5.bot.title` — slots.json: 11.
   * Os dois viram 12: é o que cabe medido a 44px nas colunas de 211px e 217px.
   * Não é chute — o limite é consequência do tamanho novo acima.
   */
  maxCharsPerLine: {
    's5.top.title': 12,
    's5.bot.title': 12,
  } as Record<string, number>,

  /**
   * `y` que o centro compartilhado do slide 5 substitui, com a contagem de
   * linhas do spec (ver TEMPLATE_01_CENTER_PAIRS).
   *
   * Na faixa de CIMA o Figma já centra as duas colunas no mesmo eixo (206.0 nas
   * duas), então a regra é no-op ali: centrar `s5.top.title` (h=118) no centro de
   * `s5.top.body` (top=128, h=156) dá 206 − 59 = 147, que é o `y` do spec.
   *
   * `s5.bot.title` — Figma: y=1062, centro 1150.5, contra 1167.5 do
   * `s5.bot.body`: 17px de diferença que o Figma NÃO resolve. Centrar move o
   * título para 1079. É desvio deliberado, pedido do Rafael ("título e descrição
   * de cada faixa centrados no mesmo eixo vertical"), e o único do slide 5 fora
   * dos 44px acima.
   */
  verticalCenter: {
    's5.bot.title': { specY: 1062, y: 1079 },
  } as Record<string, { specY: number; y: number }>,

  /**
   * Slides que ganham `cantos.left`/`cantos.right` que o Figma NÃO desenhou.
   *
   * O Figma só pôs cantos nos slides 3, 5 e 6. Nos slides 1, 2 e 4 o controle
   * parecia morto: não havia nó para exibir. Não era defeito do switch, mas
   * ausência no desenho.
   *
   * Pedido do Rafael: cantos disponíveis nos SEIS slides, ligando, desligando e
   * editando os dois lados em qualquer um. Daí o acréscimo.
   *
   * Geometria e tipografia são COPIADAS dos slides 3/5/6 (x=71 / right=63,
   * y=44, 16.805px Inter Display Medium, entrelinha 18.34, tracking -0.05em),
   * para a linha ficar no mesmo lugar em todo o deck.
   *
   * A COR é o único parâmetro por slide, e não é presunção — é o precedente do
   * fundo. Na faixa y=44 os três slides novos são BRANCOS: o degradê da capa só
   * começa a escurecer em 30.26% (y≈408) e o do slide 2 em 36.85% (y≈497); o
   * slide 4 é #FFFFFF chapado. O slide do spec com fundo branco é o 5, e nele o
   * Figma usa #AAAAAA — é essa a cor herdada. O #767682 do slide 3 é a variante
   * para o fundo escuro (#050416) e não se aplica aqui.
   *
   * O controle de cor da barra lateral continua valendo por cima, como nos
   * cantos que já existiam.
   */
  extraCorners: {
    1: { color: '#AAAAAA' },
    2: { color: '#AAAAAA' },
    4: { color: '#AAAAAA' },
  } as Record<number, { color: string }>,
} as const;

// ─── Cantos sintéticos ──────────────────────────────────────────

/**
 * O par de cantos do spec, usado como MOLDE dos slides que não têm nenhum.
 * Sai do slide 3 — o primeiro que os desenha — para que geometria, tipografia e
 * âncora venham do Figma e não de números soltos aqui.
 */
function cornerTemplateNodes(): SpecNode[] {
  const donor = TEMPLATE_01_SPEC.slides.find((s) =>
    s.nodes.some((n) => n.slot?.startsWith('cantos.'))
  );
  return (donor?.nodes ?? []).filter((n) => n.slot?.startsWith('cantos.'));
}

/**
 * Nós de um slide DEPOIS da camada de ajuste — é isto que o render desenha, no
 * lugar de `slide.nodes` cru.
 *
 * Para os slides 3, 5 e 6 devolve exatamente os nós do spec (mesma ordem, mesmo
 * objeto): é daí que sai a fidelidade de 0 px. Para os slides listados em
 * `extraCorners` acrescenta o par de cantos ao FIM da lista, com a cor do slide.
 *
 * O `id` sintético é prefixado para nunca colidir com um id do Figma — ele só
 * serve de chave de React.
 */
export function template01Nodes(slide: SpecSlide): SpecNode[] {
  const extra = TEMPLATE_01_DESIGN_TWEAKS.extraCorners[slide.index];
  if (!extra) return slide.nodes;
  // Um slide que já tenha cantos nunca ganha um segundo par.
  if (slide.nodes.some((n) => n.slot?.startsWith('cantos.'))) return slide.nodes;

  const synth = cornerTemplateNodes().map((n) => ({
    ...n,
    id: `t01-extra-corner:${slide.index}:${n.slot}`,
    fills: [{ ...(n.fills?.[0] ?? { type: 'SOLID' }), color: extra.color, css: extra.color }],
  }));
  return [...slide.nodes, ...synth];
}

/** Razão entrelinha/tamanho do spec, preservada quando o tamanho é ajustado. */
function specLineHeightRatio(t: SpecTypography): number {
  return t.fontSizePx ? t.lineHeightPx / t.fontSizePx : 1;
}

/**
 * Tipografia do slot depois da camada de ajuste — o que o render deve usar como
 * PADRÃO, no lugar do `node.typography` cru. Sem entrada em
 * `TEMPLATE_01_DESIGN_TWEAKS` devolve exatamente os números do spec.
 */
export function template01BaseType(node: SpecNode): {
  fontSizePx: number;
  lineHeightPx: number;
  align: string;
} {
  const t = node.typography!;
  const slot = node.slot ?? '';
  const size = TEMPLATE_01_DESIGN_TWEAKS.fontSizePx[slot];
  const align = TEMPLATE_01_DESIGN_TWEAKS.align[slot];
  return {
    fontSizePx: size ?? t.fontSizePx,
    lineHeightPx: size != null ? size * specLineHeightRatio(t) : t.lineHeightPx,
    align: align ?? t.textAlignHorizontal.toLowerCase(),
  };
}

/**
 * Valores de partida de um slot de texto para os controles da barra lateral —
 * já com a camada de ajuste aplicada, para o slider nascer no que está na tela.
 */
export function template01SlotDefaults(
  slot: string
): { fontSizePx: number; letterSpacingEm: number } | undefined {
  for (const slide of TEMPLATE_01_SPEC.slides) {
    const node = slide.nodes.find((n) => n.slot === slot && n.type === 'TEXT' && n.typography);
    if (!node) continue;
    return {
      fontSizePx: template01BaseType(node).fontSizePx,
      letterSpacingEm: node.typography!.letterSpacingEm,
    };
  }
  return undefined;
}

/** Nome legível da face que o spec realmente desenha naquele slot. */
export function template01SlotFontName(slot: string): string | undefined {
  for (const slide of TEMPLATE_01_SPEC.slides) {
    const node = slide.nodes.find((n) => n.slot === slot && n.type === 'TEXT' && n.typography);
    if (!node?.typography) continue;
    const { fontFamily, fontStyle } = node.typography;
    return [fontFamily, fontStyle].filter(Boolean).join(' ');
  }
  return undefined;
}

// ─── Grupos de alinhamento ──────────────────────────────────────

/**
 * Blocos que formam UMA coluna de texto e portanto têm que dividir a mesma
 * borda quando o usuário troca o alinhamento.
 *
 * Não dá para reusar `TEMPLATE_01_FLOW_GROUPS`: ali o critério é o fluxo
 * vertical (o que a imagem ou a seta separa vira grupo à parte), aqui é a
 * coluna visual. No slide 6 o título e o fecho estão em grupos de fluxo
 * diferentes — a seta os separa — mas são a mesma coluna e precisam alinhar.
 *
 * O PROBLEMA que isto resolve: as caixas do Figma têm larguras diferentes por
 * bloco (slide 4: título x=229.4 w=622, corpo x=178 w=725). Ambas são simétricas
 * no frame, então com o CENTER do spec parece certo; trocando para ESQUERDA o
 * título encosta em 229.4 e o corpo em 178, e as bordas divergem 51px.
 *
 * A REGRA: com override de alinhamento, todos os blocos do grupo passam a usar a
 * caixa MAIS LARGA do grupo. Sem override nada muda — é isso que preserva o 0 px.
 */
export const TEMPLATE_01_ALIGN_GROUPS: Record<number, string[][]> = {
  1: [['s1.eyebrow', 's1.headline', 's1.subline']],
  2: [['s2.title', 's2.body']],
  3: [['s3.title', 's3.body', 's3.kicker']],
  4: [['s4.title', 's4.body']],
  // As duas faixas do slide 5 são a MESMA coluna, uma acima e outra abaixo da
  // imagem: os títulos (211 e 217px) desalinhariam entre si à direita.
  5: [
    ['s5.top.title', 's5.bot.title'],
    ['s5.top.body', 's5.bot.body'],
  ],
  6: [['s6.title', 's6.body']],
};

/**
 * Caixa de referência compartilhada por slot, quando há override de alinhamento.
 * Devolve `{}` para slides sem grupo. Os cantos ficam de fora: têm controle
 * próprio e âncoras opostas.
 */
export function template01AlignBoxes(slideIndex: number): Record<string, SpecBox> {
  const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === slideIndex);
  if (!slide) return {};
  const bySlot = new Map<string, SpecNode>();
  for (const n of slide.nodes) if (n.slot) bySlot.set(n.slot, n);

  const out: Record<string, SpecBox> = {};
  for (const group of TEMPLATE_01_ALIGN_GROUPS[slideIndex] ?? []) {
    const nodes = group.map((s) => bySlot.get(s)).filter((n): n is SpecNode => !!n);
    if (nodes.length < 2) continue;
    const widest = nodes.reduce((a, b) => (b.box.w > a.box.w ? b : a));
    for (const n of nodes) out[n.slot!] = widest.box;
  }
  return out;
}

// ─── Constantes de canvas ───────────────────────────────────────

export const TEMPLATE_01_WIDTH = 1080;
export const TEMPLATE_01_HEIGHT = 1350;
/** O template tem uma dramaturgia de 6 slides: não é redimensionável. */
export const TEMPLATE_01_SLIDE_COUNT = TEMPLATE_01_SPEC.slides.length;

// ─── Conteúdo ───────────────────────────────────────────────────

/** Texto ou URL de imagem por slot, ex: `{ 's1.headline': 'linha 1\nlinha 2' }`. */
export type Template01Slots = Record<string, string>;

/** Texto inicial do cabeçalho/cantos de cada slide novo. */
export const TEMPLATE_01_DEFAULT_CORNERS: Template01Slots = {
  'cantos.left': 'LOREM IPSUM',
  'cantos.right': '@LOREMIPSUM',
};

export interface Template01SlotDescriptor {
  slot: string;
  slideIndex: number;
  role: string;
  /** Rótulo da barra lateral. É só interface — a CHAVE do slot nunca muda. */
  label: string;
  kind: 'text' | 'image';
  maxLines?: number;
  maxCharsPerLine?: number;
  /** Texto que vem do Figma; usado quando o slot não foi preenchido. */
  defaultValue: string;
  note?: string;
  /** `y` do bloco no spec — a barra lateral ordena os campos por ele. */
  y: number;
}

/**
 * Rótulo de cada slot na barra lateral.
 *
 * O nome técnico (`s1.headline`, `chapeu`) não diz nada a quem está editando.
 * Isto é APENAS o texto da interface: a chave do slot continua sendo a do spec,
 * porque é ela que está gravada no `templateSlots` de todo carrossel já salvo.
 *
 * Nomes pedidos pelo Rafael para a capa: titulo-capa → "Título",
 * chapeu → "Subtítulo", sintese → "Descrição". Os demais slides seguem o mesmo
 * vocabulário para não haver dois nomes para a mesma coisa.
 */
const SLOT_LABELS: Record<string, string> = {
  's1.headline': 'Título',
  's1.eyebrow': 'Subtítulo',
  's1.subline': 'Descrição',
  's2.title': 'Título',
  's2.body': 'Descrição',
  's3.title': 'Título',
  's3.body': 'Descrição',
  's3.kicker': 'Remate',
  's4.title': 'Título',
  's4.body': 'Descrição',
  // O slide 5 tem duas faixas com o mesmo par: sem a faixa no rótulo, o painel
  // mostraria "Título" e "Descrição" duas vezes.
  's5.top.title': 'Título (faixa de cima)',
  's5.top.body': 'Descrição (faixa de cima)',
  's5.bot.title': 'Título (faixa de baixo)',
  's5.bot.body': 'Descrição (faixa de baixo)',
  's6.title': 'Título',
  's6.body': 'Descrição',
  'cantos.left': 'Canto esquerdo',
  'cantos.right': 'Canto direito',
  's1.image': 'Imagem de fundo',
  's2.image': 'Imagem de fundo',
  's3.image': 'Imagem',
  's4.image': 'Imagem',
  's5.image': 'Imagem',
};

export function template01SlotLabel(slot: string, fallback = ''): string {
  return SLOT_LABELS[slot] ?? fallback ?? slot;
}

/**
 * Slots editáveis, na ordem em que aparecem no deck. Os cantos repetem nos
 * slides 3, 5 e 6 com o mesmo nome de slot — são deduplicados aqui e editados
 * uma vez só, exatamente como no `content.json` da skill.
 */
export const TEMPLATE_01_EDITABLE_SLOTS: Template01SlotDescriptor[] = (() => {
  const out: Template01SlotDescriptor[] = [];
  const seen = new Set<string>();
  for (const slide of TEMPLATE_01_SPEC.slides) {
    for (const node of slide.nodes) {
      const slot = node.slot;
      if (!slot || node.editable === false || seen.has(slot)) continue;
      if (node.type !== 'TEXT' && node.type !== 'RECTANGLE') continue;
      seen.add(slot);
      const info = TEMPLATE_01_SPEC.slotIndex[slot];
      out.push({
        slot,
        slideIndex: slide.index,
        role: node.role || info?.role || '',
        label: template01SlotLabel(slot, node.role || info?.role || slot),
        y: node.box.y,
        kind: node.type === 'TEXT' ? 'text' : 'image',
        maxLines: info?.maxLines,
        // O limite do slots.json passa pela camada de ajuste: o do s5 foi
        // recalculado para o tamanho de fonte novo. Ver TEMPLATE_01_DESIGN_TWEAKS.
        maxCharsPerLine:
          TEMPLATE_01_DESIGN_TWEAKS.maxCharsPerLine[slot] ?? info?.maxCharsPerLine,
        defaultValue: node.text?.characters ?? '',
        note: info?.note,
      });
    }
  }
  // A imagem de fundo dos slides 1 e 2 não é um node: vem de backgroundLayers.
  for (const slide of TEMPLATE_01_SPEC.slides) {
    for (const layer of slide.backgroundLayers ?? []) {
      if (layer.type !== 'IMAGE_SLOT' || !layer.slot || seen.has(layer.slot)) continue;
      seen.add(layer.slot);
      out.push({
        slot: layer.slot,
        slideIndex: slide.index,
        role: 'imagem-fundo',
        label: template01SlotLabel(layer.slot, 'Imagem de fundo'),
        y: 0,
        kind: 'image',
        defaultValue: '',
        note: layer.note,
      });
    }
  }
  return out.sort((a, b) => a.slideIndex - b.slideIndex);
})();

/**
 * Que tipo de imagem o slide tem (1-indexado). A capa e o slide 2 têm imagem de
 * FUNDO full-bleed sob o scrim; os slides 3, 4 e 5 têm um shape de imagem
 * dentro da composição; o 6 não tem nenhuma. A barra lateral usa isto para não
 * mostrar controle de imagem em slide que não tem imagem.
 */
export function template01SlideMedia(slideIndex: number): {
  background: boolean;
  content: boolean;
} {
  const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === slideIndex);
  return {
    background: !!slide?.backgroundLayers?.some((l) => l.type === 'IMAGE_SLOT'),
    content: !!slide?.nodes.some((n) => n.type === 'RECTANGLE' && !!n.slot),
  };
}

/**
 * Slot de imagem do slide (1-indexado), se houver. `undefined` no slide 6, que
 * não tem imagem nenhuma no desenho.
 */
export function template01ImageSlot(slideIndex: number): string | undefined {
  return TEMPLATE_01_EDITABLE_SLOTS.find((s) => s.kind === 'image' && s.slideIndex === slideIndex)
    ?.slot;
}

/** Campos genéricos do editor que servem de imagem quando o slot está vazio. */
export interface Template01ImageFallbacks {
  backgroundImageUrl?: string;
  gridImageUrl?: string;
  contentImageUrl?: string;
}

export function template01FallbackImage(slide: Template01ImageFallbacks): string {
  return slide.backgroundImageUrl || slide.gridImageUrl || slide.contentImageUrl || '';
}

/**
 * A imagem que o slide EXIBE hoje — a do slot, ou a dos campos genéricos do
 * editor quando o slot está vazio.
 *
 * A barra lateral e o render precisam concordar sobre isso: é esta função que
 * decide se o painel mostra preview e sliders, e é a mesma regra que o
 * `Template01Slide` usa para pintar. Origem não importa (IA ou upload): o que
 * manda é o slot de imagem do slide.
 */
export function template01SlideImageUrl(
  slide: Template01ImageFallbacks & { templateSlots?: Template01Slots },
  slideIndex: number
): string {
  const slot = template01ImageSlot(slideIndex);
  if (!slot) return '';
  return slide.templateSlots?.[slot] || template01FallbackImage(slide);
}

/** Conteúdo original do Figma — usado como estado inicial de um carrossel novo. */
export function template01DefaultSlots(): Template01Slots {
  const out: Template01Slots = {};
  for (const s of TEMPLATE_01_EDITABLE_SLOTS) {
    if (s.kind === 'text') out[s.slot] = s.defaultValue;
  }
  return out;
}

/**
 * Slots que pertencem a um slide (1-indexado), incluindo seu cabeçalho/cantos, na
 * ordem VISUAL do slide (de cima para baixo).
 *
 * A ordem dos nós no spec é a do Figma, não a da tela: na capa o título vem
 * antes do chapéu, que está acima dele. Quem edita procura o campo pela posição
 * no slide, então a barra lateral segue o `y`.
 */
export function template01SlotsForSlide(slideIndex: number): Template01SlotDescriptor[] {
  return TEMPLATE_01_EDITABLE_SLOTS.filter(
    (s) => s.slideIndex === slideIndex || s.slot.startsWith('cantos.')
  )
    .map((s) =>
      s.slot.startsWith('cantos.')
        ? { ...s, defaultValue: TEMPLATE_01_DEFAULT_CORNERS[s.slot] }
        : s
    )
    .sort((a, b) => a.y - b.y);
}

/**
 * Slot de título e de corpo de cada slide, na ordem do deck. É por aqui que o
 * conteúdo genérico do wizard (título + descrição por slide) entra no template.
 */
const PRIMARY_SLOTS: { title: string; body: string }[] = [
  { title: 's1.headline', body: 's1.subline' },
  { title: 's2.title', body: 's2.body' },
  { title: 's3.title', body: 's3.body' },
  { title: 's4.title', body: 's4.body' },
  { title: 's5.top.title', body: 's5.top.body' },
  { title: 's6.title', body: 's6.body' },
];

/**
 * Slots de texto que NÃO são o par primário do slide — o chapéu da capa, o
 * remate do slide 3, a coluna de baixo do slide 5.
 *
 * Eles existem no desenho e a IA precisa escrevê-los: o texto de fábrica do
 * Figma ("*Barcelona FC cria fonte inspirada na arquiterua catalã") é
 * ilustrativo e não pode sobrar num carrossel gerado. A chave é o nome curto
 * que o contrato da IA usa; o valor, o slot do spec.
 */
export const TEMPLATE_01_EXTRA_SLOTS: Record<number, Record<string, string>> = {
  0: { eyebrow: 's1.eyebrow' },
  2: { kicker: 's3.kicker' },
  4: { botTitle: 's5.bot.title', botBody: 's5.bot.body' },
};

/** Todos os slots de texto de um slide (1-indexado no spec), cantos fora. */
function textSlotsOfSlide(slideIndex: number): string[] {
  return TEMPLATE_01_EDITABLE_SLOTS.filter(
    (s) => s.kind === 'text' && s.slideIndex === slideIndex && !s.slot.startsWith('cantos.')
  ).map((s) => s.slot);
}

export interface Template01ContentInput {
  title: string;
  description: string;
  imageUrl?: string;
  /** Slots secundários, pelo nome curto do contrato da IA (`eyebrow`, `kicker`…). */
  extras?: Record<string, string>;
}

/**
 * Monta os slots de um slide gerado.
 *
 * REGRA DURA: um deck gerado não pode exibir NENHUM texto ilustrativo do Figma.
 * Por isso todo slot de texto do slide sai preenchido — com o que a IA escreveu
 * ou, na falta, com string VAZIA. Vazio é pior visualmente que o texto do
 * Barcelona? Não: o texto do Barcelona é uma mentira sobre o conteúdo do
 * usuário, e o vazio ele conserta em um campo da barra lateral.
 *
 * O caminho "sem slots" (`templateSlots` ausente) continua caindo no texto do
 * spec — é dele que sai a fidelidade de 0 px, e nada aqui o toca.
 */
export function template01SlotsFromContent(
  slideIndex: number,
  input: Template01ContentInput
): Template01Slots {
  const primary = PRIMARY_SLOTS[slideIndex];
  if (!primary) return {};

  const slots: Template01Slots = {};
  for (const slot of textSlotsOfSlide(slideIndex + 1)) slots[slot] = '';

  if (input.title.trim()) slots[primary.title] = input.title.trim();
  if (input.description.trim()) slots[primary.body] = input.description.trim();

  for (const [key, slot] of Object.entries(TEMPLATE_01_EXTRA_SLOTS[slideIndex] ?? {})) {
    const value = input.extras?.[key];
    if (typeof value === 'string' && value.trim()) slots[slot] = value.trim();
  }

  if (input.imageUrl) {
    for (const s of TEMPLATE_01_EDITABLE_SLOTS) {
      if (s.kind === 'image' && s.slideIndex === slideIndex + 1) slots[s.slot] = input.imageUrl;
    }
  }
  return slots;
}

/**
 * Helper legado para converter marca e @ em slots. Novos slides usam
 * `TEMPLATE_01_DEFAULT_CORNERS` e não herdam estes valores entre cards.
 */
export function template01CornerSlots(brandName?: string, handle?: string): Template01Slots {
  const at = (handle ?? '').trim().replace(/^@+/, '');
  return {
    'cantos.left': (brandName ?? '').trim().toUpperCase(),
    'cantos.right': at ? `@${at.toUpperCase()}` : '',
  };
}

// ─── Reflow: âncora + vão preservado ────────────────────────────

/**
 * Grupo de blocos que fluem juntos, na ordem vertical do spec.
 *
 * O `y` de cada bloco no spec pressupõe a contagem de linhas do texto ORIGINAL
 * do Figma. Com texto do usuário a caixa cresce (ou encolhe) e, com `top` fixo,
 * abre buraco ou invade o bloco de baixo. O que é constante no desenho não é o
 * `y`: é o VÃO entre os blocos e a BORDA em que o grupo encosta.
 *
 * - `anchor: 'top'`  — o grupo pendura no topo do primeiro bloco e cresce para
 *   baixo. Usado quando o elemento fixo está ACIMA (imagem full-bleed no topo).
 * - `anchor: 'bottom'` — o grupo pendura no rodapé do último bloco e cresce para
 *   CIMA. Usado quando o elemento fixo está ABAIXO (borda da imagem, rodapé da
 *   composição sobre o degradê).
 */
export interface Template01FlowGroup {
  anchor: 'top' | 'bottom';
  /** Slots na ordem vertical do spec. */
  slots: string[];
  note: string;
}

/** Grupos por slide (1-indexado, como o spec). */
export const TEMPLATE_01_FLOW_GROUPS: Record<number, Template01FlowGroup[]> = {
  1: [
    {
      anchor: 'bottom',
      slots: ['s1.eyebrow', 's1.headline', 's1.subline'],
      note: 'capa sobre o degradê: a composição encosta no rodapé (subline em 1243.2) e sobe',
    },
  ],
  2: [
    {
      anchor: 'bottom',
      slots: ['s2.title', 's2.body'],
      note: 'mesma composição da capa: ancorada no rodapé do corpo',
    },
  ],
  3: [
    {
      anchor: 'bottom',
      slots: ['s3.title'],
      note: 'título acima da imagem (y=300): cresce para cima para não invadi-la',
    },
    {
      anchor: 'top',
      slots: ['s3.body', 's3.kicker'],
      note: 'corpo e remate penduram abaixo da imagem (termina em 830)',
    },
  ],
  4: [
    {
      anchor: 'top',
      slots: ['s4.title', 's4.body'],
      note: 'imagem full-bleed fixa no topo (0→850): o texto pendura abaixo dela',
    },
  ],
  5: [
    {
      anchor: 'bottom',
      slots: ['s5.top.title'],
      note: 'faixa de cima, coluna esquerda: encosta na borda superior da imagem (y=350)',
    },
    {
      anchor: 'bottom',
      slots: ['s5.top.body'],
      note: 'faixa de cima, coluna direita: independente em altura da coluna esquerda',
    },
    { anchor: 'top', slots: ['s5.bot.title'], note: 'faixa de baixo: pendura sob a imagem (1000)' },
    { anchor: 'top', slots: ['s5.bot.body'], note: 'faixa de baixo, coluna direita' },
  ],
  6: [
    {
      anchor: 'bottom',
      slots: ['s6.title'],
      note: 'título acima da seta (y=578): cresce para cima',
    },
    { anchor: 'top', slots: ['s6.body'], note: 'fecho abaixo da seta' },
  ],
};

/**
 * Colunas LADO A LADO que dividem o mesmo centro vertical.
 *
 * O PROBLEMA que isto resolve: as duas colunas de uma faixa do slide 5 têm
 * alturas diferentes (topo: 118 e 156; base: 177 e 195). Ancorar as duas na
 * MESMA borda — a da imagem — só as mantém alinhadas enquanto a contagem de
 * linhas for a do spec; com o texto do usuário uma cresce mais que a outra e o
 * miolo desencontra. Na faixa de cima o Figma centra as duas no mesmo eixo
 * (206.0 nas duas) e era isso que a âncora estava destruindo.
 *
 * A REGRA: a coluna MAIS ALTA da faixa mantém a âncora (é ela que garante que o
 * texto não invada a imagem); a mais BAIXA é centrada no centro vertical dela.
 * Como a menor fica CONTIDA no intervalo da maior, a garantia da âncora vale
 * para as duas.
 *
 * Só o slide 5 tem colunas lado a lado — os demais empilham blocos de largura
 * cheia, e os cantos (mesma altura, mesmo `y`) já nascem centrados entre si.
 */
export const TEMPLATE_01_CENTER_PAIRS: Record<number, [string, string][]> = {
  5: [
    ['s5.top.title', 's5.top.body'],
    ['s5.bot.title', 's5.bot.body'],
  ],
};

// ─── Adaptação de formato ───────────────────────────────────────
//
// Os três formatos compartilham a LARGURA 1080 (ver lib/formats.ts): só a
// ALTURA muda — 4:5 = 1350, 1:1 = 1080, 9:16 = 1920. Por isso NADA horizontal
// é tocado aqui: `x`, largura de caixa, tamanho de fonte, entrelinha, tracking
// e alinhamento saem do spec em qualquer formato. O texto não deforma, não
// reescala e não muda de corpo por causa do formato.
//
// O que varia é só o eixo vertical, e por duas regras diferentes:
//
//  BANDA — as imagens e a seta que o desenho ancora em posição proporcional
//  acompanham a razão `altura / 1350`. A imagem full-bleed do slide 4 ocupa 63%
//  da altura no 4:5 e continua ocupando 63% no 1:1 e no 9:16.
//
//  MARGEM — o resto é distância ABSOLUTA e não escala. O canto fica a 44px do
//  topo em qualquer formato, e um bloco ancorado no rodapé mantém a mesma
//  distância em px do rodapé. Margem que escala vira margem gigante no 9:16 e
//  espremida no 1:1.
//
// No 4:5 a razão é 1.0 e tudo isto é no-op por construção: qualquer conta que
// mude 1px no 4:5 é regra errada.

/** Razão de altura do formato ativo contra o canvas do spec. 1.0 no 4:5. */
export function template01HeightRatio(height: number): number {
  return height / TEMPLATE_01_HEIGHT;
}

/**
 * Nós que são BANDA: a imagem dos slides 3/4/5 e a seta do slide 6 — os únicos
 * elementos cuja posição vertical o desenho define em proporção do frame. Todo
 * o resto do spec é texto, e texto é margem.
 */
export function template01IsBand(node: SpecNode): boolean {
  return node.type === 'RECTANGLE' || node.type === 'VECTOR';
}

/** Banda do slide, se houver. O slide 6 tem a seta; os slides 1 e 2, nenhuma. */
function bandOf(slide: SpecSlide): SpecNode | undefined {
  return slide.nodes.find(template01IsBand);
}

/**
 * `y` e `h` de um nó no formato ativo. Banda escala com a altura; qualquer
 * outro nó devolve a caixa do spec intacta (é a margem absoluta).
 */
export function template01NodeSpan(node: SpecNode, ratio = 1): { y: number; h: number } {
  if (ratio === 1 || !template01IsBand(node)) return { y: node.box.y, h: node.box.h };
  return { y: node.box.y * ratio, h: node.box.h * ratio };
}

/** Base do grupo no spec — usada para saber se a banda está abaixo dele. */
function groupBottom(group: Template01FlowGroup, bySlot: Map<string, SpecNode>): number {
  return group.slots.reduce((max, s) => {
    const n = bySlot.get(s);
    return n ? Math.max(max, n.box.y + n.box.h) : max;
  }, 0);
}

/**
 * A aresta em que o grupo de fluxo encosta, em px do canvas 4:5.
 *
 * `anchor: 'top'` pendura ABAIXO de um elemento fixo — sempre a base da banda
 * (imagem do 3/4/5, seta do 6). `anchor: 'bottom'` encosta em algo ABAIXO: o
 * topo da banda quando o grupo está acima dela, senão o rodapé do frame (é o
 * caso da capa e do slide 2, que não têm banda).
 */
function flowEdge(
  group: Template01FlowGroup,
  band: SpecNode | undefined,
  bySlot: Map<string, SpecNode>
): number {
  if (group.anchor === 'top') return band ? band.box.y + band.box.h : 0;
  if (band && groupBottom(group, bySlot) <= band.box.y) return band.box.y;
  return TEMPLATE_01_HEIGHT;
}

/**
 * Quanto cada slot de fluxo anda no eixo vertical por causa do formato.
 *
 * A aresta de referência do grupo é recalculada no formato (`aresta × razão`
 * quando é banda; a altura nova quando é o rodapé do frame) e o grupo INTEIRO
 * acompanha a diferença. Assim o vão entre o bloco e a aresta — que é margem —
 * fica em px absolutos, e o reflow continua mandando por cima: ele já opera em
 * cima destes `top`.
 *
 * Devolve `{}` no 4:5, onde a razão é 1 e todo delta é zero.
 */
export function template01FormatShift(slideIndex: number, ratio = 1): Record<string, number> {
  const out: Record<string, number> = {};
  if (ratio === 1) return out;
  const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === slideIndex);
  if (!slide) return out;

  const bySlot = new Map<string, SpecNode>();
  for (const n of slide.nodes) if (n.slot) bySlot.set(n.slot, n);
  const band = bandOf(slide);

  for (const group of TEMPLATE_01_FLOW_GROUPS[slideIndex] ?? []) {
    const delta = flowEdge(group, band, bySlot) * (ratio - 1);
    for (const slot of group.slots) out[slot] = delta;
  }
  return out;
}

/**
 * Quantas linhas o spec assume para o bloco.
 *
 * Não dá para usar `text.lineCount`: ele conta as quebras EXPLÍCITAS do
 * conteúdo (s6.body tem 1, mas o Figma quebrou em 5). O que o `y` do bloco
 * seguinte pressupõe é a altura da caixa — daí a contagem sair de `h / lh`.
 */
export function template01SpecLines(node: SpecNode): number {
  const lh = node.typography?.lineHeightPx;
  if (!lh) return 1;
  return Math.max(1, Math.round(node.box.h / lh));
}

/** Medida real de um bloco: linhas que o navegador quebrou e a entrelinha em uso. */
export interface Template01BlockMetrics {
  lines: number;
  /** Entrelinha efetiva (o spec, ou a do override do usuário). */
  lineHeightPx: number;
}

/**
 * `top` de cada bloco que participa do reflow, em px do canvas do spec.
 *
 * Cada bloco cresce (ou encolhe) `linhas × entrelinha − linhas_do_spec ×
 * entrelinha_do_spec`; esse excedente é repassado aos vizinhos do grupo no
 * sentido da âncora. Com a contagem de linhas do spec o excedente é ZERO em
 * todos os blocos e o `top` devolvido é exatamente o `y` do spec — é isso que
 * mantém a fidelidade de 0 px contra o gabarito do `render.py`.
 *
 * Slots fora de um grupo não aparecem no resultado: quem chama usa o `y` do spec.
 *
 * Depois do fluxo, as colunas lado a lado passam a dividir o centro vertical —
 * ver TEMPLATE_01_CENTER_PAIRS.
 *
 * `ratio` é a razão de altura do formato ativo (1.0 no 4:5): ela desloca cada
 * grupo para a aresta RECALCULADA do formato antes do reflow correr por cima —
 * ver `template01FormatShift`.
 */
export function template01Tops(
  slideIndex: number,
  metrics: Record<string, Template01BlockMetrics> = {},
  options: { titleGapDelta?: number; isTitleSlot?: (slot: string) => boolean; ratio?: number } = {}
): Record<string, number> {
  const tops: Record<string, number> = {};
  const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === slideIndex);
  if (!slide) return tops;

  /**
   * Altura de cada bloco, para o centro compartilhado.
   *
   * Medido, é `linhas × entrelinha` — a altura que o bloco tem MESMO na tela, e
   * é dela que sai o centro exato. Sem medida (o SSR, antes do layout effect) a
   * caixa do spec é a medida de registro: é ela que põe o centro da faixa de
   * cima em 206.0, como no Figma, e mantém o 0 px contra o gabarito.
   */
  const heights: Record<string, number> = {};

  const bySlot = new Map<string, SpecNode>();
  for (const n of slide.nodes) if (n.slot) bySlot.set(n.slot, n);

  const { titleGapDelta = 0, isTitleSlot, ratio = 1 } = options;
  // Deslocamento do formato: o grupo inteiro vai para a aresta recalculada, e o
  // fluxo abaixo continua contando a partir dali. No 4:5 é sempre zero.
  const shift = template01FormatShift(slideIndex, ratio);

  for (const group of TEMPLATE_01_FLOW_GROUPS[slideIndex] ?? []) {
    const nodes = group.slots
      .map((s) => bySlot.get(s))
      .filter((n): n is SpecNode => !!n && n.type === 'TEXT');
    if (!nodes.length) continue;

    const extra = nodes.map((n) => {
      const specLines = template01SpecLines(n);
      const specLh = n.typography?.lineHeightPx ?? 0;
      const m = metrics[n.slot!];
      const lines = m?.lines ?? specLines;
      const lh = m?.lineHeightPx ?? specLh;
      heights[n.slot!] = m ? lines * lh : n.box.h;
      return lines * lh - specLines * specLh;
    });

    // Vão extra pedido no controle "espaço título → descrição": só existe onde
    // um título é seguido, DENTRO do mesmo grupo, pelo corpo dele. Nos slides
    // em que a imagem ou a seta separa os dois blocos o vão é do desenho e não
    // é parâmetro livre — ver as notas de TEMPLATE_01_FLOW_GROUPS.
    const gapBefore = (i: number) =>
      i > 0 && titleGapDelta && isTitleSlot?.(nodes[i - 1].slot!) && !isTitleSlot(nodes[i].slot!)
        ? titleGapDelta
        : 0;

    const dy = shift[group.slots[0]] ?? 0;

    if (group.anchor === 'top') {
      let acc = 0;
      nodes.forEach((n, i) => {
        acc += gapBefore(i);
        tops[n.slot!] = n.box.y + dy + acc;
        acc += extra[i];
      });
    } else {
      let acc = 0;
      for (let i = nodes.length - 1; i >= 0; i--) {
        acc += extra[i];
        tops[nodes[i].slot!] = nodes[i].box.y + dy - acc;
        acc += gapBefore(i);
      }
    }
  }

  // As colunas lado a lado da faixa: a mais alta manda, a mais baixa centra
  // nela. Em caso de empate não há o que fazer — as duas já dividem o centro.
  for (const pair of TEMPLATE_01_CENTER_PAIRS[slideIndex] ?? []) {
    if (!pair.every((s) => heights[s] != null && tops[s] != null)) continue;
    const [alta, baixa] = [...pair].sort((a, b) => heights[b] - heights[a]);
    if (heights[alta] === heights[baixa]) continue;
    tops[baixa] = tops[alta] + (heights[alta] - heights[baixa]) / 2;
  }

  return tops;
}

export interface Template01SlotMeasure {
  lines: number;
  longestLine: number;
  chars: number;
  /** Orçamento total quando o texto não tem quebra explícita. */
  charBudget?: number;
  over: boolean;
}

/**
 * Mede um slot contra os limites do spec.
 *
 * O SKILL.md manda escrever a quebra à mão (`\n`) nos títulos: os limites são
 * por linha escrita. Quando o texto não tem `\n` — o caso do conteúdo original,
 * que o Figma quebrou sozinho pela largura da caixa — não dá para contar linhas,
 * então o que vale é o orçamento total (maxLines × maxCharsPerLine). Sem essa
 * distinção o conteúdo de fábrica apareceria como estouro.
 */
export function template01Measure(
  value: string,
  limits: { maxLines?: number; maxCharsPerLine?: number }
): Template01SlotMeasure {
  const lines = value.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const { maxLines, maxCharsPerLine } = limits;

  if (lines.length === 1 && maxLines != null && maxCharsPerLine != null) {
    const budget = maxLines * maxCharsPerLine;
    return { lines: 1, longestLine: longest, chars: value.length, charBudget: budget, over: value.length > budget };
  }

  const overLines = maxLines != null && lines.length > maxLines;
  const overChars = maxCharsPerLine != null && longest > maxCharsPerLine;
  return { lines: lines.length, longestLine: longest, chars: value.length, over: overLines || overChars };
}

export interface Template01Overflow extends Template01SlotMeasure {
  slot: string;
  maxLines?: number;
  maxCharsPerLine?: number;
}

/**
 * Confere os limites de `slotIndex` — os mesmos que a skill valida antes de
 * entregar. Estourar não deixa "apertado": empurra o elemento de baixo.
 */
export function template01Overflows(slots: Template01Slots): Template01Overflow[] {
  const out: Template01Overflow[] = [];
  for (const s of TEMPLATE_01_EDITABLE_SLOTS) {
    if (s.kind !== 'text') continue;
    const value = slots[s.slot] ?? s.defaultValue;
    // O conteúdo de fábrica não é auditado: `maxCharsPerLine` é o limite
    // estético do slots.json, mais rígido que o técnico, e o texto que veio do
    // Figma passa dele em alguns slots sem estourar a caixa. Acusar o que já
    // está no template só ensinaria a ignorar o aviso.
    if (value === s.defaultValue) continue;
    const m = template01Measure(value, s);
    if (m.over) out.push({ slot: s.slot, maxLines: s.maxLines, maxCharsPerLine: s.maxCharsPerLine, ...m });
  }
  return out;
}

// ─── Modelo do slide ────────────────────────────────────────────
//
// O template tem 6 MODELOS de slide (capa, texto-sobre-foto, foto+remate,
// foto+corpo, duas colunas, fecho com seta). Até aqui o modelo era a POSIÇÃO do
// slide no deck, o que só funciona num deck de exatamente 6, sem repetição: com
// 8 slides o índice extrapolava e o `Math.min` fazia todo excedente cair no
// modelo 6 — o "slide 7 azul" com a seta e o texto de fábrica do Figma.
//
// A partir daqui o modelo é um dado do slide (`Slide.templateModel`), não a
// posição dele. Reordenar, repetir e passar de 6 continuam desenhando certo.

/** Os modelos disponíveis, na ordem do spec. */
export const TEMPLATE_01_MODELS: number[] = TEMPLATE_01_SPEC.slides.map((s) => s.index);

export function isTemplate01Model(value: unknown): value is number {
  return typeof value === 'number' && TEMPLATE_01_MODELS.includes(value);
}

/** Só o que interessa do slide para resolver o modelo. */
export interface Template01Modeled {
  templateModel?: number;
}

/**
 * O modelo do slide (1-indexado, como o spec).
 *
 * 🔴 COMPATIBILIDADE: deck salvo antes deste campo não tem `templateModel`.
 * Nesse caso o modelo continua saindo da POSIÇÃO com o mesmo clamp de antes,
 * então um carrossel antigo reabre idêntico — byte a byte no render.
 */
export function template01ModelOf(
  slide: Template01Modeled | null | undefined,
  position: number
): number {
  if (isTemplate01Model(slide?.templateModel)) return slide.templateModel;
  const last = TEMPLATE_01_MODELS.length - 1;
  return TEMPLATE_01_MODELS[Math.min(Math.max(position, 0), last)];
}

/** O slide do spec de um modelo. Cai no modelo 1 se pedirem um inexistente. */
export function template01SpecSlideOf(model: number): SpecSlide {
  return TEMPLATE_01_SPEC.slides.find((s) => s.index === model) ?? TEMPLATE_01_SPEC.slides[0];
}

/** Cor de fábrica de um slot no modelo atual, já incluindo cantos sintéticos. */
export function template01SlotColor(slot: string, model: number): string {
  const node = template01Nodes(template01SpecSlideOf(model)).find((n) => n.slot === slot);
  return node?.fills?.[0]?.css ?? '#FFFFFF';
}

export interface Template01SpecBackground {
  /** O CSS que o render aplica quando o slide segue o template. */
  css: string;
  /** Hex, só quando o desenho é cor CHAPADA. Ausente nos modelos com degradê. */
  solid?: string;
  /**
   * Hex para o seletor de cor abrir mostrando algo verdadeiro do desenho: a cor
   * chapada, ou — nos modelos 1 e 2 — a primeira parada do degradê. O seletor
   * nativo e o campo hex só aceitam `#RRGGBB`; um degradê ali abriria em branco.
   */
  swatch: string;
}

/**
 * Fundo do SPEC de um modelo.
 *
 * Existe para a barra lateral abrir mostrando a cor de fábrica daquele slide (o
 * modelo 6 abre em `#0D39E4`) sem que o componente leia o JSON solto, e para
 * distinguir os dois modelos de degradê — onde escolher uma cor SUBSTITUI o
 * degradê inteiro por chapado.
 */
export function template01SpecBackground(model: number): Template01SpecBackground {
  const paint = template01SpecSlideOf(model).background[0];
  const css = paint?.css ?? '#FFFFFF';
  const solid = paint?.type === 'SOLID' ? paint.color ?? css : undefined;
  return { css, solid, swatch: solid ?? paint?.stops?.[0]?.color ?? '#FFFFFF' };
}

// ─── Lorem ipsum dentro dos limites ─────────────────────────────

/**
 * Palavras do lorem clássico. Fonte única para todo texto de exemplo: nenhum
 * slide novo pode nascer com a copy do Figma ("Barcelona FC", "@OANDRELONA",
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
function loremUpTo(budget: number): string {
  if (budget <= 0) return '';
  let out = '';
  for (let i = 0; out.length < budget; i++) {
    const word = LOREM_WORDS[i % LOREM_WORDS.length];
    const next = out ? `${out} ${word}` : word;
    if (next.length > budget) break;
    out = next;
  }
  // Orçamento menor que a primeira palavra: corta no seco, ainda dentro do limite.
  if (!out) out = LOREM_WORDS[0].slice(0, budget);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Fração do orçamento que o lorem ocupa.
 *
 * `maxLines × maxCharsPerLine` pressupõe empacotamento perfeito, e a quebra real
 * do navegador desperdiça o fim de cada linha. Encher o orçamento faria o texto
 * transbordar para uma linha a mais no render mesmo com o contador no verde —
 * exatamente o estouro que o slide novo não pode ter.
 */
const LOREM_FILL = 0.7;

/**
 * Texto de exemplo de UM slot, dentro dos limites dele.
 *
 * Sai como linha única de propósito: é assim que `template01Measure` conta
 * (orçamento total, sem `\n`), então o contador da barra lateral nasce no verde.
 */
export function template01LoremForSlot(limits: {
  maxLines?: number;
  maxCharsPerLine?: number;
}): string {
  const { maxLines, maxCharsPerLine } = limits;
  if (maxLines != null && maxCharsPerLine != null) {
    return loremUpTo(Math.max(1, Math.floor(maxLines * maxCharsPerLine * LOREM_FILL)));
  }
  if (maxCharsPerLine != null) return loremUpTo(Math.floor(maxCharsPerLine * LOREM_FILL));
  if (maxLines != null) return loremUpTo(maxLines * 28);
  return loremUpTo(40);
}

/**
 * Slots de um slide NOVO do modelo pedido: lorem em todo slot de texto, imagem
 * vazia (o usuário escolhe a dele) e cabeçalho próprio em
 * LOREM IPSUM/@LOREMIPSUM.
 */
export function template01NewSlideSlots(
  model: number,
  /** @deprecated Mantido apenas para chamadas antigas; não há mais herança. */
  _inheritedCorners?: Template01Slots
): Template01Slots {
  const out: Template01Slots = {};
  for (const d of template01SlotsForSlide(model)) {
    if (d.slot.startsWith('cantos.')) continue;
    if (d.kind === 'text') out[d.slot] = template01LoremForSlot(d);
  }
  for (const slot of ['cantos.left', 'cantos.right']) {
    out[slot] = TEMPLATE_01_DEFAULT_CORNERS[slot];
  }
  return out;
}
