import { describe, it, expect } from 'vitest';
import { findFactoryCorners } from '@/lib/corner-placeholder';
import { TEMPLATE_01_DEFAULT_CORNERS } from '@/lib/templates/template-01';
import { TEMPLATE_02_DEFAULT_HEADER } from '@/lib/templates/template-02';
import {
  CornersConfig,
  DEFAULT_CORNERS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_SLIDE,
  GlobalSettings,
  Slide,
  Template01SlotStyle,
} from '@/types';

/**
 * O QUE ESTE MÓDULO DEFENDE.
 *
 * Os templates Manifesto e Radar nascem com os cantos preenchidos com
 * 'LOREM IPSUM' e '@LOREMIPSUM'. Ninguém precisa clicar em nada para isso
 * acontecer: é o estado padrão do deck. Um assinante que não repare publica
 * latim falso no Instagram dele — o texto vai dentro do PNG exportado.
 *
 * Estes testes travam o detector que responde, na hora de exportar ou agendar,
 * "ainda tem canto de fábrica VISÍVEL?". Visível é a palavra: canto desligado
 * não vaza nada, e canto apagado (string vazia) foi escolha do usuário.
 */

const L1 = TEMPLATE_01_DEFAULT_CORNERS['cantos.left'];
const R1 = TEMPLATE_01_DEFAULT_CORNERS['cantos.right'];
const CAT = TEMPLATE_02_DEFAULT_HEADER['header.category'];
const HANDLE = TEMPLATE_02_DEFAULT_HEADER['header.handle'];

function slide(
  position: number,
  extra: {
    templateSlots?: Record<string, string>;
    templateSlotStyles?: Record<string, Template01SlotStyle>;
  } = {},
): Slide {
  return { ...DEFAULT_SLIDE, id: `s${position}`, position, ...extra };
}

/** Configuração global com o interruptor de cantos no valor pedido. */
function settings(show: boolean): GlobalSettings {
  return {
    ...DEFAULT_GLOBAL_SETTINGS,
    corners: { ...DEFAULT_GLOBAL_SETTINGS.corners, show },
  };
}

const ON = settings(true);
const OFF = settings(false);

/** Os textos de fábrica do Atelier/Minimalista, direto da fonte. */
const TL = DEFAULT_CORNERS.topLeft.text;
const TR = DEFAULT_CORNERS.topRight.text;

/**
 * GlobalSettings do escopo DECK: o canto mora aqui, não no slide.
 * Sem argumento, é o deck recém-criado — os dois cantos de fábrica, visíveis.
 */
function comCantos(patch: Partial<CornersConfig>): GlobalSettings {
  return {
    ...DEFAULT_GLOBAL_SETTINGS,
    corners: { ...JSON.parse(JSON.stringify(DEFAULT_CORNERS)), ...patch },
  };
}

describe('findFactoryCorners — TEMPLATE 1 (Manifesto)', () => {
  it('deck recém-criado: acha os dois cantos de cada slide', () => {
    const hits = findFactoryCorners([slide(0), slide(1)], 'template01', ON);
    expect(hits).toEqual([
      { escopo: 'slide' as const, slideIndex: 0, slot: 'cantos.left', text: L1 },
      { escopo: 'slide' as const, slideIndex: 0, slot: 'cantos.right', text: R1 },
      { escopo: 'slide' as const, slideIndex: 1, slot: 'cantos.left', text: L1 },
      { escopo: 'slide' as const, slideIndex: 1, slot: 'cantos.right', text: R1 },
    ]);
  });

  it('usuário digitou só o canto esquerdo: sobra o direito', () => {
    const hits = findFactoryCorners(
      [slide(0, { templateSlots: { 'cantos.left': 'MARCA FORTE' } })],
      'template01',
      ON,
    );
    expect(hits).toEqual([{ escopo: 'slide' as const, slideIndex: 0, slot: 'cantos.right', text: R1 }]);
  });

  it('usuário digitou os dois: nada a avisar', () => {
    const hits = findFactoryCorners(
      [slide(0, { templateSlots: { 'cantos.left': 'MARCA FORTE', 'cantos.right': '@rafa' } })],
      'template01',
      ON,
    );
    expect(hits).toEqual([]);
  });

  it('canto apagado (string vazia) não é de fábrica — foi escolha do usuário', () => {
    const hits = findFactoryCorners(
      [slide(0, { templateSlots: { 'cantos.left': '', 'cantos.right': '' } })],
      'template01',
      ON,
    );
    expect(hits).toEqual([]);
  });

  it('canto desligado por slot não entra: não aparece na tela, não vaza', () => {
    const hits = findFactoryCorners(
      [slide(0, { templateSlotStyles: { 'cantos.left': { visible: false } } })],
      'template01',
      ON,
    );
    expect(hits).toEqual([{ escopo: 'slide' as const, slideIndex: 0, slot: 'cantos.right', text: R1 }]);
  });

  it('cantos desligados no global, sem toggle por slide: nada a avisar', () => {
    expect(findFactoryCorners([slide(0), slide(1)], 'template01', OFF)).toEqual([]);
  });

  it('global desligado MAS o slide religou o canto: o canto conta', () => {
    // É o que o render faz (Template01Slide.tsx): assim que o slide ganha o
    // próprio toggle, ele manda no global.
    const hits = findFactoryCorners(
      [slide(0, { templateSlotStyles: { 'cantos.left': { visible: true } } })],
      'template01',
      OFF,
    );
    expect(hits).toEqual([{ escopo: 'slide' as const, slideIndex: 0, slot: 'cantos.left', text: L1 }]);
  });
});

describe('findFactoryCorners — TEMPLATE 2 (Radar)', () => {
  it('deck recém-criado: acha o cabeçalho dos dois slides', () => {
    const hits = findFactoryCorners([slide(0), slide(1)], 'template02', ON);
    expect(hits).toEqual([
      { escopo: 'slide' as const, slideIndex: 0, slot: 'header.category', text: CAT },
      { escopo: 'slide' as const, slideIndex: 0, slot: 'header.handle', text: HANDLE },
      { escopo: 'slide' as const, slideIndex: 1, slot: 'header.category', text: CAT },
      { escopo: 'slide' as const, slideIndex: 1, slot: 'header.handle', text: HANDLE },
    ]);
  });

  it('usuário digitou só a categoria: sobra o handle', () => {
    const hits = findFactoryCorners(
      [slide(0, { templateSlots: { 'header.category': 'DESIGN' } })],
      'template02',
      ON,
    );
    expect(hits).toEqual([{ escopo: 'slide' as const, slideIndex: 0, slot: 'header.handle', text: HANDLE }]);
  });

  it('usuário digitou os dois: nada a avisar', () => {
    const hits = findFactoryCorners(
      [slide(0, { templateSlots: { 'header.category': 'DESIGN', 'header.handle': '@rafa' } })],
      'template02',
      ON,
    );
    expect(hits).toEqual([]);
  });

  it('cabeçalho apagado (string vazia): nada a avisar', () => {
    const hits = findFactoryCorners(
      [slide(0, { templateSlots: { 'header.category': '', 'header.handle': '' } })],
      'template02',
      ON,
    );
    expect(hits).toEqual([]);
  });

  it('slot desligado não entra', () => {
    const hits = findFactoryCorners(
      [slide(0, { templateSlotStyles: { 'header.handle': { visible: false } } })],
      'template02',
      ON,
    );
    expect(hits).toEqual([{ escopo: 'slide' as const, slideIndex: 0, slot: 'header.category', text: CAT }]);
  });

  it('global corners.show=false NÃO apaga o cabeçalho do T2 — os cantos continuam contando', () => {
    // Assimetria real e proposital: o render do T2 (Template02Slide.tsx) decide
    // visibilidade SÓ por slot, ignorando globalSettings.corners.show. Se o
    // detector aplicasse o global aqui, ele calaria sobre um cabeçalho que
    // continua desenhado na tela — exatamente o vazamento que ele existe para
    // impedir.
    const hits = findFactoryCorners([slide(0)], 'template02', OFF);
    expect(hits).toEqual([
      { escopo: 'slide' as const, slideIndex: 0, slot: 'header.category', text: CAT },
      { escopo: 'slide' as const, slideIndex: 0, slot: 'header.handle', text: HANDLE },
    ]);
  });
});

/**
 * ESCOPO DECK — Atelier ('editorial') e Minimalista ('minimalist').
 *
 * Aqui o canto não é do slide: é um só para o carrossel inteiro, em
 * `globalSettings.corners`. O texto de fábrica é outro ('@handle' e 'Título do
 * carrossel'), e o wizard não preenche nenhum dos dois — um Atelier criado hoje
 * exporta um PNG com esse texto escrito no topo.
 */
describe('findFactoryCorners — escopo deck (Atelier e Minimalista)', () => {
  it.each(['editorial', 'minimalist'] as const)(
    '%s recém-criado: os dois cantos são avisados, uma vez só',
    (style) => {
      // Uma vez só, não um por slide: o canto do deck é um só. Dois slides
      // continuam devolvendo dois hits.
      const hits = findFactoryCorners([slide(0), slide(1)], style, comCantos({}));
      expect(hits).toEqual([
        { escopo: 'deck', slot: 'topLeft', text: TL },
        { escopo: 'deck', slot: 'topRight', text: TR },
      ]);
    },
  );

  it('usuário digitou só o canto esquerdo: sobra o direito', () => {
    const hits = findFactoryCorners(
      [slide(0)],
      'editorial',
      comCantos({ topLeft: { text: 'BRANDING & TECNOLOGIA', visible: true } }),
    );
    expect(hits).toEqual([{ escopo: 'deck', slot: 'topRight', text: TR }]);
  });

  it('usuário digitou os dois: nada a avisar', () => {
    const hits = findFactoryCorners(
      [slide(0)],
      'editorial',
      comCantos({
        topLeft: { text: 'BRANDING & TECNOLOGIA', visible: true },
        topRight: { text: '@rafa', visible: true },
      }),
    );
    expect(hits).toEqual([]);
  });

  it('cantos apagados (string vazia): nada a avisar — foi escolha do usuário', () => {
    const hits = findFactoryCorners(
      [slide(0)],
      'editorial',
      comCantos({ topLeft: { text: '', visible: true }, topRight: { text: '', visible: true } }),
    );
    expect(hits).toEqual([]);
  });

  it('corners.show === false: nada a avisar', () => {
    // Os DOIS cards respeitam o interruptor geral (MinimalistSlide.tsx:291,
    // EditorialSlide.tsx:128) — sem a assimetria que o Radar tem.
    expect(findFactoryCorners([slide(0)], 'editorial', comCantos({ show: false }))).toEqual([]);
    expect(findFactoryCorners([slide(0)], 'minimalist', comCantos({ show: false }))).toEqual([]);
  });

  it('canto esquerdo invisível: só o direito é avisado', () => {
    const hits = findFactoryCorners(
      [slide(0)],
      'editorial',
      comCantos({ topLeft: { text: TL, visible: false } }),
    );
    expect(hits).toEqual([{ escopo: 'deck', slot: 'topRight', text: TR }]);
  });

  it('canto direito invisível: só o esquerdo é avisado', () => {
    const hits = findFactoryCorners(
      [slide(0)],
      'minimalist',
      comCantos({ topRight: { text: TR, visible: false } }),
    );
    expect(hits).toEqual([{ escopo: 'deck', slot: 'topLeft', text: TL }]);
  });

  it('o hit do deck NÃO tem slideIndex', () => {
    // De propósito: um índice aqui seria mentira, e alguém acabaria usando ele
    // para gravar o canto por slide — que é justamente o que não pode.
    const [hit] = findFactoryCorners([slide(0)], 'editorial', comCantos({}));
    expect(hit.escopo).toBe('deck');
    expect('slideIndex' in hit).toBe(false);
  });

  it('profile NUNCA avisa: o card dele não desenha canto nenhum', () => {
    // Conferido por grep `corners.topLeft`: só MinimalistSlide e EditorialSlide
    // renderizam esses campos. O perfil ignora `globalSettings.corners`, então
    // o texto de fábrica está lá no estado, mas não sai em PNG nenhum — avisar
    // seria pedir para o usuário arrumar algo que ele não vê.
    expect(findFactoryCorners([slide(0), slide(1)], 'profile', comCantos({}))).toEqual([]);
  });
});

describe('findFactoryCorners — fora do escopo e bordas', () => {
  it.each(['minimalist', 'editorial'] as const)(
    'estilo %s ignora os slots de template — o canto dele mora no deck',
    (style) => {
      // Um `templateSlots` com latim do Manifesto num deck Atelier não desenha
      // nada: o card lê `globalSettings.corners`. Avisar aqui seria avisar de
      // um texto que ninguém vê.
      const s = slide(0, { templateSlots: { 'cantos.left': L1, 'cantos.right': R1 } });
      // Cantos do deck já resolvidos: se sobrar algum hit, veio do templateSlots.
      const resolvido = comCantos({
        topLeft: { text: 'BRANDING & TECNOLOGIA', visible: true },
        topRight: { text: '@rafa', visible: true },
      });
      expect(findFactoryCorners([s], style, resolvido)).toEqual([]);
    },
  );

  it('deck vazio devolve lista vazia, em qualquer estilo', () => {
    expect(findFactoryCorners([], 'template01', ON)).toEqual([]);
    expect(findFactoryCorners([], 'template02', ON)).toEqual([]);
    // Sem slide não há PNG: o canto do deck existe, mas não é desenhado.
    expect(findFactoryCorners([], 'editorial', ON)).toEqual([]);
    expect(findFactoryCorners([], 'minimalist', ON)).toEqual([]);
  });

  it('a ordem é determinista: slide 0 antes do slide 1', () => {
    const hits = findFactoryCorners([slide(0), slide(1)], 'template01', ON);
    expect(hits.map((h) => (h.escopo === 'slide' ? h.slideIndex : null))).toEqual([0, 0, 1, 1]);
    expect(hits.map((h) => h.slot)).toEqual([
      'cantos.left',
      'cantos.right',
      'cantos.left',
      'cantos.right',
    ]);
  });
});
