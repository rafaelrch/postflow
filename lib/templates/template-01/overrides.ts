/**
 * TEMPLATE 1 — overrides do usuário sobre o spec.
 *
 * O carrossel NASCE seguindo o template: enquanto o usuário não mexe em nada, o
 * spec é a única fonte de forma e o render sai idêntico ao gabarito do
 * `render.py`. Depois disso valem os mesmos controles dos outros estilos — cor,
 * tamanho, fonte, posição, fundo, imagem, degradê, cantos.
 *
 * O QUE CARACTERIZA UM OVERRIDE é a MARCA em `slide.templateOverrides` /
 * `globalSettings.templateOverrides`, gravada só pelos handlers da barra
 * lateral. Nunca a comparação do valor com o padrão do editor.
 *
 * A versão anterior comparava (`backgroundColor !== DEFAULT_SLIDE.backgroundColor`)
 * e quebrou no primeiro uso real: a geração gravava a cor da MARCA do usuário em
 * todo slide, ela diferia de `#111111`, virava "escolha do usuário" e pintava
 * chapado por cima dos degradês do Figma. Valor não é intenção; só o gesto é.
 */
import {
  DEFAULT_CORNERS,
  DEFAULT_SLIDE,
  GlobalSettings,
  ImagePosition,
  Slide,
  Template01CornerControl,
  Template01SlideControl,
} from '@/types';
import { getElementFontCSS, getShadowOverlayGradient, ElementFontCSS } from '@/lib/utils';
import { SpecNode } from './index';

/** Papel do bloco no template — decide qual controle da barra lateral o rege. */
export type Template01Kind = 'title' | 'body' | 'corner';

const TITLE_ROLES = new Set(['titulo-capa', 'titulo', 'titulo-coluna', 'chapeu']);
const CORNER_ROLES = new Set(['assinatura', 'arroba']);

export function template01Kind(node: SpecNode): Template01Kind {
  const role = node.role ?? '';
  if (CORNER_ROLES.has(role) || node.slot?.startsWith('cantos.')) return 'corner';
  if (TITLE_ROLES.has(role)) return 'title';
  return 'body';
}

export interface Template01TextOverride {
  color?: string;
  /** Fator sobre o tamanho do spec — 1 = intocado. Preserva a proporção entre blocos. */
  fontScale: number;
  font?: ElementFontCSS;
  underline: boolean;
  letterSpacingEm?: number;
  /** Entrelinha como razão do tamanho da fonte; ausente = a razão do spec. */
  lineHeightRatio?: number;
  opacity?: number;
  /** Alinhamento horizontal; ausente = o do spec. */
  align?: 'left' | 'center' | 'right';
}

export interface Template01ImageOverride {
  position?: ImagePosition;
  /** 0–1; ausente = opaco. */
  opacity?: number;
}

export interface Template01Overrides {
  title: Template01TextOverride;
  body: Template01TextOverride;
  corner: Template01TextOverride;
  /** Cor de fundo escolhida pelo usuário; ausente = o fundo do spec. */
  background?: string;
  /** Degradê de sombra/overlay; ausente = sem overlay extra. */
  shadow?: string;
  hideCorners: boolean;
  /** Deslocamento dos blocos de texto, em px do canvas do spec. */
  textOffset?: { x: number; y: number };
  /** Vão extra entre título e corpo, em px do canvas. */
  titleGapDelta?: number;
  /** Distância dos cantos às bordas, em px; ausente = a do spec. */
  cornerDistance?: number;
  backgroundImage: Template01ImageOverride;
  contentImage: Template01ImageOverride;
}

/** Marcou? O valor do usuário vale. Não marcou? O spec vale. */
function touched(slide: Slide, key: Template01SlideControl): boolean {
  return slide.templateOverrides?.[key] === true;
}

function cornerTouched(gs: GlobalSettings, key: Template01CornerControl): boolean {
  return gs.templateOverrides?.[key] === true;
}

function textOverridesFor(
  slide: Slide,
  keys: {
    color: Template01SlideControl;
    size: Template01SlideControl;
    font: Template01SlideControl;
    underline: Template01SlideControl;
    letterSpacing?: Template01SlideControl;
  },
  values: {
    color: string | undefined;
    size: number;
    defaultSize: number;
    font: Slide['titleFont'];
    underline: boolean | undefined;
    letterSpacing: number | undefined;
  }
): Template01TextOverride {
  return {
    color: touched(slide, keys.color) ? values.color : undefined,
    fontScale: touched(slide, keys.size) && values.defaultSize ? values.size / values.defaultSize : 1,
    font: touched(slide, keys.font) && values.font ? getElementFontCSS(values.font) : undefined,
    underline: touched(slide, keys.underline) && !!values.underline,
    letterSpacingEm:
      keys.letterSpacing && touched(slide, keys.letterSpacing) ? values.letterSpacing : undefined,
    lineHeightRatio: touched(slide, 'lineHeight')
      ? slide.lineHeight ?? DEFAULT_SLIDE.lineHeight
      : undefined,
    align: touched(slide, 'textAlignment') ? slide.textAlignment : undefined,
  };
}

/** Lê do `slide`/`globalSettings` só o que o usuário de fato marcou. */
export function template01Overrides(
  slide: Slide,
  globalSettings: GlobalSettings
): Template01Overrides {
  const corners = globalSettings.corners ?? DEFAULT_CORNERS;
  const shadow = slide.shadow ?? DEFAULT_SLIDE.shadow;
  const bgOpacity = slide.backgroundImageOpacity ?? 100;

  return {
    title: textOverridesFor(
      slide,
      {
        color: 'titleColor',
        size: 'titleSize',
        font: 'titleFont',
        underline: 'titleUnderline',
        letterSpacing: 'titleLetterSpacing',
      },
      {
        color: slide.titleColor,
        size: slide.fontSize?.title ?? DEFAULT_SLIDE.fontSize.title,
        defaultSize: DEFAULT_SLIDE.fontSize.title,
        font: slide.titleFont,
        underline: slide.titleUnderline,
        letterSpacing: slide.titleLetterSpacing,
      }
    ),
    body: textOverridesFor(
      slide,
      {
        color: 'descriptionColor',
        size: 'descriptionSize',
        font: 'descriptionFont',
        underline: 'descriptionUnderline',
      },
      {
        color: slide.descriptionColor,
        size: slide.fontSize?.description ?? DEFAULT_SLIDE.fontSize.description,
        defaultSize: DEFAULT_SLIDE.fontSize.description,
        font: slide.descriptionFont,
        underline: slide.descriptionUnderline,
        letterSpacing: undefined,
      }
    ),
    corner: {
      color: cornerTouched(globalSettings, 'cornerColor') ? corners.color : undefined,
      fontScale:
        cornerTouched(globalSettings, 'cornerSize') && corners.fontSize
          ? corners.fontSize / DEFAULT_CORNERS.fontSize
          : 1,
      font:
        cornerTouched(globalSettings, 'cornerFont') && corners.elementFont
          ? getElementFontCSS(corners.elementFont)
          : undefined,
      underline: false,
      opacity: cornerTouched(globalSettings, 'cornerOpacity') ? corners.opacity / 100 : undefined,
    },
    background: touched(slide, 'background') ? slide.backgroundColor : undefined,
    // O spec já traz o próprio degradê; o overlay do editor só entra quando o
    // usuário mexe no controle — senão a sombra de fábrica escureceria o
    // template inteiro no primeiro render.
    shadow:
      touched(slide, 'shadow') && shadow.style !== 'none'
        ? getShadowOverlayGradient(shadow.opacity, shadow.color, shadow.size, shadow.distance)
        : undefined,
    hideCorners: corners.show === false,
    textOffset: touched(slide, 'textOffset') ? slide.textOffset : undefined,
    titleGapDelta: touched(slide, 'titleDescriptionGap') ? slide.titleDescriptionGap : undefined,
    cornerDistance: cornerTouched(globalSettings, 'cornerDistance')
      ? corners.borderDistance
      : undefined,
    backgroundImage: {
      position: touched(slide, 'backgroundImagePosition') ? slide.imagePosition : undefined,
      opacity: touched(slide, 'backgroundImageOpacity') ? bgOpacity / 100 : undefined,
    },
    contentImage: {
      position: touched(slide, 'contentImagePosition') ? slide.contentImagePosition : undefined,
      opacity: touched(slide, 'backgroundImageOpacity') ? bgOpacity / 100 : undefined,
    },
  };
}

/** Marca um controle como mexido, preservando os anteriores. */
export function markTemplate01Override(
  current: Slide['templateOverrides'],
  ...keys: Template01SlideControl[]
): NonNullable<Slide['templateOverrides']> {
  const next = { ...(current ?? {}) };
  for (const k of keys) next[k] = true;
  return next;
}

/** Idem para os cantos, que valem para o deck inteiro. */
export function markTemplate01CornerOverride(
  current: GlobalSettings['templateOverrides'],
  ...keys: Template01CornerControl[]
): NonNullable<GlobalSettings['templateOverrides']> {
  const next = { ...(current ?? {}) };
  for (const k of keys) next[k] = true;
  return next;
}
