import { TEMPLATE_01_DEFAULT_CORNERS } from '@/lib/templates/template-01';
import { TEMPLATE_02_DEFAULT_HEADER } from '@/lib/templates/template-02';
import { DEFAULT_CORNERS, type GlobalSettings, type Slide, type SlideStyle } from '@/types';

/**
 * Detector do CANTO DE FÁBRICA.
 *
 * Todo deck nasce com os cantos preenchidos, e o texto de fábrica muda com o
 * estilo: 'LOREM IPSUM' / '@LOREMIPSUM' no Manifesto e no Radar, '@handle' /
 * 'Título do carrossel' no Atelier e no Minimalista. Não é um gatilho, é o
 * estado padrão: quem não editar leva esse texto para dentro do PNG que
 * publica.
 *
 * Este módulo é lógica pura — responde só "ainda há canto de fábrica VISÍVEL
 * neste deck?". Quem exporta/agenda usa a resposta para avisar antes.
 *
 * 🔸 DUAS FAMÍLIAS, e a diferença não é cosmética — decide quem grava o quê:
 *   • escopo 'slide' (Manifesto, Radar): o canto mora em cada slide, em
 *     `slide.templateSlots[slot]`, com visibilidade em `templateSlotStyles`.
 *     Um hit POR SLIDE, porque um slide pode ter o canto desligado e outro não.
 *   • escopo 'deck' (Atelier, Minimalista): o canto mora UMA VEZ, em
 *     `globalSettings.corners`. Um hit por canto, sem índice de slide — não
 *     existe "o canto do slide 2" para avisar.
 */

/** De onde vem o canto — e, portanto, onde a correção tem de ser gravada. */
export type CornerScope = 'slide' | 'deck';

/** Canto de fábrica que mora em UM slide (`slide.templateSlots`). */
export interface SlideCornerHit {
  escopo: 'slide';
  /** Índice do slide no array (0-based). */
  slideIndex: number;
  /** Slot do canto, ex: 'cantos.left'. */
  slot: string;
  /** O texto de fábrica encontrado. */
  text: string;
}

/**
 * Canto de fábrica que mora no DECK (`globalSettings.corners`).
 *
 * Sem `slideIndex` de propósito: o canto é um só para o carrossel inteiro, e um
 * índice aqui seria uma mentira que alguém acabaria usando para gravar por
 * slide.
 */
export interface DeckCornerHit {
  escopo: 'deck';
  /** Chave em `globalSettings.corners`: 'topLeft' ou 'topRight'. */
  slot: DeckCornerSlot;
  text: string;
}

export type DeckCornerSlot = 'topLeft' | 'topRight';

export type CornerPlaceholderHit = SlideCornerHit | DeckCornerHit;

/**
 * Os cantos POR SLIDE de cada template de spec, na ordem em que são reportados.
 *
 * As strings de fábrica vêm das constantes dos próprios templates, nunca
 * redigitadas aqui: se o Rafael trocar o texto padrão, o detector acompanha
 * sozinho. Mesma disciplina em `DECK_CORNERS`, logo abaixo.
 */
const SLIDE_CORNERS: Partial<Record<SlideStyle, { slot: string; text: string }[]>> = {
  template01: [
    { slot: 'cantos.left', text: TEMPLATE_01_DEFAULT_CORNERS['cantos.left'] },
    { slot: 'cantos.right', text: TEMPLATE_01_DEFAULT_CORNERS['cantos.right'] },
  ],
  template02: [
    { slot: 'header.category', text: TEMPLATE_02_DEFAULT_HEADER['header.category'] },
    { slot: 'header.handle', text: TEMPLATE_02_DEFAULT_HEADER['header.handle'] },
  ],
};

/** Os cantos do DECK, na ordem em que aparecem no card (esquerda, direita). */
const DECK_CORNERS: { slot: DeckCornerSlot; text: string }[] = [
  { slot: 'topLeft', text: DEFAULT_CORNERS.topLeft.text },
  { slot: 'topRight', text: DEFAULT_CORNERS.topRight.text },
];

/**
 * Os estilos que desenham `globalSettings.corners`.
 *
 * Conferido com grep por `corners.topLeft`: só estes dois. O 'profile' NÃO tem
 * canto nenhum no card — por isso não está aqui, e nunca gera aviso.
 */
const DECK_CORNER_STYLES: SlideStyle[] = ['minimalist', 'editorial'];

/**
 * Lista os cantos que ainda exibem o texto de fábrica.
 *
 * Ordem determinista: nos estilos de escopo 'slide', a ordem dos slides e,
 * dentro de cada slide, a ordem dos slots do template; nos de escopo 'deck',
 * esquerda antes de direita.
 *
 * Cobre os quatro estilos que têm canto. O 'profile' devolve [] porque o card
 * dele não desenha canto nenhum: não há o que vazar.
 */
export function findFactoryCorners(
  slides: Slide[],
  style: SlideStyle,
  globalSettings: GlobalSettings,
): CornerPlaceholderHit[] {
  // Deck sem slide não desenha nada — não há PNG para o texto de fábrica sujar.
  if (slides.length === 0) return [];

  if (DECK_CORNER_STYLES.includes(style)) {
    return findDeckCorners(globalSettings);
  }
  return findSlideCorners(slides, style, globalSettings);
}

/**
 * Escopo DECK (Atelier, Minimalista): o canto vive em `globalSettings.corners`.
 *
 * Espelha o que os dois cards fazem (MinimalistSlide.tsx, EditorialSlide.tsx):
 * `corners.show && corners[slot].visible`. Os dois respeitam o interruptor
 * geral — conferido na fonte, sem a assimetria que o Radar tem.
 */
function findDeckCorners(globalSettings: GlobalSettings): DeckCornerHit[] {
  const corners = globalSettings.corners ?? DEFAULT_CORNERS;
  // Interruptor geral desligado: nenhum canto é desenhado, nada vaza.
  if (corners.show === false) return [];

  const hits: DeckCornerHit[] = [];
  for (const { slot, text } of DECK_CORNERS) {
    const config = corners[slot] ?? DEFAULT_CORNERS[slot];
    // Canto invisível não entra: não aparece na tela, não há o que avisar.
    if (config.visible === false) continue;
    // Comparação EXATA. String vazia não é de fábrica: apagar o canto foi
    // escolha do usuário, e nunca coincide com o texto padrão.
    if (config.text !== text) continue;
    hits.push({ escopo: 'deck', slot, text });
  }
  return hits;
}

/**
 * Escopo SLIDE (Manifesto, Radar): o canto vive em cada `slide.templateSlots`.
 *
 * Comportamento inalterado desde a validação no navegador — só ganhou o campo
 * `escopo` no hit.
 */
function findSlideCorners(
  slides: Slide[],
  style: SlideStyle,
  globalSettings: GlobalSettings,
): SlideCornerHit[] {
  const corners = SLIDE_CORNERS[style];
  if (!corners) return [];

  // O T1 tem um interruptor global de cantos; o T2 não — o render dele olha
  // só o toggle por slot. A assimetria é do produto, não descuido.
  const hiddenByGlobal = style === 'template01' && globalSettings.corners?.show === false;

  const hits: SlideCornerHit[] = [];

  slides.forEach((slide, slideIndex) => {
    for (const { slot, text } of corners) {
      const visible = slide.templateSlotStyles?.[slot]?.visible;
      // Canto invisível não vaza nada: não há o que avisar.
      if (visible === false) continue;
      if (visible == null && hiddenByGlobal) continue;

      // Chave ausente conta como texto de fábrica — é justamente o que o
      // render usa de fallback, então é o que aparece na tela. String vazia
      // NÃO conta: apagar o canto foi escolha do usuário.
      const value = slide.templateSlots?.[slot] ?? text;
      if (value !== text) continue;

      hits.push({ escopo: 'slide', slideIndex, slot, text });
    }
  });

  return hits;
}
