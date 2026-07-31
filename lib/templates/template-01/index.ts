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

// ─── Constantes de canvas ───────────────────────────────────────

export const TEMPLATE_01_WIDTH = 1080;
export const TEMPLATE_01_HEIGHT = 1350;
/** O template tem uma dramaturgia de 6 slides: não é redimensionável. */
export const TEMPLATE_01_SLIDE_COUNT = TEMPLATE_01_SPEC.slides.length;

// ─── Conteúdo ───────────────────────────────────────────────────

/** Texto ou URL de imagem por slot, ex: `{ 's1.headline': 'linha 1\nlinha 2' }`. */
export type Template01Slots = Record<string, string>;

export interface Template01SlotDescriptor {
  slot: string;
  slideIndex: number;
  role: string;
  kind: 'text' | 'image';
  maxLines?: number;
  maxCharsPerLine?: number;
  /** Texto que vem do Figma; usado quando o slot não foi preenchido. */
  defaultValue: string;
  note?: string;
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
        kind: node.type === 'TEXT' ? 'text' : 'image',
        maxLines: info?.maxLines,
        maxCharsPerLine: info?.maxCharsPerLine,
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
        kind: 'image',
        defaultValue: '',
        note: layer.note,
      });
    }
  }
  return out.sort((a, b) => a.slideIndex - b.slideIndex);
})();

/** Conteúdo original do Figma — usado como estado inicial de um carrossel novo. */
export function template01DefaultSlots(): Template01Slots {
  const out: Template01Slots = {};
  for (const s of TEMPLATE_01_EDITABLE_SLOTS) {
    if (s.kind === 'text') out[s.slot] = s.defaultValue;
  }
  return out;
}

/** Slots que pertencem a um slide (1-indexado), incluindo os cantos globais. */
export function template01SlotsForSlide(slideIndex: number): Template01SlotDescriptor[] {
  return TEMPLATE_01_EDITABLE_SLOTS.filter(
    (s) => s.slideIndex === slideIndex || s.slot.startsWith('cantos.')
  );
}

/**
 * Slot de título e de corpo de cada slide, na ordem do deck. É por aqui que o
 * conteúdo genérico do wizard (título + descrição por slide) entra no template.
 * Os slots que não aparecem aqui — a coluna de baixo do slide 5, o kicker, o
 * eyebrow — ficam no texto padrão do Figma até serem editados na sidebar.
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
 * Monta os slots de um slide a partir de título/descrição soltos. Mantém o
 * padrão do Figma nos slots não mapeados para o slide nunca sair vazio.
 */
export function template01SlotsFromContent(
  slideIndex: number,
  title: string,
  description: string,
  imageUrl?: string
): Template01Slots {
  const primary = PRIMARY_SLOTS[slideIndex];
  if (!primary) return {};
  const slots: Template01Slots = {};
  if (title.trim()) slots[primary.title] = title;
  if (description.trim()) slots[primary.body] = description;
  if (imageUrl) {
    for (const s of TEMPLATE_01_EDITABLE_SLOTS) {
      if (s.kind === 'image' && s.slideIndex === slideIndex + 1) slots[s.slot] = imageUrl;
    }
  }
  return slots;
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
