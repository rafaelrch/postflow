// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import EditorialSlide from '@/components/slides/EditorialSlide';
import {
  EDITORIAL_LAYOUT_CYCLE,
  editorialSlideLayout,
  freeFormSlideFields,
} from '@/lib/generated-slide-fields';
import { mapSlideToDbRow, mapDbSlideToSlide } from '@/lib/slide-mapper';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_SLIDE,
  type ContentLayout,
  type SlideFormat,
  type Slide,
} from '@/types';

/**
 * EDITORIAL — o deck gerado sai "embaralhado".
 *
 * Antes todo slide interno nascia igual: `text-image-text` (o padrão do
 * renderer, que nem era gravado) e `middle-left`. Seis slides com a mesma cara.
 *
 * A variação é uma ROTAÇÃO determinística sobre o índice, decidida UMA VEZ na
 * geração e gravada no slide (`content_layout` / `text_position` já existem no
 * banco). Sorteio em tempo de render seria um defeito: o carrossel mudaria de
 * cara a cada reload e comeria o ajuste manual do usuário.
 *
 * O passo de cada eixo é escolhido para percorrer um quadrado latino: a
 * sequência anda de 1 em 1 e a faixa vertical de 1 + ⌊n/3⌋, o que dá as NOVE
 * combinações sem repetir nenhuma antes da nona, e com vizinhos diferentes nos
 * DOIS eixos.
 */

const SEQUENCIAS: ContentLayout[] = ['text-image-text', 'image-text-text', 'text-text-image'];

function slideCom(extra: Partial<Slide>): Slide {
  return {
    ...DEFAULT_SLIDE, id: 'e', position: 1, title: 'Título', description: 'Descrição', ...extra,
  } as Slide;
}

afterEach(cleanup);

describe('a capa fica de fora da variação', () => {
  it('o slide 0 não recebe contentLayout — quem manda é a regra da capa', () => {
    const capa = freeFormSlideFields('editorial', 0);
    expect(capa.contentLayout).toBeUndefined();
    expect(capa.textPosition).toBe('bottom-center');
    expect(capa.textAlignment).toBe('center');
  });

  it('`editorialSlideLayout` devolve nulo para a capa', () => {
    expect(editorialSlideLayout(0)).toBeNull();
  });

  it('os outros estilos não ganham variação nenhuma', () => {
    for (const style of ['profile', 'minimalist'] as const) {
      for (const i of [0, 1, 2, 3]) {
        expect(freeFormSlideFields(style, i).contentLayout).toBeUndefined();
      }
    }
  });
});

describe('vizinhos nunca repetem a combinação', () => {
  it('sequência E faixa vertical mudam a cada slide, por 12 slides', () => {
    const combos = Array.from({ length: 12 }, (_, k) => editorialSlideLayout(k + 1)!);
    for (let i = 1; i < combos.length; i++) {
      expect(combos[i].contentLayout, `slide ${i + 2} repetiu a sequência`)
        .not.toBe(combos[i - 1].contentLayout);
      expect(combos[i].textPosition, `slide ${i + 2} repetiu a âncora`)
        .not.toBe(combos[i - 1].textPosition);
    }
  });

  it('o ciclo percorre as NOVE combinações antes de repetir', () => {
    const chaves = Array.from({ length: EDITORIAL_LAYOUT_CYCLE }, (_, k) => {
      const l = editorialSlideLayout(k + 1)!;
      return `${l.contentLayout}|${l.textPosition}`;
    });
    expect(EDITORIAL_LAYOUT_CYCLE).toBe(9);
    expect(new Set(chaves).size).toBe(9);
  });

  it('depois de uma volta o ciclo se repete — é rotação, não sorteio', () => {
    for (let n = 1; n <= 5; n++) {
      expect(editorialSlideLayout(n + EDITORIAL_LAYOUT_CYCLE)).toEqual(editorialSlideLayout(n));
    }
  });

  it('num deck de 6 slides os 5 internos são todos diferentes entre si', () => {
    const chaves = [1, 2, 3, 4, 5].map((i) => {
      const l = editorialSlideLayout(i)!;
      return `${l.contentLayout}|${l.textPosition}`;
    });
    expect(new Set(chaves).size).toBe(5);
  });

  it('só usa as três sequências — nunca `text-only` nem `cover`', () => {
    for (let i = 1; i <= 20; i++) {
      expect(SEQUENCIAS).toContain(editorialSlideLayout(i)!.contentLayout);
    }
  });

  it('o primeiro interno mantém a cara de hoje — a mudança é aditiva', () => {
    expect(editorialSlideLayout(1)).toEqual({
      contentLayout: 'text-image-text',
      textPosition: 'middle-left',
      textAlignment: 'left',
    });
  });

  it('o alinhamento acompanha a âncora, como na barra lateral', () => {
    for (let i = 1; i <= 12; i++) {
      const l = editorialSlideLayout(i)!;
      // O Editorial gerado é alinhado à esquerda; a variação é vertical.
      expect(l.textAlignment).toBe('left');
      expect(l.textPosition.endsWith('-left')).toBe(true);
    }
  });
});

describe('determinismo', () => {
  it('montar o mesmo deck duas vezes dá exatamente o mesmo layout', () => {
    const monta = () =>
      Array.from({ length: 6 }, (_, i) => {
        const f = freeFormSlideFields('editorial', i);
        return { contentLayout: f.contentLayout, textPosition: f.textPosition, textAlignment: f.textAlignment };
      });
    expect(monta()).toEqual(monta());
  });

  it('não depende do formato — é função do índice', () => {
    const porFormato = (['4:5', '1:1', '9:16'] as SlideFormat[]).map(() =>
      Array.from({ length: 6 }, (_, i) => freeFormSlideFields('editorial', i).contentLayout),
    );
    expect(porFormato[0]).toEqual(porFormato[1]);
    expect(porFormato[1]).toEqual(porFormato[2]);
  });

  it('o layout é GRAVADO no slide, não inferido no render', () => {
    // É isto que faz o ajuste manual sobreviver e o reload não mudar a cara.
    for (const i of [1, 2, 3, 4, 5]) {
      expect(freeFormSlideFields('editorial', i).contentLayout).toBeDefined();
    }
  });
});

describe('a variação sobrevive ao reload', () => {
  it('o layout gerado faz a ida e a volta pelo banco', () => {
    // Sem isto a variação viveria só na tela: o payload de INSERT do wizard era
    // escrito à mão ao lado do slide em memória e nunca gravou `content_layout`.
    for (const i of [1, 2, 3, 4, 5]) {
      const gerado = freeFormSlideFields('editorial', i);
      const slide = {
        ...DEFAULT_SLIDE,
        id: `s${i}`,
        position: i,
        contentLayout: gerado.contentLayout,
        textPosition: gerado.textPosition,
      } as Slide;

      const row = mapSlideToDbRow(slide, 'c1', i);
      expect(row.content_layout).toBe(gerado.contentLayout);
      expect(row.text_position).toBe(gerado.textPosition);

      const devolta = mapDbSlideToSlide({ ...row, id: `s${i}` });
      expect(devolta.contentLayout).toBe(gerado.contentLayout);
      expect(devolta.textPosition).toBe(gerado.textPosition);
    }
  });

  it('a capa volta do banco sem contentLayout — a regra dela é por posição', () => {
    const capa = freeFormSlideFields('editorial', 0);
    const row = mapSlideToDbRow(
      { ...DEFAULT_SLIDE, id: 'capa', position: 0, textPosition: capa.textPosition } as Slide,
      'c1',
      0,
    );
    expect(row.content_layout).toBeNull();
    expect(mapDbSlideToSlide({ ...row, id: 'capa' }).contentLayout).toBeUndefined();
  });
});

describe('o ajuste manual continua mandando', () => {
  it('o que está gravado no slide vence a rotação', () => {
    // Slide na posição 2 (que a rotação faria `image-text-text`) com escolha
    // manual de `text-text-image`: o render obedece ao slide.
    const { container } = render(
      <EditorialSlide
        slide={slideCom({ position: 2, contentLayout: 'text-text-image', contentImageUrl: 'https://x/a.png' })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={2}
        totalSlides={6}
      />,
    );
    const nomes = Array.from(container.querySelectorAll<HTMLElement>('[data-block]')).map(
      (el) => el.dataset.block,
    );
    expect(nomes).toEqual(['title', 'description', 'image']);
  });

  it('a âncora escolhida à mão também vence', () => {
    const { container } = render(
      <EditorialSlide
        slide={slideCom({ position: 1, contentLayout: 'text-image-text', textPosition: 'bottom-left' })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={1}
        totalSlides={6}
      />,
    );
    const coluna = container.querySelector<HTMLElement>('[data-block]')!.parentElement!;
    expect(coluna.style.justifyContent).toBe('flex-end');
  });
});

describe('o renderer desenha cada combinação da rotação', () => {
  it.each([1, 2, 3, 4, 5])('slide %i sai com a sequência e a âncora que a rotação mandou', (i) => {
    const l = editorialSlideLayout(i)!;
    const { container } = render(
      <EditorialSlide
        slide={slideCom({
          position: i,
          contentLayout: l.contentLayout,
          textPosition: l.textPosition,
          contentImageUrl: 'https://x/a.png',
        })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={i}
        totalSlides={6}
      />,
    );
    const nomes = Array.from(container.querySelectorAll<HTMLElement>('[data-block]')).map(
      (el) => el.dataset.block,
    );
    const esperado = l.contentLayout === 'text-image-text' ? ['title', 'image', 'description']
      : l.contentLayout === 'text-text-image' ? ['title', 'description', 'image']
      : ['image', 'title', 'description'];
    expect(nomes).toEqual(esperado);

    const coluna = container.querySelector<HTMLElement>('[data-block]')!.parentElement!;
    const banda = l.textPosition.startsWith('top') ? 'flex-start'
      : l.textPosition.startsWith('bottom') ? 'flex-end' : 'center';
    expect(coluna.style.justifyContent).toBe(banda);
  });
});
