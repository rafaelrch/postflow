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
 */
export function template01Tops(
  slideIndex: number,
  metrics: Record<string, Template01BlockMetrics> = {}
): Record<string, number> {
  const tops: Record<string, number> = {};
  const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === slideIndex);
  if (!slide) return tops;

  const bySlot = new Map<string, SpecNode>();
  for (const n of slide.nodes) if (n.slot) bySlot.set(n.slot, n);

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
      return lines * lh - specLines * specLh;
    });

    if (group.anchor === 'top') {
      let acc = 0;
      nodes.forEach((n, i) => {
        tops[n.slot!] = n.box.y + acc;
        acc += extra[i];
      });
    } else {
      let acc = 0;
      for (let i = nodes.length - 1; i >= 0; i--) {
        acc += extra[i];
        tops[nodes[i].slot!] = nodes[i].box.y - acc;
      }
    }
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
