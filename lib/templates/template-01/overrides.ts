/**
 * TEMPLATE 1 — overrides do usuário sobre o spec.
 *
 * O carrossel NASCE seguindo o template: enquanto o usuário não mexe em nada, o
 * spec é a única fonte de forma e o render sai idêntico ao gabarito do
 * `render.py`. Depois disso valem os mesmos controles dos outros estilos — cor,
 * tamanho de fonte, fonte, fundo, imagem, sombra, cantos.
 *
 * Como o `Slide` não tem "campo vazio" para a maioria desses controles (ele
 * nasce preenchido com `DEFAULT_SLIDE`), o que caracteriza um override é o valor
 * DIFERIR do padrão do editor. É por isso que este módulo compara com
 * `DEFAULT_SLIDE`/`DEFAULT_CORNERS` em vez de checar `undefined`: sem isso o
 * `#111111` de fábrica pintaria por cima do fundo do Figma no primeiro render.
 */
import {
  DEFAULT_CORNERS,
  DEFAULT_SLIDE,
  GlobalSettings,
  ImagePosition,
  Slide,
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
  backgroundImage: Template01ImageOverride;
  contentImage: Template01ImageOverride;
}

function samePosition(a: ImagePosition | undefined, b: ImagePosition): boolean {
  return !a || (a.x === b.x && a.y === b.y && a.zoom === b.zoom && !a.objectFit);
}

function textOverridesFor(
  color: string | undefined,
  defaultColor: string | undefined,
  size: number,
  defaultSize: number,
  font: Slide['titleFont'],
  underline: boolean | undefined,
  letterSpacing: number | undefined,
  lineHeight: number
): Template01TextOverride {
  return {
    color: color && color !== defaultColor ? color : undefined,
    fontScale: defaultSize ? size / defaultSize : 1,
    font: font ? getElementFontCSS(font) : undefined,
    underline: !!underline,
    letterSpacingEm: letterSpacing,
    lineHeightRatio: lineHeight !== DEFAULT_SLIDE.lineHeight ? lineHeight : undefined,
  };
}

/** Lê do `slide`/`globalSettings` só o que o usuário de fato mudou. */
export function template01Overrides(
  slide: Slide,
  globalSettings: GlobalSettings
): Template01Overrides {
  const corners = globalSettings.corners ?? DEFAULT_CORNERS;
  const shadow = slide.shadow ?? DEFAULT_SLIDE.shadow;
  const shadowTouched =
    shadow.style !== DEFAULT_SLIDE.shadow.style ||
    shadow.opacity !== DEFAULT_SLIDE.shadow.opacity ||
    shadow.color !== undefined ||
    shadow.size !== undefined ||
    shadow.distance !== undefined;

  const bgOpacity = slide.backgroundImageOpacity ?? 100;

  return {
    title: textOverridesFor(
      slide.titleColor,
      undefined,
      slide.fontSize?.title ?? DEFAULT_SLIDE.fontSize.title,
      DEFAULT_SLIDE.fontSize.title,
      slide.titleFont,
      slide.titleUnderline,
      slide.titleLetterSpacing,
      slide.lineHeight ?? DEFAULT_SLIDE.lineHeight
    ),
    body: textOverridesFor(
      slide.descriptionColor,
      undefined,
      slide.fontSize?.description ?? DEFAULT_SLIDE.fontSize.description,
      DEFAULT_SLIDE.fontSize.description,
      slide.descriptionFont,
      slide.descriptionUnderline,
      undefined,
      slide.lineHeight ?? DEFAULT_SLIDE.lineHeight
    ),
    corner: {
      color: corners.color && corners.color !== DEFAULT_CORNERS.color ? corners.color : undefined,
      fontScale: corners.fontSize ? corners.fontSize / DEFAULT_CORNERS.fontSize : 1,
      font:
        corners.elementFont && corners.elementFont !== DEFAULT_CORNERS.elementFont
          ? getElementFontCSS(corners.elementFont)
          : undefined,
      underline: false,
      opacity: corners.opacity !== DEFAULT_CORNERS.opacity ? corners.opacity / 100 : undefined,
    },
    background:
      slide.backgroundColor && slide.backgroundColor !== DEFAULT_SLIDE.backgroundColor
        ? slide.backgroundColor
        : undefined,
    // O spec já traz o próprio degradê; o overlay do editor só entra quando o
    // usuário mexe no controle — senão a sombra de fábrica escureceria o
    // template inteiro no primeiro render.
    shadow:
      shadowTouched && shadow.style !== 'none'
        ? getShadowOverlayGradient(shadow.opacity, shadow.color, shadow.size, shadow.distance)
        : undefined,
    hideCorners: corners.show === false,
    backgroundImage: {
      position: samePosition(slide.imagePosition, DEFAULT_SLIDE.imagePosition)
        ? undefined
        : slide.imagePosition,
      opacity: bgOpacity !== 100 ? bgOpacity / 100 : undefined,
    },
    contentImage: {
      position: slide.contentImagePosition,
      opacity: bgOpacity !== 100 ? bgOpacity / 100 : undefined,
    },
  };
}
