import { DEFAULT_IMAGE_POSITION, Slide } from '@/types';
import { template03AvatarSlot, template03ImageSlot } from './index';

/**
 * Fonte única da imagem de um slide do TEMPLATE 3.
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
 * 🔴 Molde do T2, NUNCA o do T1: aqui a LEITURA também é só o slot. O T1 precisa
 * do fallback na leitura porque tem deck salvo de antes da regra; o FlowLine
 * ainda não tem um único deck salvo — não pode nascer com a segunda verdade.
 * (Armadilha #1 do estudo.)
 *
 * Todo modelo do T3 tem imagem — a de fundo full-bleed, 1080x1350 — então não
 * existe aqui o caso do modelo 6 do T1, onde gerar cobria crédito e não pintava
 * nada.
 */

/** Patch que coloca `url` como imagem do slide. */
export function template03SetImage(slide: Slide, model: number, url: string): Partial<Slide> {
  return {
    templateSlots: { ...(slide.templateSlots ?? {}), [template03ImageSlot(model)]: url },
    // A imagem do FlowLine é sempre a de FUNDO: um enquadramento só, e ele
    // reinicia a cada troca de foto (o ajuste anterior era daquela imagem).
    imagePosition: { ...DEFAULT_IMAGE_POSITION },
    // Os genéricos não são lidos pelo T3. Zerá-los evita que um deck que trocou
    // de estilo carregue uma imagem invisível que reaparece se alguém voltar.
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  };
}

/** Patch que tira a imagem do slide — dos dois lados, senão ela volta. */
export function template03ClearImage(slide: Slide, model: number): Partial<Slide> {
  return {
    templateSlots: { ...(slide.templateSlots ?? {}), [template03ImageSlot(model)]: '' },
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  };
}

/** Patch da foto de perfil: o mesmo perfil é projetado em todos os slides. */
export function template03SetAvatar(slide: Slide, model: number, url: string): Partial<Slide> {
  return {
    templateSlots: { ...(slide.templateSlots ?? {}), [template03AvatarSlot(model)]: url },
  };
}

export function template03ClearAvatar(slide: Slide, model: number): Partial<Slide> {
  return {
    templateSlots: { ...(slide.templateSlots ?? {}), [template03AvatarSlot(model)]: '' },
  };
}

/**
 * A imagem que o slide EXIBE hoje.
 *
 * A barra lateral e o render precisam concordar sobre isto: é esta função que
 * decide se o painel mostra miniatura e sliders, e é a mesma regra que o
 * `Template03Slide` usa para pintar. Origem não importa (IA ou upload): o que
 * manda é o slot de imagem do MODELO.
 */
export function template03SlideImageUrl(
  slide: { templateSlots?: Record<string, string> },
  model: number
): string {
  return slide.templateSlots?.[template03ImageSlot(model)] || '';
}
