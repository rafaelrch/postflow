// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, within, fireEvent } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import Template01Slide from '@/components/slides/Template01Slide';
import Template02Slide from '@/components/slides/Template02Slide';
import { useEditorStore } from '@/hooks/useEditorStore';
import { TEMPLATE_01_MODELS } from '@/lib/templates/template-01';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

vi.mock('@/hooks/useGenerateCarouselImages', async () => {
  // Spread do módulo real: a barra lateral também usa `batchTargets` daqui, e
  // um mock que lista export por export quebra a cada função nova. Só o hook e
  // o `isEditorialCoverSlide` são substituídos, que é o que estes testes querem
  // controlar.
  const real = await vi.importActual<typeof import('@/hooks/useGenerateCarouselImages')>(
    '@/hooks/useGenerateCarouselImages'
  );
  return {
    ...real,
    useGenerateCarouselImages: () => ({
      generateAll: vi.fn(),
      generateOne: vi.fn(),
      generating: false,
      progress: null,
    }),
    isEditorialCoverSlide: () => false,
  };
});
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({ default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import EditorSidebar from '@/components/editor/EditorSidebar';

/**
 * 11 — SLIDER DE MARGEM NOS TEMPLATES.
 *
 * Mesma função do slider "Margem" da aba Cantos: empurra o bloco para DENTRO,
 * a partir da borda em que o spec o ancorou. Escreve no mesmo campo que os
 * cantos já usavam (`templateSlotStyles[slot].margin`), então não há persistência
 * nova — o autosave e o "Restaurar" já contam esse gesto.
 *
 * Uma diferença deliberada em relação ao canto: o bloco de corpo NÃO ganha a
 * correção de crescer-a-partir-do-centro (`cornerGrowthTop`). O canto é ancorado
 * numa faixa fixa; os blocos do corpo refluem por medição (`template01Tops`), e
 * somar o recentramento ali brigaria com o reflow e mexeria em quem só mudou o
 * tamanho do texto.
 */

function slideT01(model: number, extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE, id: `s${model}`, position: model - 1, templateModel: model,
    backgroundImageUrl: '', gridImageUrl: '', contentImageUrl: '', ...extra,
  } as Slide;
}

function estiloDoSlot(html: string, slot: string): string {
  return html.match(new RegExp(`data-slot="${slot.replace('.', '\\.')}"[^>]*?style="([^"]*)"`))?.[1] ?? '';
}

function t01Html(slide: Slide): string {
  return renderToStaticMarkup(
    <Template01Slide slide={slide} globalSettings={DEFAULT_GLOBAL_SETTINGS} slideIndex={slide.position} totalSlides={6} />,
  );
}

function t02Html(slide: Slide): string {
  return renderToStaticMarkup(
    <Template02Slide slide={slide} globalSettings={DEFAULT_GLOBAL_SETTINGS} slideIndex={slide.position} totalSlides={6} />,
  );
}

afterEach(cleanup);

describe('TEMPLATE 1 — a margem empurra o bloco para dentro', () => {
  /** Um slot de texto ancorado à esquerda no modelo 2. */
  const SLOT = 's2.title';

  it('sem margem o bloco fica exatamente onde o spec o pôs', () => {
    const semMargem = estiloDoSlot(t01Html(slideT01(2)), SLOT);
    expect(semMargem).toContain('left:');
    const comZero = estiloDoSlot(
      t01Html(slideT01(2, { templateSlotStyles: { [SLOT]: { margin: 0 } } })),
      SLOT,
    );
    expect(comZero).toBe(semMargem);
  });

  it('a margem soma no eixo horizontal e no vertical', () => {
    const base = estiloDoSlot(t01Html(slideT01(2)), SLOT);
    const com = estiloDoSlot(
      t01Html(slideT01(2, { templateSlotStyles: { [SLOT]: { margin: 40 } } })),
      SLOT,
    );
    const num = (s: string, prop: string) =>
      parseFloat(s.match(new RegExp(`(?:^|;)${prop}:(-?[\\d.]+)px`))?.[1] ?? 'NaN');

    expect(num(com, 'left') - num(base, 'left')).toBe(40);
    expect(num(com, 'top') - num(base, 'top')).toBe(40);
    // A caixa encolhe pelo mesmo tanto: margem que não estreita o bloco só o
    // faria vazar pelo outro lado.
    expect(num(base, 'width') - num(com, 'width')).toBe(40);
  });

  it('o bloco ancorado à DIREITA anda para dentro, não para fora', () => {
    // No spec do T1 o único texto ancorado à direita é o `cantos.right` — é ele
    // que trava o sinal da margem nessa âncora (afastar da borda, não colar).
    const slot = 'cantos.right';
    const base = estiloDoSlot(t01Html(slideT01(3)), slot);
    expect(base).toContain('right:');
    const com = estiloDoSlot(
      t01Html(slideT01(3, { templateSlotStyles: { [slot]: { margin: 30 } } })),
      slot,
    );
    const right = (s: string) => parseFloat(s.match(/(?:^|;)right:(-?[\d.]+)px/)?.[1] ?? 'NaN');
    expect(right(com) - right(base)).toBe(30);
  });

  it('nenhum modelo se mexe enquanto ninguém tocar na margem', () => {
    for (const model of TEMPLATE_01_MODELS) {
      const a = t01Html(slideT01(model));
      const b = t01Html(slideT01(model, { templateSlotStyles: {} }));
      expect(b).toBe(a);
    }
  });
});

describe('TEMPLATE 2 — a margem empurra o bloco para dentro', () => {
  const slideT02 = (model: number, extra: Partial<Slide> = {}) =>
    slideT01(model, { templateFamily: 'template-02', ...extra } as Partial<Slide>);

  it('o título do slide interno desce e recua', () => {
    const base = estiloDoSlot(t02Html(slideT02(2)), 'content.title');
    const com = estiloDoSlot(
      t02Html(slideT02(2, { templateSlotStyles: { 'content.title': { margin: 24 } } })),
      'content.title',
    );
    expect(base).not.toContain('margin-top');
    expect(com).toContain('margin-top:24px');
    expect(com).toContain('margin-left:24px');
  });

  it('o cabeçalho continua com a margem dele, sem somar duas vezes', () => {
    // O Header já posiciona por `top`/`left`; se `textStyle` também empurrasse,
    // a margem valeria em dobro só ali.
    const com = estiloDoSlot(
      t02Html(slideT02(2, { templateSlotStyles: { 'header.category': { margin: 20 } } })),
      'header.category',
    );
    expect(com).not.toContain('margin-top');
    expect(com).toContain('left:91px');
  });
});

describe('a barra lateral oferece o slider nos dois templates', () => {
  function monta(style: 'template01' | 'template02', slide: Slide) {
    useEditorStore.setState({
      slides: [slide], activeSlideIndex: 0, style, globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
    const painel = document.querySelector('[data-panel="estiloDoTexto"]') as HTMLElement;
    expect(painel, 'o painel de estilo do texto não está na barra').toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { expanded: false }));
    return painel;
  }

  it('TEMPLATE 1: mexer no slider grava a margem do slot', () => {
    const painel = monta('template01', slideT01(2));
    const margens = within(painel).getAllByRole('slider').filter(
      (s) => s.getAttribute('max') === '150',
    );
    expect(margens.length).toBeGreaterThan(0);
    fireEvent.change(margens[0], { target: { value: '36' } });

    const estilos = useEditorStore.getState().slides[0].templateSlotStyles ?? {};
    expect(Object.values(estilos).some((st) => st.margin === 36)).toBe(true);
  });

  it('TEMPLATE 2: mexer no slider grava a margem do slot', () => {
    const painel = monta('template02', slideT01(2, { templateFamily: 'template-02' } as Partial<Slide>));
    const margens = within(painel).getAllByRole('slider').filter(
      (s) => s.getAttribute('max') === '150',
    );
    expect(margens.length).toBeGreaterThan(0);
    fireEvent.change(margens[0], { target: { value: '18' } });

    const estilos = useEditorStore.getState().slides[0].templateSlotStyles ?? {};
    expect(Object.values(estilos).some((st) => st.margin === 18)).toBe(true);
  });
});
