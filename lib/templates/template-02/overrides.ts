/**
 * TEMPLATE 2 — overrides do usuário sobre o spec.
 *
 * Mesma disciplina do Template 1, e pela mesma razão: o carrossel NASCE seguindo
 * o template. Enquanto o usuário não mexe em nada, o spec é a única fonte de
 * forma e o render sai idêntico ao gabarito. Só depois valem cor, tamanho,
 * fonte, espaçamento, sublinhado, fundo e ajuste de imagem.
 *
 * O QUE CARACTERIZA UM OVERRIDE:
 *
 * - nos controles do SLIDE (fundo, posição/opacidade da imagem), a MARCA em
 *   `slide.templateOverrides`, gravada só pelos handlers da barra lateral;
 * - no estilo POR SLOT (`slide.templateSlotStyles`), a PRESENÇA da chave.
 *
 * Nunca a comparação do valor com um padrão do editor. Essa era a versão antiga
 * do T1 e quebrou no primeiro uso real: a geração gravava a cor da marca do
 * usuário em todo slide, o valor diferia do padrão, virava "escolha do usuário"
 * e pintava chapado por cima do desenho. Valor não é intenção; só o gesto é.
 */
import {
  GlobalSettings,
  ImagePosition,
  Slide,
  Template01SlideControl,
  TemplateSlotStyle,
} from '@/types';
import { ElementFontCSS, getElementFontCSS } from '@/lib/utils';
import { Template02Type, template02SlotType, template02Type } from './index';

/**
 * Controles de slide que o Template 2 usa.
 *
 * É um subconjunto dos do Template 1 e reaproveita as MESMAS chaves de
 * `slide.templateOverrides`: o campo é compartilhado pelos templates, e criar
 * nomes paralelos (`t02Background`) duplicaria significado no banco.
 *
 * O T2 não tem sombra, deslocamento de bloco nem alinhamento: a composição dele
 * é flexbox centrado, e mover bloco quebraria justamente a regra estruturante do
 * spec.
 */
export type Template02SlideControl = Extract<
  Template01SlideControl,
  'background' | 'backgroundImagePosition' | 'backgroundImageOpacity' | 'contentImagePosition'
>;

export interface Template02ImageOverride {
  position?: ImagePosition;
  /** 0–1; ausente = opaco. */
  opacity?: number;
}

export interface Template02Overrides {
  /** Estilo por slot. A chave existir JÁ é o gesto do usuário. */
  slotStyles: Record<string, TemplateSlotStyle>;
  /** Cor de fundo escolhida pelo usuário; ausente = o fundo do spec. */
  background?: string;
  /** Ajustes da imagem de fundo da capa. */
  coverImage: Template02ImageOverride;
  /** Ajustes da imagem do bloco dos slides internos. */
  contentImage: Template02ImageOverride;
}

/** Marcou? O valor do usuário vale. Não marcou? O spec vale. */
function touched(slide: Slide, key: Template02SlideControl): boolean {
  return slide.templateOverrides?.[key] === true;
}

/** Lê do `slide` só o que o usuário de fato marcou. */
export function template02Overrides(
  slide: Slide,
  globalSettings?: GlobalSettings
): Template02Overrides {
  const opacity = slide.backgroundImageOpacity ?? 100;
  const slotStyles = { ...(slide.templateSlotStyles ?? {}) };
  if (globalSettings?.templateCornerStyle) {
    for (const slot of ['header.category', 'header.handle']) {
      slotStyles[slot] = { ...(slotStyles[slot] ?? {}), ...globalSettings.templateCornerStyle };
    }
  }
  return {
    slotStyles,
    background: touched(slide, 'background') ? slide.backgroundColor : undefined,
    coverImage: {
      position:
        touched(slide, 'backgroundImagePosition') || slide.imagePosition.objectFit != null
          ? slide.imagePosition
          : undefined,
      opacity: touched(slide, 'backgroundImageOpacity') ? opacity / 100 : undefined,
    },
    contentImage: {
      position:
        touched(slide, 'contentImagePosition') || slide.contentImagePosition?.objectFit != null
          ? slide.contentImagePosition
          : undefined,
      opacity: touched(slide, 'backgroundImageOpacity') ? opacity / 100 : undefined,
    },
  };
}

/** Marca um controle como mexido, preservando os anteriores. */
export function markTemplate02Override(
  current: Slide['templateOverrides'],
  ...keys: Template02SlideControl[]
): NonNullable<Slide['templateOverrides']> {
  const next = { ...(current ?? {}) };
  for (const k of keys) next[k] = true;
  return next;
}

/** Tipografia de um bloco depois do estilo por slot. */
export interface Template02EffectiveType extends Template02Type {
  /** Fonte escolhida pelo usuário; ausente = a família do spec. */
  font?: ElementFontCSS;
  underline: boolean;
  color: string;
  /** Fundo do bloco; hoje só o marcador da capa usa. */
  background?: string;
  /** `true` quando a COR do texto foi escolhida pelo usuário. */
  colorIsExplicit: boolean;
}

/**
 * Tipografia efetiva de UM slot: a do spec com o estilo do usuário por cima.
 *
 * 🔴 Sem estilo nenhum a função devolve os números do spec INTACTOS, e é isso
 * que preserva a fidelidade de 0px.
 *
 * Com tamanho novo, a entrelinha e o tracking ACOMPANHAM na mesma razão: escalar
 * só a fonte colaria as linhas e apertaria as letras. Quando o usuário mexe no
 * tracking, o valor dele vem em `em` — é o formato que `templateSlotStyles`
 * grava, herdado do Template 1 — e vira px contra o tamanho efetivo.
 */
export function template02TypeFor(
  slot: string,
  specColor: string,
  ov: Template02Overrides
): Template02EffectiveType {
  const base = template02Type(template02SlotType(slot) ?? 'slideBody');
  const st = ov.slotStyles[slot];
  if (!st) return { ...base, underline: false, color: specColor, colorIsExplicit: false };

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
    underline: st.underline ?? false,
    color: st.color ?? specColor,
    background: st.background,
    colorIsExplicit: st.color != null,
  };
}

/** Quantos gestos do usuário existem neste slide — o badge do "Restaurar". */
export function template02SlideChanges(slide: Slide): number {
  return (
    Object.keys(slide.templateOverrides ?? {}).length +
    Object.keys(slide.templateSlotStyles ?? {}).length
  );
}
