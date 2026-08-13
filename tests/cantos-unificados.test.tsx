// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import EditorialSlide from '@/components/slides/EditorialSlide';
import MinimalistSlide from '@/components/slides/MinimalistSlide';
import { cornerGrowthTop } from '@/lib/utils';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CORNERS,
  DEFAULT_SLIDE,
  type GlobalSettings,
  type Slide,
} from '@/types';

/**
 * ABA CANTOS — os dois defeitos que o Rafael apontou.
 *
 * 1. A opacidade não fazia nada no Editorial.
 * 2. Mudar o TAMANHO empurrava o canto só para baixo, em vez de crescer a
 *    partir do centro respeitando a margem.
 */

function settings(patch: Partial<GlobalSettings['corners']>): GlobalSettings {
  return {
    ...DEFAULT_GLOBAL_SETTINGS,
    corners: { ...DEFAULT_CORNERS, show: true, ...patch },
  };
}

const slide: Slide = { ...DEFAULT_SLIDE, id: 's1', position: 0, backgroundColor: '#101010' };

/** O canto esquerdo renderizado, seja qual for o template. */
function cantoEsquerdo(container: HTMLElement, texto: string): HTMLElement {
  const alvo = Array.from(container.querySelectorAll('div')).find(
    (d) => d.textContent === texto && d.style.position === 'absolute',
  );
  if (!alvo) throw new Error('canto não encontrado');
  return alvo as HTMLElement;
}

describe('Cantos — opacidade', () => {
  it('a opacidade vale mesmo com uma cor definida (bug do Editorial)', () => {
    // O padrão do produto já traz color '#FFFFFF'. Antes, a opacidade só
    // entrava no rgba() do fallback — ou seja, nunca.
    const { container } = render(
      <EditorialSlide
        slide={slide}
        globalSettings={settings({ opacity: 40, color: '#FFFFFF', topLeft: { text: 'ESQ', visible: true } })}
        slideIndex={1}
        totalSlides={3}
      />,
    );

    const canto = cantoEsquerdo(container, 'ESQ');
    expect(canto.style.opacity).toBe('0.4');
    expect(canto.style.color).toBe('rgb(255, 255, 255)');
  });

  it('o Minimalista tinha o mesmo defeito e também foi corrigido', () => {
    const { container } = render(
      <MinimalistSlide
        slide={slide}
        globalSettings={settings({ opacity: 25, color: '#FFFFFF', topLeft: { text: 'ESQ', visible: true } })}
        slideIndex={1}
        totalSlides={3}
      />,
    );

    expect(cantoEsquerdo(container, 'ESQ').style.opacity).toBe('0.25');
  });

  it('opacidade 100 não altera nada', () => {
    const { container } = render(
      <EditorialSlide
        slide={slide}
        globalSettings={settings({ opacity: 100, topLeft: { text: 'ESQ', visible: true } })}
        slideIndex={1}
        totalSlides={3}
      />,
    );
    expect(cantoEsquerdo(container, 'ESQ').style.opacity).toBe('1');
  });
});

describe('Cantos — o tamanho cresce a partir do centro', () => {
  const REF = DEFAULT_CORNERS.fontSize;

  it('no tamanho de referência o canto encosta exatamente na margem', () => {
    expect(cornerGrowthTop(40, REF, REF)).toBe(40);
  });

  it('fonte menor recua para o centro da faixa, em vez de colar no topo', () => {
    // Metade da diferença de cada lado: o bloco encolhe centrado.
    expect(cornerGrowthTop(40, REF - 10, REF)).toBe(45);
  });

  // A primeira versão travava aqui (`margin + max(0, …)`), tratando a margem
  // como limite duro. Isso quebrou o tamanho no T1/T2, cuja referência fica na
  // base do slider — ver `tests/cantos-tamanho.test.tsx`. O crescimento passou
  // a ser simétrico e o piso virou a borda do slide, em `cornerTop`.
  it('fonte maior sobe o topo na mesma proporção', () => {
    expect(cornerGrowthTop(40, REF + 40, REF)).toBe(20);
  });

  it('o Editorial aplica esse topo no canto renderizado', () => {
    const { container } = render(
      <EditorialSlide
        slide={slide}
        globalSettings={settings({
          borderDistance: 40,
          fontSize: REF - 10,
          topLeft: { text: 'ESQ', visible: true },
        })}
        slideIndex={1}
        totalSlides={3}
      />,
    );

    const canto = cantoEsquerdo(container, 'ESQ');
    expect(canto.style.top).toBe('45px');
    // A margem horizontal continua sendo a âncora.
    expect(canto.style.left).toBe('40px');
  });
});

describe('Cantos — visibilidade independente', () => {
  it('esconder um canto não esconde o outro', () => {
    const { container } = render(
      <EditorialSlide
        slide={slide}
        globalSettings={settings({
          topLeft: { text: 'ESQ', visible: false },
          topRight: { text: 'DIR', visible: true },
        })}
        slideIndex={1}
        totalSlides={3}
      />,
    );

    expect(container.textContent).not.toContain('ESQ');
    expect(container.textContent).toContain('DIR');
  });
});
