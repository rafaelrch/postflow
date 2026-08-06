import { DEFAULT_IMAGE_POSITION, Slide } from '@/types';
import { template02ImageSlot } from './index';

/**
 * Fonte única da imagem de um slide do TEMPLATE 2.
 *
 * O bug que este módulo existe para NÃO repetir (aconteceu no Template 1):
 * havia duas verdades — o slot (`templateSlots[imageSlot]`) e os campos
 * genéricos do editor (`backgroundImageUrl`/`gridImageUrl`/`contentImageUrl`) —
 * e cada caminho escrevia num lado. O upload manual no slot, a geração por IA
 * nos genéricos. Como o slot vence na hora de pintar:
 *
 * - com upload manual no slot, gerar por IA terminava com "pronto!" e nada
 *   mudava na tela;
 * - remover pelo painel limpava só o slot e a imagem genérica reaparecia como
 *   fallback, como se tivesse voltado sozinha.
 *
 * A regra: **quem escreve, escreve no SLOT e zera os genéricos.**
 *
 * Diferença em relação ao T1: aqui a LEITURA também é só o slot
 * (`Template02Slide` nunca olhou os genéricos). O T1 precisa do fallback na
 * leitura porque tem deck salvo de antes da regra; o T2 nasceu com uma verdade
 * só e não deve ganhar uma segunda.
 */

/** Patch que coloca `url` como imagem do slide. */
export function template02SetImage(slide: Slide, model: number, url: string): Partial<Slide> {
  return {
    templateSlots: { ...(slide.templateSlots ?? {}), [template02ImageSlot(model)]: url },
    ...(model === 1
      ? { imagePosition: { ...DEFAULT_IMAGE_POSITION } }
      : { contentImagePosition: { ...DEFAULT_IMAGE_POSITION } }),
    // Os genéricos não são lidos pelo T2. Zerá-los evita que um deck que trocou
    // de estilo carregue uma imagem invisível que reaparece se alguém voltar.
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  };
}

/** Patch que tira a imagem do slide — dos dois lados, senão ela volta. */
export function template02ClearImage(slide: Slide, model: number): Partial<Slide> {
  return {
    templateSlots: { ...(slide.templateSlots ?? {}), [template02ImageSlot(model)]: '' },
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  };
}

/**
 * A imagem que o slide EXIBE hoje.
 *
 * A barra lateral e o render precisam concordar sobre isto: é esta função que
 * decide se o painel mostra miniatura e sliders, e é a mesma regra que o
 * `Template02Slide` usa para pintar. Origem não importa (IA ou upload): o que
 * manda é o slot de imagem do modelo.
 */
export function template02SlideImageUrl(
  slide: { templateSlots?: Record<string, string> },
  model: number
): string {
  return slide.templateSlots?.[template02ImageSlot(model)] || '';
}
