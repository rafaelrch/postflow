// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import EditorialSlide from '@/components/slides/EditorialSlide';
import Template01Slide from '@/components/slides/Template01Slide';
import Template02Slide from '@/components/slides/Template02Slide';
import { cornerGrowthTop, cornerTop } from '@/lib/utils';
import { template01SlotDefaults } from '@/lib/templates/template-01';
import { template02SlotDefaults } from '@/lib/templates/template-02';
import {
  DEFAULT_CORNERS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_SLIDE,
  type GlobalSettings,
  type Slide,
} from '@/types';

/**
 * TAMANHO DA FONTE DOS CANTOS — a regressão que a unificação da aba deixou.
 *
 * O Rafael relatou: o tamanho funciona no Editorial e NÃO funciona nos
 * TEMPLATES 1 e 2. Os 911 testes passavam porque nenhum deles olhava o canto
 * ACIMA do tamanho de referência do template. São duas causas distintas, e as
 * duas só aparecem lá em cima:
 *
 *   1. `cornerGrowthTop` só centrava o bloco quando a fonte ENCOLHIA
 *      (`Math.max(0, …)`). Crescendo, o topo ficava preso na margem e o texto
 *      só descia — parecia escorregar para dentro do slide em vez de crescer.
 *      No Editorial isso não aparece: a referência dele é 27 px e o slider vai
 *      só até 32, então quase toda a faixa útil está ABAIXO da referência. No
 *      T1/T2 a referência é ~16,8 px e o slider vai a 64: quase tudo está na
 *      faixa travada.
 *
 *   2. Só no TEMPLATE 1, o canto é pintado dentro da CAIXA FIXA do spec
 *      (233 px no esquerdo, 121 px no direito). Medido no navegador, com 30 px
 *      o "@LOREMIPSUM" já pede 206 px e com 48 px pede 329 px: o texto vaza da
 *      caixa e o "LOREM IPSUM" (que tem espaço) quebra em duas linhas. O canto
 *      do Editorial é `inline-block` de largura automática e nunca quebra — é
 *      esse comportamento que os três passam a ter.
 */

const slide: Slide = { ...DEFAULT_SLIDE, id: 's1', position: 0, backgroundColor: '#101010' };

function slideT0X(model: number): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: `s${model}`,
    position: model - 1,
    templateModel: model,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  } as Slide;
}

function comTamanho(fontSize: number): GlobalSettings {
  return { ...DEFAULT_GLOBAL_SETTINGS, templateCornerStyle: { fontSize } };
}

/** O elemento de um slot, com o `style` inline já aplicado. */
function porSlot(container: HTMLElement, slot: string): HTMLElement {
  const el = container.querySelector(`[data-slot="${slot}"]`);
  if (!el) throw new Error(`slot ${slot} não renderizou`);
  return el as HTMLElement;
}

/** Referência de cada canto: o tamanho que o spec desenhou. */
const REF_T01 = template01SlotDefaults('cantos.left')?.fontSizePx ?? 0;
const REF_T02 = template02SlotDefaults('header.category')?.fontSizePx ?? 0;

afterEach(cleanup);

describe('o canto cresce a partir do próprio centro nos DOIS sentidos', () => {
  const REF = DEFAULT_CORNERS.fontSize;

  it('no tamanho de referência encosta exatamente na margem', () => {
    expect(cornerGrowthTop(40, REF, REF)).toBe(40);
  });

  it('encolher recua para o centro da faixa (comportamento que já valia)', () => {
    expect(cornerGrowthTop(40, REF - 10, REF)).toBe(45);
  });

  it('CRESCER sobe o topo na mesma proporção, em vez de travar na margem', () => {
    // Era `40` — a margem funcionava como limite duro só para cima, e o bloco
    // crescia exclusivamente para baixo. Simétrico, o centro fica parado.
    expect(cornerGrowthTop(40, REF + 40, REF)).toBe(20);
    expect(cornerGrowthTop(40, REF + 20, REF)).toBe(30);
  });

  it('o topo nunca sai do slide: `cornerTop` prende em zero', () => {
    // O piso mora em `cornerTop` e não em `cornerGrowthTop` porque no Editorial
    // a margem é o topo ABSOLUTO, e no T1/T2 é um delta somado ao `y` do spec.
    expect(cornerGrowthTop(0, REF + 100, REF)).toBe(-50);
    expect(cornerTop(0, cornerGrowthTop(0, REF + 100, REF))).toBe(0);
    expect(cornerTop(44, cornerGrowthTop(0, REF + 100, REF))).toBe(0);
    expect(cornerTop(44, cornerGrowthTop(0, REF + 40, REF))).toBe(24);
  });

  it('o centro do bloco fica parado — é a definição de crescer no lugar', () => {
    const centro = (fs: number) => cornerGrowthTop(40, fs, REF) + fs / 2;
    expect(centro(REF + 30)).toBeCloseTo(centro(REF), 6);
    expect(centro(REF - 12)).toBeCloseTo(centro(REF), 6);
  });
});

describe('os três templates se comportam igual ao mudar o tamanho', () => {
  it('Editorial: crescer sobe o topo', () => {
    const { container } = render(
      <EditorialSlide
        slide={slide}
        globalSettings={{
          ...DEFAULT_GLOBAL_SETTINGS,
          corners: {
            ...DEFAULT_CORNERS,
            show: true,
            borderDistance: 40,
            fontSize: DEFAULT_CORNERS.fontSize + 20,
            topLeft: { text: 'ESQ', visible: true },
          },
        }}
        slideIndex={1}
        totalSlides={3}
      />,
    );
    const canto = Array.from(container.querySelectorAll('div')).find(
      (d) => d.textContent === 'ESQ' && d.style.position === 'absolute',
    ) as HTMLElement;
    expect(canto.style.top).toBe('30px');
  });

  it('TEMPLATE 1: crescer sobe o topo', () => {
    const { container } = render(
      <Template01Slide
        slide={slideT0X(1)}
        globalSettings={comTamanho(REF_T01 + 20)}
        slideIndex={0}
        totalSlides={6}
      />,
    );
    // 44 é o `y` do canto no spec; cresceu 20 px, o topo sobe 10.
    expect(porSlot(container, 'cantos.left').style.top).toBe('34px');
  });

  it('TEMPLATE 2: crescer sobe o topo', () => {
    const { container } = render(
      <Template02Slide
        slide={slideT0X(2)}
        globalSettings={comTamanho(REF_T02 + 20)}
        slideIndex={1}
        totalSlides={6}
      />,
    );
    expect(porSlot(container, 'header.category').style.top).toBe('34px');
  });

  it('encolher continua descendo o topo nos três', () => {
    const { container: c1 } = render(
      <Template01Slide slide={slideT0X(1)} globalSettings={comTamanho(REF_T01 - 8)} slideIndex={0} totalSlides={6} />,
    );
    expect(porSlot(c1, 'cantos.left').style.top).toBe('48px');

    const { container: c2 } = render(
      <Template02Slide slide={slideT0X(2)} globalSettings={comTamanho(REF_T02 - 8)} slideIndex={1} totalSlides={6} />,
    );
    expect(porSlot(c2, 'header.category').style.top).toBe('48px');
  });
});

describe('TEMPLATE 1: o canto não é mais preso na caixa fixa do spec', () => {
  it('a largura acompanha o conteúdo, como no Editorial', () => {
    const { container } = render(
      <Template01Slide
        slide={slideT0X(1)}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={6}
      />,
    );
    // Eram 233 px e 121 px — o "@LOREMIPSUM" a 48 px pede 329 px e vazava.
    expect(porSlot(container, 'cantos.left').style.width).toBe('max-content');
    expect(porSlot(container, 'cantos.right').style.width).toBe('max-content');
  });

  it('as âncoras do spec continuam intactas — a fidelidade não se mexe', () => {
    const { container } = render(
      <Template01Slide
        slide={slideT0X(1)}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={6}
      />,
    );
    const esq = porSlot(container, 'cantos.left');
    const dir = porSlot(container, 'cantos.right');
    expect(esq.style.left).toBe('71px');
    expect(esq.style.textAlign).toBe('left');
    expect(dir.style.right).toBe('63px');
    expect(dir.style.textAlign).toBe('right');
  });

  it('os blocos que NÃO são canto mantêm a largura do spec', () => {
    const { container } = render(
      <Template01Slide
        slide={slideT0X(1)}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={6}
      />,
    );
    const textos = Array.from(container.querySelectorAll<HTMLElement>('[data-slot]')).filter(
      (el) => !el.dataset.slot?.startsWith('cantos.') && el.style.fontSize,
    );
    expect(textos.length).toBeGreaterThan(0);
    for (const el of textos) expect(el.style.width).toMatch(/px$/);
  });
});
