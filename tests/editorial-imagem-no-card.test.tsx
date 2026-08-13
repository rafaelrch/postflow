// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, within, fireEvent } from '@testing-library/react';
import EditorialSlide from '@/components/slides/EditorialSlide';
import { useEditorStore } from '@/hooks/useEditorStore';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_SLIDE,
  type ContentLayout,
  type Slide,
} from '@/types';

vi.mock('@/hooks/useGenerateCarouselImages', async () => {
  const real = await vi.importActual<typeof import('@/hooks/useGenerateCarouselImages')>(
    '@/hooks/useGenerateCarouselImages',
  );
  return {
    ...real,
    useGenerateCarouselImages: () => ({
      generateAll: vi.fn(), generateOne: vi.fn(), generating: false,
      progress: { done: 0, total: 0 },
    }),
  };
});
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({ default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import EditorSidebar from '@/components/editor/EditorSidebar';

/**
 * EDITORIAL — os dois pedidos do Rafael.
 *
 *  9. Imagem NÃO vai no fundo dos slides: só no CARD (o shape de imagem do
 *     layout). A capa é a exceção óbvia — ela não tem card, a imagem dela É o
 *     slide, e o painel "Imagem" nem aparece na capa (ver `TEMPLATE_SIDEBAR_CONFIG`).
 * 10. As três SEQUÊNCIAS já existiam em `ContentLayout` e o `EditorialSlide` já
 *     as desenhava; faltava a barra lateral deixar escolher.
 */

const FOTO = 'https://x/foto.png';
const CARD = 'https://x/card.png';

function slideEditorial(extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 'e1',
    position: 1,
    title: 'Título',
    description: 'Descrição',
    ...extra,
  } as Slide;
}

function renderEditorial(slide: Slide, slideIndex = 1) {
  return render(
    <EditorialSlide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={slideIndex}
      totalSlides={4}
    />,
  );
}

/** Todas as camadas que pintam uma URL como background. */
function camadasComImagem(container: HTMLElement, url: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('div')).filter((d) =>
    d.style.backgroundImage.includes(url),
  );
}

const SEQUENCIAS: ContentLayout[] = ['text-image-text', 'text-text-image', 'image-text-text'];

afterEach(cleanup);

describe('9 — a imagem não vai mais para o fundo dos slides', () => {
  it.each(SEQUENCIAS)('%s ignora backgroundImageUrl', (layout) => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: layout, backgroundImageUrl: FOTO }),
    );
    expect(camadasComImagem(container, FOTO)).toHaveLength(0);
  });

  it.each(SEQUENCIAS)('%s continua pintando a imagem do CARD', (layout) => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: layout, contentImageUrl: CARD }),
    );
    expect(camadasComImagem(container, CARD).length).toBeGreaterThan(0);
  });

  it('o gridImageUrl legado também não vaza para o fundo', () => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: 'text-image-text', gridImageUrl: FOTO }),
    );
    expect(camadasComImagem(container, FOTO)).toHaveLength(0);
  });

  it('text-only não tem card, então também não tem imagem nenhuma', () => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: 'text-only', backgroundImageUrl: FOTO }),
    );
    expect(camadasComImagem(container, FOTO)).toHaveLength(0);
  });

  it('a CAPA continua com a imagem full-bleed — ela não tem card', () => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: 'cover', backgroundImageUrl: FOTO }),
      0,
    );
    expect(camadasComImagem(container, FOTO).length).toBeGreaterThan(0);
  });
});

describe('10 — a posição da imagem é escolhível nas três sequências', () => {
  function montaEditorial(slide: Slide) {
    useEditorStore.setState({
      slides: [slideEditorial({ id: 'capa', position: 0, contentLayout: 'cover' }), slide],
      activeSlideIndex: 1,
      style: 'editorial',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
    const painel = document.querySelector('[data-panel="layoutDoSlide"]') as HTMLElement;
    expect(painel, 'o painel de layout não está na barra').toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { expanded: false }));
    return painel;
  }

  it('as três sequências aparecem e gravam no slide', () => {
    const painel = montaEditorial(slideEditorial({ contentLayout: 'text-image-text' }));
    const ativo = () => useEditorStore.getState().slides[1];

    for (const [rotulo, esperado] of [
      ['Imagem embaixo', 'text-text-image'],
      ['Imagem em cima', 'image-text-text'],
      ['Imagem no meio', 'text-image-text'],
    ] as const) {
      fireEvent.click(within(painel).getByRole('button', { name: rotulo }));
      expect(ativo().contentLayout).toBe(esperado);
    }
  });

  it('o botão da sequência ativa fica marcado', () => {
    const painel = montaEditorial(slideEditorial({ contentLayout: 'text-text-image' }));
    const botao = within(painel).getByRole('button', { name: 'Imagem embaixo' });
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    expect(
      within(painel).getByRole('button', { name: 'Imagem no meio' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('na CAPA o seletor não aparece — ela não é uma sequência', () => {
    useEditorStore.setState({
      slides: [slideEditorial({ id: 'capa', position: 0, contentLayout: 'cover' })],
      activeSlideIndex: 0,
      style: 'editorial',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
    const painel = document.querySelector('[data-panel="layoutDoSlide"]') as HTMLElement;
    fireEvent.click(within(painel).getByRole('button', { expanded: false }));
    expect(within(painel).queryByRole('button', { name: 'Imagem no meio' })).toBeNull();
  });
});
