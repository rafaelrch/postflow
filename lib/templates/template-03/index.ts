import specJson from './spec.json';

/**
 * TEMPLATE 3 — "FlowLine": capa + conteúdo independente, deck ABERTO.
 *
 * `spec.json` é cópia VERBATIM de `template-flowline.spec.json` do material do
 * Rafael (`creatools-flowline`) e é read-only: é a régua contra a qual a
 * fidelidade é medida. Este módulo lê dali tudo o que descreve a forma
 * (posição, cor, tipografia, limites) e não redigita número nenhum. Todo desvio
 * consciente mora em `TEMPLATE_03_DESIGN_TWEAKS`, com o valor original ao lado.
 *
 * O spec é um dump de nós do Figma, como o do Template 1 — não a descrição de
 * tokens/layouts do Template 2. Mas o motor de reflow por âncora do T1
 * (`template01Tops`, `template01FormatShift`) NÃO vale aqui, e nada dele foi
 * reusado: quem desenha o FlowLine é um porte do `render.py` do material.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔴 A CHAVE DO SLOT É POR MODELO, NUNCA POR SLIDE.
 *
 * O spec indexa slots pelo número do SLIDE do Figma (`s1.title`, `s2.title`,
 * `s3.title`, `s4.title`). Num deck ABERTO isso não serve: o slide 9 não tem
 * `s9.title` no spec, e nem poderia — o FlowLine tem quantos slides de conteúdo o usuário
 * quiser.
 *
 * Então:
 *   · modelo 1 (capa) grava `s1.*`;
 *   · modelo 2 (conteúdo) grava `s2.*` para TODOS os slides de conteúdo, em QUALQUER posição;
 *   · `cantos.left` / `cantos.right` já são globais no próprio spec e continuam
 *     globais.
 *
 * Os nós dos slides 3 e 4 do spec entram só como CONFERÊNCIA da forma do conteúdo
 * (mesma caixa, mesma tipografia, só o `tituloY` muda). `s3.*` e `s4.*` NÃO
 * viram chave — ver `template03NormalizeSlot`.
 *
 * ⚠️ A chave gravada é IRREVOGÁVEL depois do primeiro deck salvo: ela fica no
 * `templateSlots` (jsonb) de todo carrossel do usuário, e renomear apaga o
 * conteúdo dele na tela. Ver `docs/tarefas/template-novo-estudo.md` §3.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ─── Formato do spec ────────────────────────────────────────────

export interface Template03Box {
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
}

export interface Template03Paint {
  type: string;
  blendMode?: string;
  opacity?: number;
  visible?: boolean;
  color?: string;
  alpha?: number;
  css?: string;
  /** Só nos degradês de fundo. */
  stops?: { color: string; alpha?: number; position?: number }[];
  angleDeg?: number;
  /** O extract já reprojetou as paradas para a % de CSS — ver a armadilha da faixa. */
  cssStopsPercent?: number[];
}

export interface Template03Typography {
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

export interface Template03StyledRun {
  styleKey: string;
  start: number;
  end: number;
  text: string;
  override?: { fills?: Template03Paint[] };
}

export interface Template03Text {
  characters: string;
  lines: string[];
  lineCount: number;
  maxLineChars: number;
  totalChars: number;
  styledRuns?: Template03StyledRun[];
}

export interface Template03Anchor {
  mode: 'left' | 'right' | 'center-x' | string;
  left?: number;
  right?: number;
  cx?: number;
  note?: string;
}

/** "ponto N aceso de M total" — o estado que o componente RECALCULA. */
export interface Template03DotsConfig {
  total: number;
  active: number;
  note?: string;
}

export interface Template03Node {
  id: string;
  name: string;
  type: 'TEXT' | 'GROUP' | 'RECTANGLE' | 'ELLIPSE' | string;
  box: Template03Box;
  opacity?: number;
  blendMode?: string;
  constraints?: { vertical: string; horizontal: string };
  fills?: Template03Paint[];
  strokes?: Template03Paint[];
  strokeWeight?: number;
  strokeAlign?: string;
  text?: Template03Text;
  typography?: Template03Typography;
  anchor?: Template03Anchor;
  slot?: string;
  editable?: boolean;
  role?: string;
  maxLines?: number;
  maxCharsPerLine?: number;
  dotsConfig?: Template03DotsConfig;
}

export interface Template03BackgroundLayer {
  z: number;
  type: 'IMAGE_SLOT' | 'GRADIENT_SCRIM' | string;
  slot?: string;
  fit?: string;
  position?: string;
  size?: string;
  css?: string;
  originalFigmaCss?: string;
  angleDeg?: number;
  note?: string;
}

export interface Template03SpecSlide {
  index: number;
  figmaId: string;
  figmaName: string;
  canvas: { w: number; h: number; aspectRatio: string };
  background: Template03Paint[];
  backgroundLayers?: Template03BackgroundLayer[];
  clipsContent?: boolean;
  nodes: Template03Node[];
}

export interface Template03SlotIndexEntry {
  figmaId: string | null;
  role: string;
  editable: boolean;
  type?: string;
  size?: string;
  maxLines?: number;
  maxCharsPerLine?: number;
  dotsConfig?: Template03DotsConfig;
  note?: string;
}

export interface Template03Spec {
  $schema?: string;
  template: {
    /** ⚠️ diz `template-01` — bug de cópia do extract. Ver DESIGN_TWEAKS. */
    id: string;
    figmaFileKey: string;
    figmaFileName: string;
    slideCount: number;
    canvas: { w: number; h: number; aspectRatio: string; exportScales?: number[] };
  };
  slides: Template03SpecSlide[];
  slotIndex: Record<string, Template03SlotIndexEntry>;
  designSystem: {
    canvas: { w: number; h: number; aspect: string };
    lineHeightRatio: { titulo: number; corpo: number };
    letterSpacingEm: { titulo: number; corpo: number; divider: number; cantos: number };
    dynamicPattern: {
      note?: string;
      tituloY: Record<string, number>;
      continuacao?: string;
    };
    palette: Record<string, string>;
  };
}

export const TEMPLATE_03_SPEC = specJson as unknown as Template03Spec;

/**
 * 🔴 A dimensão sai de `designSystem.canvas`, e NÃO de `template.canvas`.
 *
 * Os dois trazem 1080x1350, mas o bloco `template` é o que veio contaminado
 * pelo bug de cópia do extract (ver DESIGN_TWEAKS.templateId): ler dele
 * ensinaria a confiar num bloco que já se sabe errado.
 */
export const TEMPLATE_03_WIDTH = TEMPLATE_03_SPEC.designSystem.canvas.w;
export const TEMPLATE_03_HEIGHT = TEMPLATE_03_SPEC.designSystem.canvas.h;

/** Hex de cada cor nomeada do spec (`branco`, `cinza_corpo`, `azul_badge`…). */
export const TEMPLATE_03_PALETTE = TEMPLATE_03_SPEC.designSystem.palette;

/** Asset local fornecido pelo Rafael para o badge verificado do FlowLine. */
export const TEMPLATE_03_BADGE_ASSET = '/templates/icons8-instagram-verification-badge.svg';

// ─── Desvios deliberados do spec ────────────────────────────────

/**
 * Os desvios conscientes do spec, e o ÚNICO lugar onde eles existem.
 *
 * O `spec.json` é read-only: é o gabarito contra o qual a fidelidade é medida, e
 * editá-lo apagaria a régua junto com o desvio. Critério: 0px contra o gabarito
 * em tudo, EXCETO o que estiver listado aqui.
 */
export const TEMPLATE_03_DESIGN_TWEAKS = {
  /**
   * `template.id` do spec diz `"template-01"`.
   *
   * É bug de cópia do `extract_spec.py` do material (o mesmo script gerou o spec
   * do Template 1). O `figmaFileName` — "TEMPLATE 3" — mostra que o arquivo é o
   * certo; só o `id` veio errado.
   *
   * O spec entra VERBATIM, então o valor errado fica lá. A defesa é esta:
   * **nenhum código deste módulo lê `template.id`**. O estilo do app é
   * `'template03'` (`SlideStyle`), constante da árvore, e não sai do spec.
   */
  templateId: {
    spec: TEMPLATE_03_SPEC.template.id, // 'template-01'
    aqui: 'template03',
    motivo:
      'Bug de cópia do extract_spec.py. O spec fica intocado e o módulo nunca lê `template.id`.',
  },

  /**
   * A chave do slot é por MODELO, não por slide do spec.
   *
   * spec: `s1.*`, `s2.*`, `s3.*`, `s4.*` — um jogo de slots por slide do Figma.
   * aqui: `s1.*` (capa) e `s2.*` (TODO conteúdo). Ver o cabeçalho do arquivo.
   */
  chavePorModelo: {
    spec: ['s1.*', 's2.*', 's3.*', 's4.*'],
    aqui: ['s1.* (capa)', 's2.* (todo conteúdo)'],
    motivo:
      'Deck ABERTO: o slide 9 não teria `s9.title` no spec. Os nós de s3/s4 servem ' +
      'só para conferir a forma do conteúdo, que é uma só. Decidido no plano §1.6.',
  },

  /**
   * `REFERENCIA-SLOTS.md` do material lista `sN.divider`. Esse slot NÃO EXISTE.
   *
   * O que existe no `slotIndex` é `sN.dots` (o "....." em IvyOra) e `sN.image`.
   * A verdade é o `spec.json`; o markdown está desatualizado.
   */
  referenciaSlotsDesatualizada: {
    documento: 'sN.divider',
    spec: 'sN.dots + sN.image',
    motivo: 'REFERENCIA-SLOTS.md do material está desatualizado. Manda o spec.json.',
  },

  /**
   * Os dots são CALCULADOS, nunca copiados.
   *
   * O `SKILL.md` do material documenta o bug de autoria do arquivo Figma: os
   * frames dos slides 3 e 4 foram copiados do 2 sem atualizar o ponto aceso, e
   * os dois acendem o SEGUNDO ponto. O `dotsConfig` do spec já vem corrigido
   * (1, 2, 3, 4), mas continua sendo um deck de 4 — e o FlowLine é aberto.
   *
   * O componente desenha "ponto N aceso de M total" a partir da posição real do
   * slide e do tamanho do deck. É isso que faz o deck aberto funcionar.
   */
  dotsCalculados: {
    spec: 'sN.dots com dotsConfig fixo (total 4)',
    aqui: 'total = tamanho do deck, active = posição do slide',
    motivo: 'Deck aberto. O texto "....." do Figma nunca é lido como conteúdo.',
  },

  /**
   * O scrim de TODO passo é o do slide 3 do spec (`180deg`).
   *
   * spec: slide 2 traz `358.75deg`; slides 3 e 4 trazem `180deg`. É o MESMO
   * passo com o degradê em direções diferentes.
   *
   * Num deck aberto, alternar por paridade faz o carrossel PISCAR ao passar os
   * slides. Um sentido só é o que o Rafael vê hoje na referência. A capa mantém
   * o scrim do slide 1 (`178.58deg`).
   *
   * Decisão de produto, reversível numa constante — está em TODO-RAFAEL.
   */
  scrimDoPasso: {
    spec: '358.75deg (slide 2) · 180deg (slides 3 e 4)',
    aqui: '180deg em todo passo (o do slide 3)',
    motivo: 'Deck aberto com scrim alternando por paridade pisca. Plano §1.3.',
  },

  /**
   * O `tituloY` dos passos CICLA a tabela do spec.
   *
   * spec (`designSystem.dynamicPattern`): capa 702; passos 358 → 536 → 750, e a
   * instrução solta *"para mais passos, repetir o layout de passo com o título
   * em nova posição Y"*.
   *
   * Continuar somando estoura o canvas (750 + ~215 = 965, e um título de 3
   * linhas a 92px ocupa ~277px, mais o corpo ⇒ passa de 1350). Travar no 750
   * mata a sensação de avanço, que é a ideia do template. Ciclar preserva o
   * ritmo em grupos de três e nunca estoura.
   */
  tituloYCiclico: {
    spec: TEMPLATE_03_SPEC.designSystem.dynamicPattern.tituloY,
    aqui: 'passos ciclam [358, 536, 750]; o passo 4 volta a 358',
    motivo: 'Somar estoura o canvas; travar mata o avanço. Plano §1.3.',
  },

  /**
   * O avatar é slot de IMAGEM editável.
   *
   * spec: `sN.avatar` é `"editable": false` — uma elipse chapada `#DA4F4F` com
   * borda branca.
   *
   * aqui: recebe a foto de perfil do onboarding. Sem foto, a elipse sólida do
   * spec continua valendo, então o desenho de fábrica não muda.
   */
  avatarEditavel: {
    spec: 'sN.avatar editable:false (elipse #DA4F4F)',
    aqui: 'slot de imagem, pré-preenchido com a foto do perfil quando existir',
    motivo: 'Plano §1.8. Sem foto, cai na elipse do spec — fidelidade preservada.',
  },

  /**
   * O badge verificado é SVG desenhado, não asset.
   *
   * spec: `sN.badge` é um RECTANGLE com `fills[].imageRef` — a imagem teria de
   * ser baixada da API do Figma. O `render.py` do material já desenha o selo em
   * SVG (`#3897F0`), e é esse caminho que o app segue.
   *
   * Não é editável e não é slot de conteúdo: não aparece na barra lateral.
   */
  badgeDesenhado: {
    spec: 'sN.badge RECTANGLE com imageRef do Figma',
    aqui: `SVG desenhado em ${TEMPLATE_03_PALETTE.azul_badge}`,
    motivo: 'O render.py do material já faz assim; evita baixar um asset a mais.',
  },

  /**
   * Família serifada do divisor (o "....." dos dots).
   *
   * spec: `IvyOra Text` (`IvyOraText-Medium`), fonte comercial.
   *
   * ⚠️ NUNCA escreva `'IvyOra Text'` nesta pilha. O app declara um `@font-face`
   * com esse nome que resolve só por `local()`; quando não acha nada, o Chrome
   * trata a família como definida-e-vazia e pula direto para a `serif` genérica
   * em vez de cair no `T01Serif`. Medido no T1: 334px contra 305px. Já queimamos
   * uma sessão nisso.
   *
   * As seis faces do material são byte-idênticas às que o app já serve
   * (`public/fonts/template-01/`): nenhum `@font-face` novo.
   */
  serif: {
    spec: 'IvyOra Text Medium',
    stack: "'ivyora-text', 'T01Serif', serif",
    motivo: 'Rafael tem a licença e o Typekit já serve `ivyora-text`. Estudo, armadilha #5.',
  },
} as const;

// ─── Modelos ────────────────────────────────────────────────────
//
// O FlowLine tem DOIS modelos — a capa e o passo — e nenhum número fixo de
// slides: ordem do Rafael, 24/08, *"não tem uma quantidade específica de
// slides, ele pode ter quantos slides o usuário quiser"*.
//
// 🔴 O modelo é DADO do slide (`Slide.templateModel`), nunca a posição. Deck
// reordenado, com passo repetido ou com 12 slides continua desenhando certo.

/**
 * Slide do spec que define a FORMA de cada modelo.
 *
 * A capa é o primeiro slide do spec. O passo é o SEGUNDO — e é ele, não o 3 nem
 * o 4, que define a forma e os limites do modelo 2: os três passos do Figma têm
 * a mesma estrutura de nós, e os limites do `s2.*` são os mais apertados
 * (3 linhas × 22 caracteres no título, 2 × 93 no corpo), o que faz o texto caber
 * em qualquer altura do ciclo de `tituloY`.
 */
const COVER_SPEC_SLIDE = TEMPLATE_03_SPEC.slides[0].index;
const STEP_SPEC_SLIDE = TEMPLATE_03_SPEC.slides[1].index;

/** O modelo da capa (slide 1 do spec). */
export const TEMPLATE_03_MODEL_COVER = COVER_SPEC_SLIDE;
/** O modelo do passo — um só, para qualquer posição. */
export const TEMPLATE_03_MODEL_STEP = STEP_SPEC_SLIDE;

/**
 * Os modelos disponíveis.
 *
 * Sai do spec: são os dois primeiros slides, os únicos que introduzem uma forma
 * nova. Os slides 3 e 4 repetem a forma do 2 — o próprio `dynamicPattern` diz
 * *"Slide 1 = capa. Slides 2+ = passos numerados"*.
 */
export const TEMPLATE_03_MODELS: number[] = [TEMPLATE_03_MODEL_COVER, TEMPLATE_03_MODEL_STEP];

export function isTemplate03Model(value: unknown): value is number {
  return typeof value === 'number' && TEMPLATE_03_MODELS.includes(value);
}

/** Só o que interessa do slide para resolver o modelo. */
export interface Template03Modeled {
  templateModel?: number;
}

/**
 * O modelo do slide.
 *
 * 🔴 COMPATIBILIDADE: slide sem `templateModel` deriva o modelo da POSIÇÃO. É a
 * ausência que reproduz o comportamento velho — nunca backfill.
 */
export function template03ModelOf(
  slide: Template03Modeled | null | undefined,
  position: number
): number {
  if (isTemplate03Model(slide?.templateModel)) return slide.templateModel;
  return template03ModelAt(position);
}

/**
 * O modelo que a POSIÇÃO pede: a capa na primeira, conteúdo em todas as demais.
 *
 * A geração usa isto para GRAVAR `templateModel` em cada slide. Deixar o modelo
 * sair da posição na hora de DESENHAR é o que quebra quando o usuário reordena
 * ou insere um slide no meio — por isso ele é gravado, não inferido.
 */
export function template03ModelAt(position: number): number {
  const p = Math.max(0, Math.trunc(position));
  return p === 0 ? TEMPLATE_03_MODEL_COVER : TEMPLATE_03_MODEL_STEP;
}

/**
 * O próximo modelo do deck.
 *
 * Sempre o conteúdo: depois da capa vem um slide de conteúdo, e depois de um
 * conteúdo vem outro. Não há alternância — a capa é única e o conteúdo é a forma
 * que se repete.
 */
export function template03NextModel(_model: number): number {
  return TEMPLATE_03_MODEL_STEP;
}

/** O slide do spec de um modelo. Cai na capa se pedirem um inexistente. */
export function template03SpecSlideOf(model: number): Template03SpecSlide {
  const index = isTemplate03Model(model) ? model : TEMPLATE_03_MODEL_COVER;
  return (
    TEMPLATE_03_SPEC.slides.find((s) => s.index === index) ?? TEMPLATE_03_SPEC.slides[0]
  );
}

/**
 * Índice do passo (0-based) de um slide na posição dada.
 *
 * A capa está na posição 0; o primeiro conteúdo está na posição 1. É este
 * número que entra no ciclo de `tituloY`.
 */
export function template03StepIndex(position: number): number {
  return Math.max(0, Math.trunc(position) - 1);
}

// ─── O padrão dinâmico: o `tituloY` cicla ───────────────────────

/** `y` do bloco de título na CAPA — 702 no spec. */
export const TEMPLATE_03_TITULO_Y_COVER =
  TEMPLATE_03_SPEC.designSystem.dynamicPattern.tituloY[`slide${COVER_SPEC_SLIDE}`];

/**
 * As alturas do título dos passos, na ordem do spec: 358 → 536 → 750.
 *
 * Lidas de `designSystem.dynamicPattern.tituloY`, tirando a capa. Os deltas
 * (178 e 214) não são lineares, e é por isso que a tabela é copiada do spec em
 * vez de calculada.
 */
export const TEMPLATE_03_STEP_TITULO_Y: number[] = Object.entries(
  TEMPLATE_03_SPEC.designSystem.dynamicPattern.tituloY
)
  .filter(([k]) => k !== `slide${COVER_SPEC_SLIDE}`)
  .map(([, y]) => y);

/**
 * `y` do bloco de título do passo `stepIndex` (0-based).
 *
 * 🔴 CICLA. O passo 4 volta ao 358, o 5 vai ao 536, e assim por diante — ver
 * `TEMPLATE_03_DESIGN_TWEAKS.tituloYCiclico` para o porquê (somar estoura o
 * canvas; travar no 750 mata a sensação de avanço).
 */
export function template03TituloY(stepIndex: number): number {
  const i = Math.max(0, Math.trunc(stepIndex));
  return TEMPLATE_03_STEP_TITULO_Y[i % TEMPLATE_03_STEP_TITULO_Y.length];
}

// ─── Slots ──────────────────────────────────────────────────────

/** Texto ou URL de imagem por slot, ex: `{ 's2.title': 'Ideia principal' }`. */
export type Template03Slots = Record<string, string>;

/** Os slots que valem para o deck inteiro, não para um slide. */
const GLOBAL_SLOTS = ['cantos.left', 'cantos.right'] as const;

/** Texto inicial dos cantos de cada slide novo. */
export const TEMPLATE_03_DEFAULT_CORNERS: Template03Slots = {
  'cantos.left': 'LOREM IPSUM',
  'cantos.right': '@LOREMIPSUM',
};

/**
 * O prefixo `sN.` de um slot, ou `null` nos slots globais (`cantos.*`).
 */
function slotSpecSlide(slot: string): number | null {
  const m = /^s(\d+)\./.exec(slot);
  return m ? Number(m[1]) : null;
}

/** O nome do slot sem o prefixo de slide: `s3.title` → `title`. */
export function template03SlotName(slot: string): string {
  return slot.replace(/^s\d+\./, '');
}

/**
 * 🔴 A normalização de chave — o coração do template.
 *
 * Traduz um slot do spec (indexado por SLIDE) para a chave que o app GRAVA
 * (indexada por MODELO):
 *
 *   template03NormalizeSlot('s3.title', 2) === 's2.title'
 *   template03NormalizeSlot('s4.body',  2) === 's2.body'
 *   template03NormalizeSlot('s1.title', 1) === 's1.title'
 *   template03NormalizeSlot('cantos.left', 2) === 'cantos.left'   // global
 *
 * Sem isto, um deck de 9 slides gravaria nove jogos de chave — oito deles sem
 * descritor, sem barra lateral e sem render, órfãos no jsonb para sempre.
 */
export function template03NormalizeSlot(slot: string, model: number): string {
  if (slotSpecSlide(slot) == null) return slot;
  const target = isTemplate03Model(model) ? model : TEMPLATE_03_MODEL_COVER;
  return `s${target}.${template03SlotName(slot)}`;
}

export interface Template03SlotDescriptor {
  /** A chave GRAVADA — já por modelo. Nunca muda. */
  slot: string;
  /** Rótulo da barra lateral. É só interface — a CHAVE do slot nunca muda. */
  label: string;
  kind: 'text' | 'image';
  /**
   * `slide`  = conteúdo do slide;
   * `header` = barra de perfil (avatar + @), com painel próprio;
   * `global` = vale para o deck inteiro (os cantos).
   */
  scope: 'slide' | 'header' | 'global';
  /** `y` do bloco no spec — a barra lateral ordena os campos por ele. */
  y: number;
  maxLines?: number;
  maxCharsPerLine?: number;
  /** Texto que vem do Figma; usado quando o slot não foi preenchido. */
  defaultValue: string;
  role: string;
}

/**
 * Rótulo de cada slot na barra lateral.
 *
 * O nome técnico (`s2.body`) não diz nada a quem está editando. Isto é APENAS o
 * texto da interface: a chave continua sendo a do spec normalizada por modelo,
 * porque é ela que fica gravada no `templateSlots`. O vocabulário é o mesmo dos
 * Templates 1 e 2 — não pode haver dois nomes para a mesma coisa.
 */
const SLOT_LABELS: Record<string, string> = {
  title: 'Título',
  body: 'Descrição',
  handle: '@ do perfil',
  avatar: 'Foto de perfil',
  image: 'Imagem de fundo',
  'cantos.left': 'Canto esquerdo',
  'cantos.right': 'Canto direito',
};

export function template03SlotLabel(slot: string, fallback = ''): string {
  return SLOT_LABELS[slot] ?? SLOT_LABELS[template03SlotName(slot)] ?? fallback ?? slot;
}

/** Escopo de cada slot, pelo nome sem prefixo. */
const SLOT_SCOPE: Record<string, Template03SlotDescriptor['scope']> = {
  title: 'slide',
  body: 'slide',
  image: 'slide',
  handle: 'header',
  avatar: 'header',
};

/**
 * Slots de CONTEÚDO do template, pelo nome sem prefixo.
 *
 * Ficam de fora, de propósito:
 *   · `dots`  — calculado pelo componente, nunca lido como texto;
 *   · `badge` — SVG desenhado, não é conteúdo;
 *   · os grupos do Figma (`Group 5`, `Group 6`, `Group 7`, `CANTOS`), que não
 *     são editáveis nem desenham nada sozinhos.
 *
 * `avatar` entra apesar de o spec marcá-lo `editable: false` — ver
 * `TEMPLATE_03_DESIGN_TWEAKS.avatarEditavel`.
 */
const CONTENT_SLOT_NAMES = ['image', 'avatar', 'handle', 'title', 'body'] as const;

/** Entrada do `slotIndex` de um slot, pela chave DO SPEC (por slide). */
function specSlotIndex(specSlot: string): Template03SlotIndexEntry | undefined {
  return TEMPLATE_03_SPEC.slotIndex[specSlot];
}

/** O nó do spec de um slot, no slide que define a forma daquele modelo. */
export function template03SpecNode(slot: string, model: number): Template03Node | undefined {
  const slide = template03SpecSlideOf(model);
  const name = template03SlotName(slot);
  const target = slotSpecSlide(slot) == null ? slot : `s${slide.index}.${name}`;
  return slide.nodes.find((n) => n.slot === target);
}

function descriptorFor(name: string, model: number): Template03SlotDescriptor | undefined {
  const slide = template03SpecSlideOf(model);
  const isGlobal = (GLOBAL_SLOTS as readonly string[]).includes(name);
  // A chave GRAVADA: global fica como está, o resto ganha o prefixo do MODELO.
  const slot = isGlobal ? name : `s${model}.${name}`;
  // A chave do SPEC, para ler a forma: sempre a do slide que define o modelo.
  const specSlot = isGlobal ? name : `s${slide.index}.${name}`;

  const node = slide.nodes.find((n) => n.slot === specSlot);
  const info = specSlotIndex(specSlot);

  // A imagem de fundo não é nó: vem de `backgroundLayers`.
  const layer = slide.backgroundLayers?.find((l) => l.type === 'IMAGE_SLOT' && l.slot === specSlot);

  if (!node && !layer) return undefined;

  const kind: 'text' | 'image' = node?.type === 'TEXT' ? 'text' : 'image';
  return {
    slot,
    label: template03SlotLabel(slot, node?.role ?? info?.role ?? slot),
    kind,
    scope: isGlobal ? 'global' : SLOT_SCOPE[name] ?? 'slide',
    y: layer ? 0 : node!.box.y,
    maxLines: info?.maxLines ?? node?.maxLines,
    maxCharsPerLine: info?.maxCharsPerLine ?? node?.maxCharsPerLine,
    defaultValue: kind === 'image' ? '' : node?.text?.characters ?? '',
    role: node?.role ?? info?.role ?? '',
  };
}

/**
 * Descritores dos slots de um modelo, na ordem VISUAL do slide (de cima para
 * baixo).
 *
 * A ordem dos nós no spec é a do Figma, não a da tela — quem edita procura o
 * campo pela posição no slide, então a barra lateral segue o `y`.
 */
export function template03SlotsForModel(model: number): Template03SlotDescriptor[] {
  const m = isTemplate03Model(model) ? model : TEMPLATE_03_MODEL_COVER;
  const names = [...CONTENT_SLOT_NAMES, ...GLOBAL_SLOTS];
  return names
    .map((n) => descriptorFor(n, m))
    .filter((d): d is Template03SlotDescriptor => d != null)
    .sort((a, b) => a.y - b.y);
}

/** Slots de TEXTO do slide — sem a barra de perfil e sem os cantos. */
export function template03TextSlotsForModel(model: number): Template03SlotDescriptor[] {
  return template03SlotsForModel(model).filter((d) => d.kind === 'text' && d.scope === 'slide');
}

/** Os slots da barra de perfil (avatar + @), que tem painel próprio. */
export function template03HeaderSlotsForModel(model: number): Template03SlotDescriptor[] {
  return template03SlotsForModel(model).filter((d) => d.scope === 'header');
}

/**
 * TODAS as chaves que o template grava, sem repetição.
 *
 * 🔴 Não contém `s3.*` nem `s4.*`: os slides 3 e 4 do spec são conferência da
 * forma do passo, não chave nova.
 */
export const TEMPLATE_03_SLOTS: string[] = Array.from(
  new Set(TEMPLATE_03_MODELS.flatMap((m) => template03SlotsForModel(m).map((d) => d.slot)))
);

/**
 * Valores de partida de um slot de texto para os controles da barra lateral —
 * o slider nasce no que está na tela.
 */
export function template03SlotDefaults(
  slot: string,
  model: number = TEMPLATE_03_MODEL_COVER
): { fontSizePx: number; letterSpacingEm: number } | undefined {
  const node = template03SpecNode(slot, model);
  if (!node?.typography) return undefined;
  return {
    fontSizePx: node.typography.fontSizePx,
    letterSpacingEm: node.typography.letterSpacingEm,
  };
}

/** Nome legível da face que o spec realmente desenha naquele slot. */
export function template03SlotFontName(
  slot: string,
  model: number = TEMPLATE_03_MODEL_COVER
): string | undefined {
  const node = template03SpecNode(slot, model);
  if (!node?.typography) return undefined;
  // O divisor é o único serifado, e ele é substituído — ver DESIGN_TWEAKS.serif.
  if (node.typography.fontFamily === 'IvyOra Text') return 'IvyOra Text Medium';
  const { fontFamily, fontStyle } = node.typography;
  return [fontFamily, fontStyle].filter(Boolean).join(' ');
}

/**
 * Cor de FÁBRICA de um slot, lida do spec.
 *
 * Existe para o seletor de cor abrir mostrando o que está NA TELA, nunca um
 * padrão do editor. Depende do modelo de verdade: o corpo da capa é `#A1A1A1` e
 * o do passo é `#FFFFFF`; os cantos são brancos na capa e `#767682` no passo.
 */
export function template03SlotColor(slot: string, model: number): string {
  const node = template03SpecNode(slot, model);
  return node?.fills?.[0]?.css ?? node?.fills?.[0]?.color ?? TEMPLATE_03_PALETTE.branco;
}

/**
 * Slot de imagem do modelo — a foto de fundo full-bleed, 1080x1350.
 *
 * Todo modelo do FlowLine tem imagem de fundo: não existe o caso "modelo sem
 * imagem" do Template 1 (onde gerar por IA cobrava e não pintava nada).
 */
export function template03ImageSlot(model: number): string {
  const m = isTemplate03Model(model) ? model : TEMPLATE_03_MODEL_COVER;
  return `s${m}.image`;
}

/** Slot do avatar do modelo — a foto de perfil na barra de cabeçalho. */
export function template03AvatarSlot(model: number): string {
  const m = isTemplate03Model(model) ? model : TEMPLATE_03_MODEL_COVER;
  return `s${m}.avatar`;
}

/**
 * Slot do @ (handle) do modelo — a barra de perfil.
 *
 * É um slot POR MODELO (`s{model}.handle`), igual ao avatar: cada slide tem a
 * sua chave conforme o modelo. Quem escreve o @ para o deck inteiro PRECISA
 * resolver esta chave por slide (ver `setT03DeckText` na barra lateral), senão
 * num deck aberto o @ escrito em `s1.handle` não alcança os slides de modelo 2,
 * que leem `s2.handle` — e o @ "não propaga".
 */
export function template03HandleSlot(model: number): string {
  const m = isTemplate03Model(model) ? model : TEMPLATE_03_MODEL_COVER;
  return `s${m}.handle`;
}

/** Conteúdo original do Figma — estado inicial de um slide daquele modelo. */
export function template03DefaultSlots(model: number): Template03Slots {
  const out: Template03Slots = {};
  for (const d of template03SlotsForModel(model)) {
    if (d.kind === 'text') out[d.slot] = d.defaultValue;
  }
  return out;
}

// ─── Conteúdo gerado ────────────────────────────────────────────

/**
 * Par primário de cada modelo — por onde o conteúdo genérico do wizard
 * (título + descrição por slide) entra no template.
 *
 * Os dois modelos têm o par completo: a capa é título + corpo de apoio, e o
 * conteúdo é título + explicação de uma ideia independente.
 */
export const TEMPLATE_03_PRIMARY_SLOTS: Record<number, { title: string; body: string }> = {
  [TEMPLATE_03_MODEL_COVER]: {
    title: `s${TEMPLATE_03_MODEL_COVER}.title`,
    body: `s${TEMPLATE_03_MODEL_COVER}.body`,
  },
  [TEMPLATE_03_MODEL_STEP]: {
    title: `s${TEMPLATE_03_MODEL_STEP}.title`,
    body: `s${TEMPLATE_03_MODEL_STEP}.body`,
  },
};

export interface Template03ContentInput {
  title: string;
  description: string;
  imageUrl?: string;
}

/**
 * Monta os slots de um slide gerado.
 *
 * REGRA DURA, herdada dos Templates 1 e 2: um deck gerado não pode exibir
 * NENHUM texto ilustrativo do Figma. Por isso todo slot de texto do slide sai
 * preenchido — com o que a IA escreveu ou, na falta, com string VAZIA. O texto
 * do spec é uma mentira sobre o conteúdo do usuário; o vazio ele conserta num
 * campo da barra lateral.
 *
 * A barra de perfil e os cantos ficam de fora: o `@` vem do perfil do usuário e
 * os cantos são do deck, não deste slide (a fatia S4 os preenche no wizard).
 *
 * O caminho "sem slots" (`templateSlots` ausente) continua caindo no texto do
 * spec — é dele que sai a fidelidade contra a referência, e nada aqui o toca.
 */
export function template03SlotsFromContent(
  model: number,
  input: Template03ContentInput
): Template03Slots {
  const primary = TEMPLATE_03_PRIMARY_SLOTS[model];
  if (!primary) return {};

  const slots: Template03Slots = {};
  for (const d of template03TextSlotsForModel(model)) slots[d.slot] = '';

  if (input.title.trim()) slots[primary.title] = input.title.trim();
  if (input.description.trim()) slots[primary.body] = input.description.trim();
  if (input.imageUrl) slots[template03ImageSlot(model)] = input.imageUrl;
  return slots;
}

// ─── Contrato da geração por IA ─────────────────────────────────

/**
 * Instruções específicas do FlowLine para a geração de texto.
 *
 * Os limites saem dos descritores derivados do spec, não de números duplicados
 * no prompt. A resposta continua usando o contrato genérico `title`/`description`;
 * o CreateWizard faz a projeção para s1.* ou s2.* por modelo.
 */
export function template03Addendum(): string {
  const limite = (model: number, slot: string): string => {
    const descriptor = template03TextSlotsForModel(model).find((d) => d.slot === slot);
    if (!descriptor?.maxLines || !descriptor.maxCharsPerLine) {
      throw new Error(`Limites ausentes no spec para ${slot}`);
    }
    return `${descriptor.maxLines} linhas e ${descriptor.maxCharsPerLine} caracteres por linha`;
  };

  const capaTitulo = limite(TEMPLATE_03_MODEL_COVER, `s${TEMPLATE_03_MODEL_COVER}.title`);
  const capaCorpo = limite(TEMPLATE_03_MODEL_COVER, `s${TEMPLATE_03_MODEL_COVER}.body`);
  const passoTitulo = limite(TEMPLATE_03_MODEL_STEP, `s${TEMPLATE_03_MODEL_STEP}.title`);
  const passoCorpo = limite(TEMPLATE_03_MODEL_STEP, `s${TEMPLATE_03_MODEL_STEP}.body`);

  return `

TEMPLATE 3 — FLOWLINE, deck aberto.

Devolva exatamente slideCount slides. A posição 0 é a capa; as posições 1 em diante são slides de conteúdo.
Cada slide de conteúdo deve desenvolver uma ideia independente. Não imponha sequência,
tutorial ou numeração; use progressão apenas se isso tiver sido pedido explicitamente.
Use somente os campos "title" e "description" em cada slide.

- Capa (posição 0): "title" ocupa s1.title e "description" ocupa s1.body.
  Limites da capa: título em ${capaTitulo}; descrição em ${capaCorpo}.
- Conteúdo (posições 1 em diante): "title" ocupa s2.title e "description" ocupa s2.body em TODOS os slides de conteúdo.
  Limites do conteúdo: título em ${passoTitulo}; descrição em ${passoCorpo}.

Não crie campos adicionais, não use chaves s3.* ou s4.*, não devolva texto de exemplo e não altere a quantidade ou a ordem dos slides.`;
}

// ─── Medição contra os limites ──────────────────────────────────

export interface Template03SlotMeasure {
  lines: number;
  longestLine: number;
  chars: number;
  /** Orçamento total, só quando o texto não tem quebra manual. */
  charBudget?: number;
  over: boolean;
}

/**
 * Mede um slot contra os limites do spec.
 *
 * Os limites do `slotIndex` são por LINHA escrita, e o material manda escrever a
 * quebra à mão (`\n`) nos títulos. Quando o texto não tem `\n` — o caso do
 * conteúdo original, que o Figma quebrou sozinho pela largura da caixa — não dá
 * para contar linhas, então vale o orçamento total (`maxLines × maxCharsPerLine`).
 * Sem essa distinção o conteúdo de fábrica apareceria como estouro.
 */
export function template03Measure(
  value: string,
  limits: { maxLines?: number; maxCharsPerLine?: number }
): Template03SlotMeasure {
  const lines = value.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const { maxLines, maxCharsPerLine } = limits;

  if (lines.length === 1 && maxLines != null && maxCharsPerLine != null) {
    const budget = maxLines * maxCharsPerLine;
    return {
      lines: 1,
      longestLine: longest,
      chars: value.length,
      charBudget: budget,
      over: value.length > budget,
    };
  }

  const overLines = maxLines != null && lines.length > maxLines;
  const overChars = maxCharsPerLine != null && longest > maxCharsPerLine;
  return {
    lines: lines.length,
    longestLine: longest,
    chars: value.length,
    over: overLines || overChars,
  };
}

export interface Template03Overflow extends Template03SlotMeasure {
  slot: string;
  maxLines?: number;
  maxCharsPerLine?: number;
}

/** Confere os limites de todos os slots de texto de um slide. */
export function template03Overflows(
  model: number,
  slots: Template03Slots
): Template03Overflow[] {
  const out: Template03Overflow[] = [];
  for (const d of template03SlotsForModel(model)) {
    if (d.kind !== 'text') continue;
    const value = slots[d.slot];
    // O conteúdo de fábrica não é auditado: `maxCharsPerLine` é o limite
    // estético do spec, mais rígido que o técnico, e o texto que veio do Figma
    // passa de alguns sem estourar a caixa. Acusar o que já está no template só
    // ensinaria a ignorar o aviso.
    if (value == null || value === d.defaultValue) continue;
    const m = template03Measure(value, d);
    if (m.over) {
      out.push({ slot: d.slot, maxLines: d.maxLines, maxCharsPerLine: d.maxCharsPerLine, ...m });
    }
  }
  return out;
}

// ─── Lorem ipsum dentro dos limites ─────────────────────────────

/**
 * Palavras do lorem clássico. Fonte única para todo texto de exemplo: nenhum
 * slide novo pode nascer com a copy do Figma — o "Passo 01 - Contexto total" é
 * conteúdo ilustrativo de outro carrossel.
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
 * Sai como linha única de propósito: é assim que `template03Measure` conta
 * (orçamento total, sem `\n`), então o contador da barra lateral nasce no verde.
 */
export function template03LoremForSlot(limits: {
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
 * Slots de um slide NOVO do modelo pedido: lorem em todo slot de texto do slide,
 * imagem vazia (o usuário escolhe a dele) e cantos próprios em
 * LOREM IPSUM/@LOREMIPSUM.
 *
 * A barra de perfil fica de fora: o `@` é do usuário e o wizard o preenche.
 */
export function template03NewSlideSlots(model: number): Template03Slots {
  const out: Template03Slots = {};
  for (const d of template03TextSlotsForModel(model)) {
    out[d.slot] = template03LoremForSlot(d);
  }
  for (const slot of GLOBAL_SLOTS) out[slot] = TEMPLATE_03_DEFAULT_CORNERS[slot];
  return out;
}
