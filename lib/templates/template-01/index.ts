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
} as const;

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

/** Conteúdo original do Figma — usado como estado inicial de um carrossel novo. */
export function template01DefaultSlots(): Template01Slots {
  const out: Template01Slots = {};
  for (const s of TEMPLATE_01_EDITABLE_SLOTS) {
    if (s.kind === 'text') out[s.slot] = s.defaultValue;
  }
  return out;
}

/**
 * Slots que pertencem a um slide (1-indexado), incluindo os cantos globais, na
 * ordem VISUAL do slide (de cima para baixo).
 *
 * A ordem dos nós no spec é a do Figma, não a da tela: na capa o título vem
 * antes do chapéu, que está acima dele. Quem edita procura o campo pela posição
 * no slide, então a barra lateral segue o `y`.
 */
export function template01SlotsForSlide(slideIndex: number): Template01SlotDescriptor[] {
  return TEMPLATE_01_EDITABLE_SLOTS.filter(
    (s) => s.slideIndex === slideIndex || s.slot.startsWith('cantos.')
  ).sort((a, b) => a.y - b.y);
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
 * Cantos de um deck gerado: assinatura e @ do usuário. São dados DELE (marca e
 * handle do onboarding), não estilo — por isso a geração pode escrevê-los. Sem
 * marca nem handle o slot sai vazio, nunca com o "@OANDRELONA" do Figma.
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
  metrics: Record<string, Template01BlockMetrics> = {},
  options: { titleGapDelta?: number; isTitleSlot?: (slot: string) => boolean } = {}
): Record<string, number> {
  const tops: Record<string, number> = {};
  const slide = TEMPLATE_01_SPEC.slides.find((s) => s.index === slideIndex);
  if (!slide) return tops;

  const bySlot = new Map<string, SpecNode>();
  for (const n of slide.nodes) if (n.slot) bySlot.set(n.slot, n);

  const { titleGapDelta = 0, isTitleSlot } = options;

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

    // Vão extra pedido no controle "espaço título → descrição": só existe onde
    // um título é seguido, DENTRO do mesmo grupo, pelo corpo dele. Nos slides
    // em que a imagem ou a seta separa os dois blocos o vão é do desenho e não
    // é parâmetro livre — ver as notas de TEMPLATE_01_FLOW_GROUPS.
    const gapBefore = (i: number) =>
      i > 0 && titleGapDelta && isTitleSlot?.(nodes[i - 1].slot!) && !isTitleSlot(nodes[i].slot!)
        ? titleGapDelta
        : 0;

    if (group.anchor === 'top') {
      let acc = 0;
      nodes.forEach((n, i) => {
        acc += gapBefore(i);
        tops[n.slot!] = n.box.y + acc;
        acc += extra[i];
      });
    } else {
      let acc = 0;
      for (let i = nodes.length - 1; i >= 0; i--) {
        acc += extra[i];
        tops[nodes[i].slot!] = nodes[i].box.y - acc;
        acc += gapBefore(i);
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
