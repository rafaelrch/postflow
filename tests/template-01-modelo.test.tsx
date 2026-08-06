import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template01Slide from '@/components/slides/Template01Slide';
import {
  TEMPLATE_01_MODELS,
  TEMPLATE_01_SLIDE_COUNT,
  TEMPLATE_01_SPEC,
  isTemplate01Model,
  template01LoremForSlot,
  template01Measure,
  template01ModelOf,
  template01NewSlideSlots,
  template01SlotsForSlide,
  template01SpecSlideOf,
} from '@/lib/templates/template-01';
import { mapDbSlideToSlide, mapSlideToDbRow } from '@/lib/slide-mapper';
import { template01SetImage } from '@/lib/templates/template-01/image';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_IMAGE_POSITION, DEFAULT_SLIDE, Slide } from '@/types';

/**
 * O MODELO do slide passou a ser um dado dele (`templateModel`) em vez da
 * posição no deck. Estes testes travam as duas metades disso: o desenho segue o
 * modelo mesmo com repetição e deck maior que 6, e o deck salvo ANTES do campo
 * continua desenhando pela posição, idêntico ao que era.
 */

function render(slide: Partial<Slide>, position: number, total = TEMPLATE_01_SLIDE_COUNT) {
  const full = {
    ...DEFAULT_SLIDE,
    id: `s${position}`,
    position,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...slide,
  } as Slide;
  return renderToStaticMarkup(
    <Template01Slide
      slide={full}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={position}
      totalSlides={total}
    />
  );
}

/** Os slots de texto que só existem naquele modelo — a assinatura do desenho. */
function ownTextSlots(model: number): string[] {
  return template01SlotsForSlide(model)
    .filter((d) => d.kind === 'text' && !d.slot.startsWith('cantos.'))
    .map((d) => d.slot);
}

describe('TEMPLATE 1 — modelo do slide', () => {
  it('reconhece só os 6 modelos do spec', () => {
    expect(TEMPLATE_01_MODELS).toEqual([1, 2, 3, 4, 5, 6]);
    for (const m of TEMPLATE_01_MODELS) expect(isTemplate01Model(m)).toBe(true);
    for (const bad of [0, 7, -1, 1.5, '1', null, undefined, NaN]) {
      expect(isTemplate01Model(bad)).toBe(false);
    }
  });

  it('o modelo explícito vence a posição', () => {
    expect(template01ModelOf({ templateModel: 2 }, 0)).toBe(2);
    expect(template01ModelOf({ templateModel: 1 }, 5)).toBe(1);
    // Posição 9 num deck de 10: sem o campo cairia no 6.
    expect(template01ModelOf({ templateModel: 3 }, 9)).toBe(3);
  });

  it('modelo inválido no dado não derruba o render: cai na regra da posição', () => {
    expect(template01ModelOf({ templateModel: 99 }, 1)).toBe(2);
    expect(template01ModelOf({ templateModel: 0 }, 3)).toBe(4);
  });

  it('🔴 sem o campo, o modelo sai da POSIÇÃO exatamente como antes', () => {
    // Esta é a regra que preserva todo carrossel salvo antes da mudança,
    // clamp incluso: era `Math.min(i, 5)` sobre o array do spec.
    const legado = (i: number) =>
      TEMPLATE_01_SPEC.slides[Math.min(Math.max(i, 0), TEMPLATE_01_SPEC.slides.length - 1)].index;
    for (let i = 0; i < 12; i++) {
      expect(template01ModelOf(undefined, i)).toBe(legado(i));
      expect(template01ModelOf({}, i)).toBe(legado(i));
    }
  });

  it('template01SpecSlideOf devolve o slide do spec daquele modelo', () => {
    for (const m of TEMPLATE_01_MODELS) expect(template01SpecSlideOf(m).index).toBe(m);
  });
});

describe('TEMPLATE 1 — render por modelo', () => {
  it('🔴 deck salvo ANTES da mudança reabre idêntico', () => {
    // Slide sem `templateModel`, como sai do banco de um carrossel antigo.
    for (let i = 0; i < TEMPLATE_01_SLIDE_COUNT; i++) {
      const antigo = render({}, i);
      const comModelo = render({ templateModel: i + 1 }, i);
      expect(antigo).toBe(comModelo);
    }
  });

  it('o mesmo modelo repetido desenha igual em qualquer posição', () => {
    for (const model of TEMPLATE_01_MODELS) {
      const naPosicaoCerta = render({ templateModel: model }, model - 1);
      const bemDepois = render({ templateModel: model }, 11);
      expect(bemDepois).toBe(naPosicaoCerta);
    }
  });

  it('deck de 8 slides com modelo repetido desenha cada um pelo seu modelo', () => {
    const deck = [1, 2, 3, 4, 5, 6, 3, 1];
    deck.forEach((model, position) => {
      const html = render({ templateModel: model }, position, deck.length);
      // Os slots do modelo estão lá…
      for (const slot of ownTextSlots(model)) expect(html).toContain(`data-slot="${slot}"`);
      // …e os dos outros modelos, não.
      for (const outro of TEMPLATE_01_MODELS) {
        if (outro === model) continue;
        for (const slot of ownTextSlots(outro)) {
          if (ownTextSlots(model).includes(slot)) continue;
          expect(html).not.toContain(`data-slot="${slot}"`);
        }
      }
    });
  });

  it('o 7º slide não nasce mais com o modelo 6 por acidente', () => {
    // Era o bug do "slide 7 azul": o clamp jogava tudo além do 6º no último
    // modelo, com a seta e o texto de fábrica junto.
    const html = render({ templateModel: 1 }, 6, 8);
    expect(html).toContain('data-slot="s1.headline"');
    expect(html).not.toContain('data-slot="s6.title"');
    // A seta é ornamento exclusivo do modelo 6.
    expect(html).not.toContain('data-slot="s6.arrow"');
  });
});

describe('TEMPLATE 1 — slide novo com lorem ipsum', () => {
  const FIGMA_COPY = ['Barcelona', 'OANDRELONA', 'BRANDING', 'DESIGN DE MARCA', 'Torrefação'];

  it('preenche todo slot de texto do modelo, e só ele', () => {
    for (const model of TEMPLATE_01_MODELS) {
      const slots = template01NewSlideSlots(model);
      for (const slot of ownTextSlots(model)) {
        expect(slots[slot], `${model}/${slot}`).toBeTruthy();
      }
      // Imagem fica vazia: quem escolhe é o usuário.
      for (const d of template01SlotsForSlide(model)) {
        if (d.kind === 'image') expect(slots[d.slot]).toBeUndefined();
      }
    }
  });

  it('o lorem cabe nos limites de cada slot — contador nunca nasce vermelho', () => {
    for (const model of TEMPLATE_01_MODELS) {
      const slots = template01NewSlideSlots(model);
      for (const d of template01SlotsForSlide(model)) {
        if (d.kind !== 'text' || d.slot.startsWith('cantos.')) continue;
        const m = template01Measure(slots[d.slot], d);
        expect(m.over, `${d.slot}: "${slots[d.slot]}"`).toBe(false);
      }
    }
  });

  it('o lorem é gerado A PARTIR dos limites, não colado fixo', () => {
    // Slots com orçamento diferente têm de sair com tamanho diferente.
    const curto = template01LoremForSlot({ maxLines: 1, maxCharsPerLine: 12 });
    const longo = template01LoremForSlot({ maxLines: 6, maxCharsPerLine: 48 });
    expect(curto.length).toBeLessThan(longo.length);
    expect(curto.length).toBeLessThanOrEqual(12);
    expect(longo.length).toBeLessThanOrEqual(6 * 48);
    // Determinístico: o mesmo limite dá sempre o mesmo texto.
    expect(template01LoremForSlot({ maxLines: 2, maxCharsPerLine: 20 })).toBe(
      template01LoremForSlot({ maxLines: 2, maxCharsPerLine: 20 })
    );
    // Nunca corta palavra no meio quando cabe mais de uma.
    expect(longo.trim()).toBe(longo);
    expect(longo.endsWith(' ')).toBe(false);
  });

  it('não traz NENHUMA copy de fábrica do Figma', () => {
    for (const model of TEMPLATE_01_MODELS) {
      const slots = template01NewSlideSlots(model);
      const texto = Object.values(slots).join(' ');
      for (const proibido of FIGMA_COPY) expect(texto).not.toContain(proibido);
      // E o render do slide novo também não.
      const html = render({ templateModel: model, templateSlots: slots }, 7, 8);
      for (const proibido of FIGMA_COPY) expect(html).not.toContain(proibido);
    }
  });

  it('os cantos nascem com lorem próprio, sem herdar outro slide', () => {
    const herdados = { 'cantos.left': 'MINHA MARCA', 'cantos.right': '@EU' };
    const slots = template01NewSlideSlots(3, herdados);
    expect(slots['cantos.left']).toBe('LOREM IPSUM');
    expect(slots['cantos.right']).toBe('@LOREMIPSUM');
    const semDeck = template01NewSlideSlots(3);
    expect(semDeck['cantos.left']).toBe('LOREM IPSUM');
    expect(semDeck['cantos.right']).toBe('@LOREMIPSUM');
  });
});

describe('TEMPLATE 1 — imagem preenche a moldura sem deformar', () => {
  it('usa cover na imagem de fundo e na imagem interna', () => {
    const base = { ...DEFAULT_SLIDE, id: 's', position: 0 } as Slide;
    const capa = template01SetImage(base, 1, 'u');
    const interno = template01SetImage(base, 3, 'u');

    expect(capa.imagePosition).toEqual(DEFAULT_IMAGE_POSITION);
    expect(interno.contentImagePosition).toEqual(DEFAULT_IMAGE_POSITION);
    expect(render({ templateModel: 1, ...capa }, 0)).toContain('background-size:cover');
    expect(render({ templateModel: 3, ...interno }, 0)).toContain('background-size:cover');
  });
});

describe('TEMPLATE 1 — cabeçalho por slide', () => {
  it('a visibilidade, a fonte e a cor do slot vencem somente neste slide', () => {
    const escondido = render(
      {
        templateModel: 2,
        templateSlotStyles: {
          'cantos.left': { visible: false },
          'cantos.right': { visible: false },
        },
      },
      1
    );
    expect(escondido).not.toContain('data-slot="cantos.left"');
    expect(escondido).not.toContain('data-slot="cantos.right"');

    const estilizado = render(
      {
        templateModel: 2,
        templateSlotStyles: {
          'cantos.left': { color: '#123456', font: 'Montserrat' },
        },
      },
      1
    );
    const canto = estilizado.slice(estilizado.indexOf('data-slot="cantos.left"'));
    expect(canto).toContain('color:#123456');
    expect(canto).toContain("font-family:&#x27;Montserrat&#x27;, sans-serif");
  });

  it('o tamanho e a margem movem o cabeçalho para dentro', () => {
    const html = render(
      {
        templateModel: 2,
        templateSlotStyles: {
          'cantos.left': { fontSize: 30, margin: 20 },
          'cantos.right': { fontSize: 30, margin: 20 },
        },
      },
      1
    );
    const left = html.match(/data-slot="cantos\.left"[^>]*style="([^"]*)"/)?.[1] ?? '';
    const right = html.match(/data-slot="cantos\.right"[^>]*style="([^"]*)"/)?.[1] ?? '';
    expect(left).toContain('font-size:30px');
    expect(left).toContain('left:91px');
    expect(left).toContain('top:64px');
    expect(right).toContain('right:83px');
    expect(right).toContain('top:64px');
  });
});

describe('TEMPLATE 1 — persistência do modelo', () => {
  it('grava e relê o modelo', () => {
    const row = mapSlideToDbRow({ ...DEFAULT_SLIDE, id: 's', position: 2, templateModel: 4 } as Slide, 'c', 2);
    expect(row.template_model).toBe(4);
    expect(mapDbSlideToSlide({ ...row, id: 's' }).templateModel).toBe(4);
  });

  it('🔴 slide sem modelo não escreve a coluna e relê como ausente', () => {
    // Escrever a chave só quando há valor é o que mantém o autosave dos outros
    // estilos funcionando antes de a migração rodar.
    const row = mapSlideToDbRow({ ...DEFAULT_SLIDE, id: 's', position: 0 } as Slide, 'c', 0);
    expect(row).not.toHaveProperty('template_model');
    expect(mapDbSlideToSlide({ id: 's', position: 0 }).templateModel).toBeUndefined();
  });
});
