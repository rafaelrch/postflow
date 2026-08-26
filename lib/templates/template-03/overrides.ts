/**
 * TEMPLATE 3 — "FlowLine": overrides do usuário sobre o spec.
 *
 * Mesma disciplina dos Templates 1 e 2, e pela mesma razão: o carrossel NASCE
 * seguindo o template. Enquanto o usuário não mexe em nada, o spec é a única
 * fonte de forma e o render sai idêntico ao gabarito do `render.py`. Só depois
 * valem cor, tamanho, fonte, espaçamento, sublinhado, fundo e ajuste de imagem.
 *
 * O QUE CARACTERIZA UM OVERRIDE:
 *
 * - nos controles do SLIDE (fundo, posição/opacidade da imagem), a MARCA em
 *   `slide.templateOverrides`, gravada só pelos handlers da barra lateral;
 * - no estilo POR SLOT (`slide.templateSlotStyles`), a PRESENÇA da chave.
 *
 * 🔴 NUNCA a comparação do valor com um padrão do editor. Essa era a versão
 * antiga do T1 e quebrou no primeiro uso real: a geração gravava a cor da marca
 * do usuário em todo slide, o valor diferia do padrão, virava "escolha do
 * usuário" e pintava chapado por cima do desenho do Figma. **Valor não é
 * intenção; só o gesto é.** (Armadilha #3 do estudo.)
 *
 * Corolário que vale para a fatia S5: a GERAÇÃO nunca escreve aqui.
 */
import {
  GlobalSettings,
  ImagePosition,
  Slide,
  Template01SlideControl,
  Template03ContentAlign,
  Template03ContentPosition,
  Template03GradientDirection,
  TemplateSlotStyle,
} from '@/types';
import { ElementFontCSS, getElementFontCSS } from '@/lib/utils';
import {
  TEMPLATE_03_PALETTE,
  TEMPLATE_03_SPEC,
  Template03Node,
  Template03SpecSlide,
} from './index';

/**
 * Controles de slide que o Template 3 usa.
 *
 * É um subconjunto dos do Template 1 e reaproveita as MESMAS chaves de
 * `slide.templateOverrides`: o campo é compartilhado pelos templates, e criar
 * nomes paralelos (`t03Background`) duplicaria significado no banco.
 *
 * O FlowLine não tem sombra (o scrim do spec já é o degradê de legibilidade),
 * nem deslocamento de bloco, nem alinhamento: a descida progressiva do título é
 * a regra estruturante do template, e mover o bloco a desmancharia.
 *
 * `contentImagePosition` não entra: todo modelo do T3 tem UMA imagem, a de
 * fundo full-bleed. Não existe o bloco de conteúdo do T2.
 */
export type Template03SlideControl = Extract<
  Template01SlideControl,
  'background' | 'backgroundImagePosition' | 'backgroundImageOpacity'
>;

export type { Template03GradientDirection } from '@/types';

export const TEMPLATE_03_GRADIENT_DIRECTIONS: readonly Template03GradientDirection[] = [
  'bottom-to-top',
  'top-to-bottom',
  'left-to-right',
  'right-to-left',
];

export const TEMPLATE_03_GRADIENT_DIRECTION_LABELS: Record<Template03GradientDirection, string> = {
  'bottom-to-top': 'Baixo para cima',
  'top-to-bottom': 'Cima para baixo',
  'left-to-right': 'Esquerda para direita',
  'right-to-left': 'Direita para esquerda',
};

const GRADIENT_ANGLES: Record<Template03GradientDirection, number> = {
  // O CSS aponta na direção da primeira parada. Como o scrim começa
  // transparente e termina preto, o sentido visual da camada escura é o
  // oposto do ângulo matemático que o rótulo descreve.
  'bottom-to-top': 180,
  'top-to-bottom': 0,
  'left-to-right': 270,
  'right-to-left': 90,
};

function normalizedAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function gradientAngleFromCss(css: string): number | undefined {
  const match = css.match(/linear-gradient\(\s*(-?(?:\d+(?:\.\d*)?|\.\d+))deg/i);
  return match ? Number(match[1]) : undefined;
}

function specOverlayCss(model: number): string {
  return (
    template03GradientSlide(model).backgroundLayers?.find((layer) => layer.type === 'GRADIENT_SCRIM')?.css ??
    'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000000 100%)'
  );
}

function specGradientAngle(model: number): number {
  const layer = template03GradientSlide(model).backgroundLayers?.find(
    (candidate) => candidate.type === 'GRADIENT_SCRIM'
  );
  return layer?.angleDeg ?? gradientAngleFromCss(specOverlayCss(model)) ?? 180;
}

/**
 * Ângulos de REFERÊNCIA do sentido visual usados para inferir a direção default
 * do spec. O spec continua sendo devolvido verbatim quando não há override;
 * este mapa só decide qual rótulo fica selecionado no painel.
 */
const GRADIENT_ANGLES_STANDARD: Record<Template03GradientDirection, number> = {
  ...GRADIENT_ANGLES,
};

/** Direção default inferida do ângulo do GRADIENT_SCRIM no spec, nunca redigitada. */
export function template03DefaultGradientDirection(model: number): Template03GradientDirection {
  const angle = normalizedAngle(specGradientAngle(model));
  return TEMPLATE_03_GRADIENT_DIRECTIONS.reduce((closest, direction) => {
    const distance = Math.min(
      Math.abs(angle - GRADIENT_ANGLES_STANDARD[direction]),
      360 - Math.abs(angle - GRADIENT_ANGLES_STANDARD[direction])
    );
    const closestDistance = Math.min(
      Math.abs(angle - GRADIENT_ANGLES_STANDARD[closest]),
      360 - Math.abs(angle - GRADIENT_ANGLES_STANDARD[closest])
    );
    return distance < closestDistance ? direction : closest;
  }, 'bottom-to-top' as Template03GradientDirection);
}

/** Lê o valor persistido do slide; ausência/valor inválido volta ao spec. */
export function template03GradientDirectionFor(
  slide: Slide,
  model: number
): Template03GradientDirection {
  const stored = slide.templateOverrides?.overlayGradientDirection;
  return stored && TEMPLATE_03_GRADIENT_DIRECTIONS.includes(stored)
    ? stored
    : template03DefaultGradientDirection(model);
}

/** Posições verticais do bloco de conteúdo (título+corpo) do FlowLine. */
export const TEMPLATE_03_CONTENT_POSITIONS: Template03ContentPosition[] = [
  'topo',
  'centro',
  'baixo',
];

export const TEMPLATE_03_CONTENT_POSITION_LABELS: Record<
  Template03ContentPosition,
  string
> = {
  topo: '⬆ topo',
  centro: '↕ centro',
  baixo: '⬇ baixo',
};

/** Lê a posição do conteúdo; ausência volta ao 'baixo' (posição do spec). */
export function template03ContentPositionFor(
  slide: Slide,
  _model: number
): Template03ContentPosition {
  const stored = slide.templateOverrides?.contentPosition;
  return stored && TEMPLATE_03_CONTENT_POSITIONS.includes(stored) ? stored : 'baixo';
}

export const TEMPLATE_03_CONTENT_ALIGNS: readonly Template03ContentAlign[] = [
  'esquerda',
  'centro',
  'direita',
];

export const TEMPLATE_03_CONTENT_ALIGN_LABELS: Record<Template03ContentAlign, string> = {
  esquerda: 'Esquerda',
  centro: 'Centro',
  direita: 'Direita',
};

/**
 * Lê o alinhamento horizontal do conteúdo; ausência volta ao 'esquerda' (o spec
 * do FlowLine alinha o bloco à esquerda da coluna, então 'esquerda' é o
 * gabarito). 'centro'/'direita' são escolhas explícitas do usuário.
 */
export function template03ContentAlignFor(
  slide: Slide,
  _model: number
): Template03ContentAlign {
  const stored = slide.templateOverrides?.contentAlign;
  return stored && TEMPLATE_03_CONTENT_ALIGNS.includes(stored) ? stored : 'esquerda';
}

function replaceGradientAngle(css: string, angle: number): string {
  return css.replace(
    /linear-gradient\(\s*(-?(?:\d+(?:\.\d*)?|\.\d+))deg/i,
    `linear-gradient(${angle}deg`
  );
}

/** Aplica a direção ao CSS do spec, preservando paradas e a faixa do overlay. */
export function template03GradientCss(
  model: number,
  css: string,
  direction: Template03GradientDirection
): string {
  if (direction === template03DefaultGradientDirection(model)) return css;
  return replaceGradientAngle(css, GRADIENT_ANGLES[direction]);
}

export function template03OverlayGradientCss(
  model: number,
  direction: Template03GradientDirection
): string {
  return template03GradientCss(model, specOverlayCss(model), direction);
}

export interface Template03ImageOverride {
  position?: ImagePosition;
  /** 0–1; ausente = opaca. */
  opacity?: number;
}

export interface Template03Overrides {
  /** Estilo por slot. A chave existir JÁ é o gesto do usuário. */
  slotStyles: Record<string, TemplateSlotStyle>;
  /** Cor de fundo escolhida pelo usuário; ausente = o degradê do spec. */
  background?: string;
  /** Ajustes da imagem de fundo. */
  image: Template03ImageOverride;
}

/** Marcou? O valor do usuário vale. Não marcou? O spec vale. */
function touched(slide: Slide, key: Template03SlideControl): boolean {
  return slide.templateOverrides?.[key] === true;
}

/** Os slots cuja tipografia o controle GLOBAL de cantos governa. */
const CORNER_SLOTS = ['cantos.left', 'cantos.right'];

/** Lê do `slide` só o que o usuário de fato marcou. */
export function template03Overrides(
  slide: Slide,
  globalSettings?: GlobalSettings
): Template03Overrides {
  const opacity = slide.backgroundImageOpacity ?? 100;
  const slotStyles = { ...(slide.templateSlotStyles ?? {}) };
  if (globalSettings?.templateCornerStyle) {
    for (const slot of CORNER_SLOTS) {
      slotStyles[slot] = { ...(slotStyles[slot] ?? {}), ...globalSettings.templateCornerStyle };
    }
  }
  return {
    slotStyles,
    background: touched(slide, 'background') ? slide.backgroundColor : undefined,
    image: {
      position:
        touched(slide, 'backgroundImagePosition') || slide.imagePosition.objectFit != null
          ? slide.imagePosition
          : undefined,
      opacity: touched(slide, 'backgroundImageOpacity') ? opacity / 100 : undefined,
    },
  };
}

/** Marca um controle como mexido, preservando os anteriores. */
export function markTemplate03Override(
  current: Slide['templateOverrides'],
  ...keys: Template03SlideControl[]
): NonNullable<Slide['templateOverrides']> {
  const next = { ...(current ?? {}) };
  for (const k of keys) next[k] = true;
  return next;
}

/** Quantos gestos do usuário existem neste slide — o badge do "Restaurar". */
export function template03SlideChanges(slide: Slide): number {
  return (
    Object.keys(slide.templateOverrides ?? {}).length +
    Object.keys(slide.templateSlotStyles ?? {}).length
  );
}

// ─── Fundo ──────────────────────────────────────────────────────

export interface Template03SpecBackground {
  /** O CSS que o render aplica quando o slide segue o template. */
  css: string;
  /**
   * Hex para o seletor de cor abrir mostrando algo verdadeiro do desenho: a
   * primeira parada do degradê. O seletor nativo e o campo hex só aceitam
   * `#RRGGBB`; um degradê ali abriria em branco.
   */
  swatch: string;
}

/**
 * Fundo do SPEC de um modelo.
 *
 * Os dois modelos do FlowLine têm degradê, nenhum tem cor chapada — então
 * escolher uma cor no painel SUBSTITUI o degradê inteiro por chapado, como nos
 * modelos 1 e 2 do Template 1.
 *
 * 🔸 O degradê do passo é o do slide 3 do spec, não o do slide 2 (invertido) —
 * ver `TEMPLATE_03_DESIGN_TWEAKS.scrimDoPasso`. Quem resolve isso é
 * `template03GradientSlide`, para a barra lateral e o render nunca divergirem.
 */
export function template03SpecBackground(model: number): Template03SpecBackground {
  const paint = template03GradientSlide(model).background?.[0];
  const css = paint?.css ?? TEMPLATE_03_PALETTE.preto;
  return { css, swatch: paint?.stops?.[0]?.color ?? TEMPLATE_03_PALETTE.preto };
}

/**
 * O slide do spec de onde sai o DEGRADÊ de cada modelo.
 *
 * A capa usa o seu (178.58deg). TODO passo usa o do slide 3 (180deg): o slide 2
 * traz o mesmo degradê na direção oposta, e num deck ABERTO alternar por
 * paridade faz o carrossel piscar ao passar os slides. Desvio registrado em
 * `TEMPLATE_03_DESIGN_TWEAKS.scrimDoPasso`.
 *
 * Lê `TEMPLATE_03_SPEC.slides` direto porque o slide 3 NÃO é modelo —
 * `template03SpecSlideOf` só resolve modelo e cairia na capa.
 *
 * Mora aqui, e não no componente, porque o seletor de cor da barra lateral tem
 * de abrir com a MESMA cor que o render pinta.
 */
const GRADIENT_SPEC_SLIDE: Record<number, number> = { 1: 1, 2: 3 };

export function template03GradientSlide(model: number): Template03SpecSlide {
  const index = GRADIENT_SPEC_SLIDE[model] ?? 1;
  return TEMPLATE_03_SPEC.slides.find((s) => s.index === index) ?? TEMPLATE_03_SPEC.slides[0];
}

// ─── Tipografia efetiva ─────────────────────────────────────────

export interface Template03EffectiveType {
  fontFamily: string;
  fontSize: number;
  /** px, como o spec grava. */
  lineHeight: number;
  /** px — o `templateSlotStyles` guarda em `em` e a conversão é aqui. */
  letterSpacing: number;
  fontWeight: number;
  fontStyle: string;
  color: string;
  underline: boolean;
  /** Fonte escolhida pelo usuário; ausente = a família do spec. */
  font?: ElementFontCSS;
  /** Empurra o bloco para dentro — o mesmo slider "Margem" da aba Cantos. */
  margin: number;
  /** `false` esconde o bloco (o toggle do olho na barra). */
  visible: boolean;
  /** 0–100; o controle global de cantos. */
  opacity: number;
}

/**
 * Tipografia efetiva de UM bloco: a do spec com o estilo do usuário por cima.
 *
 * 🔴 Sem estilo nenhum a função devolve os números do spec INTACTOS, e é isso
 * que preserva a fidelidade contra o gabarito.
 *
 * Com tamanho novo, a entrelinha e o tracking ACOMPANHAM na mesma razão: escalar
 * só a fonte colaria as linhas e apertaria as letras. O tracking do usuário vem
 * em `em` — o formato que `templateSlotStyles` grava, herdado do Template 1 — e
 * vira px contra o tamanho efetivo.
 */
export function template03TypeFor(
  node: Template03Node,
  fontFamily: string,
  ov: Template03Overrides
): Template03EffectiveType {
  const t = node.typography!;
  const specColor = node.fills?.[0]?.css ?? TEMPLATE_03_PALETTE.branco;
  const st = ov.slotStyles[node.slot ?? ''];

  const base: Template03EffectiveType = {
    fontFamily,
    fontSize: t.fontSizePx,
    lineHeight: t.lineHeightPx,
    letterSpacing: t.letterSpacingPx,
    fontWeight: t.fontWeight ?? 400,
    fontStyle: t.italic ? 'italic' : 'normal',
    color: specColor,
    underline: false,
    margin: 0,
    visible: true,
    opacity: 100,
  };
  if (!st) return base;

  const fontSize = st.fontSize ?? base.fontSize;
  // Divisão de floats idênticos dá exatamente 1: sem override de tamanho, nem o
  // último dígito da entrelinha se mexe.
  const scale = base.fontSize ? fontSize / base.fontSize : 1;
  return {
    ...base,
    fontSize,
    lineHeight: base.lineHeight * scale,
    letterSpacing:
      st.letterSpacing != null ? st.letterSpacing * fontSize : base.letterSpacing * scale,
    font: st.font ? getElementFontCSS(st.font) : undefined,
    color: st.color ?? specColor,
    underline: st.underline ?? false,
    margin: st.margin ?? 0,
    visible: st.visible !== false,
    opacity: st.opacity ?? 100,
  };
}
