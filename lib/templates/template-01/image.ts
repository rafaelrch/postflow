import { DEFAULT_IMAGE_POSITION, Slide } from '@/types';
import { template01ImageSlot, template01SlideMedia } from './index';

/**
 * Fonte única da imagem de um slide do TEMPLATE 1.
 *
 * O problema que isto resolve: existiam DUAS verdades. O slot
 * (`templateSlots[imageSlot]`) e os campos genéricos do editor
 * (`backgroundImageUrl`/`gridImageUrl`/`contentImageUrl`), com o render caindo
 * nos genéricos só quando o slot está VAZIO. Cada caminho escrevia num lado:
 * o upload manual no slot, a geração por IA nos genéricos. Resultado:
 *
 * - com upload manual no slot, gerar por IA terminava com "pronto!" e nada
 *   mudava na tela — o slot continuava vencendo;
 * - remover pelo painel de upload limpava só o slot, e a imagem genérica
 *   reaparecia como fallback, como se tivesse voltado sozinha.
 *
 * A regra agora: **quem escreve, escreve no slot e zera os genéricos**. A
 * LEITURA continua caindo nos genéricos (`template01SlideImageUrl`), que é o
 * que mantém funcionando o carrossel salvo antes disto — ele se normaliza na
 * primeira edição, sem migração de dados.
 */

/** Patch que coloca `url` como imagem do slide. */
export function template01SetImage(slide: Slide, model: number, url: string): Partial<Slide> {
  const slot = template01ImageSlot(model);
  if (!slot) return {};
  const media = template01SlideMedia(model);
  return {
    templateSlots: { ...(slide.templateSlots ?? {}), [slot]: url },
    ...(media.background ? { imagePosition: { ...DEFAULT_IMAGE_POSITION } } : {}),
    ...(media.content ? { contentImagePosition: { ...DEFAULT_IMAGE_POSITION } } : {}),
    // Os genéricos existem só como fallback de deck antigo. Deixá-los
    // preenchidos aqui recriaria a segunda verdade que este módulo elimina.
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  };
}

/** Patch que tira a imagem do slide — dos dois lados, senão ela volta. */
export function template01ClearImage(slide: Slide, model: number): Partial<Slide> {
  const slot = template01ImageSlot(model);
  if (!slot) return {};
  return {
    templateSlots: { ...(slide.templateSlots ?? {}), [slot]: '' },
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  };
}
