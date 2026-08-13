// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, within, fireEvent } from '@testing-library/react';
import ProfileSlide from '@/components/slides/ProfileSlide';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

vi.mock('@/hooks/useGenerateCarouselImages', () => ({
  useGenerateCarouselImages: () => ({
    generateAll: vi.fn(), generateOne: vi.fn(), generating: false, progress: null,
  }),
  isEditorialCoverSlide: () => false,
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({ default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import EditorSidebar from '@/components/editor/EditorSidebar';

/**
 * TEMPLATE PERFIL — os dois pedidos do Rafael.
 *
 * 7. Negrito PARCIAL: dá para engrossar ALGUMAS palavras, não o texto todo. O
 *    caminho já existia (`TextHighlight.font` + `WordHighlightPicker`, usados
 *    pelo Editorial e pelo Minimalista); o que faltava era o `ProfileSlide` ler
 *    os destaques e a barra lateral oferecer o controle no estilo `profile`.
 *
 * 8. A imagem importada estava sendo CORTADA. A causa: a mídia era uma caixa de
 *    altura fixa (510 px) com `background-size: cover`, então tudo o que não
 *    fosse 864x510 perdia as bordas. O Rafael confirmou que é para entrar
 *    INTEIRA, na proporção original e sem crop.
 */

const perfil = { photo: '', name: 'Fulano', handle: '@fulano' };

function slidePerfil(extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 'p1',
    position: 0,
    title: 'Negrito só em algumas palavras',
    description: '',
    ...extra,
  } as Slide;
}

function renderPerfil(slide: Slide) {
  return render(
    <ProfileSlide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      profileData={perfil}
      slideIndex={0}
      totalSlides={3}
    />,
  );
}

afterEach(cleanup);

describe('7 — negrito parcial no Perfil', () => {
  it('a palavra destacada sai com a fonte dela; o resto do bloco não muda', () => {
    const { container } = renderPerfil(
      slidePerfil({
        highlights: [{ text: 'algumas', color: '#0F1419', font: 'Inter Bold' }],
      }),
    );

    const spans = Array.from(container.querySelectorAll('span'));
    const destaque = spans.find((s) => s.textContent === 'algumas');
    expect(destaque, 'a palavra destacada precisa virar um span próprio').toBeTruthy();
    expect(destaque!.style.fontWeight).toBe('700');

    // As outras palavras continuam no peso do bloco (400) — é isso que faz o
    // negrito ser PARCIAL e não do texto todo.
    const outra = spans.find((s) => s.textContent === 'Negrito');
    expect(outra?.style.fontWeight ?? '').not.toBe('700');
    expect(container.textContent).toContain('Negrito só em algumas palavras');
  });

  it('sem destaque nenhum o texto sai inteiro, como sempre saiu', () => {
    const { container } = renderPerfil(slidePerfil());
    expect(container.textContent).toContain('Negrito só em algumas palavras');
  });

  it('a cor do destaque também vale', () => {
    const { container } = renderPerfil(
      slidePerfil({ highlights: [{ text: 'algumas', color: '#FF0000' }] }),
    );
    const destaque = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent === 'algumas',
    );
    expect(destaque!.style.color).toBe('rgb(255, 0, 0)');
  });

  it('a barra lateral do Perfil oferece o controle de destaques', () => {
    useEditorStore.setState({
      slides: [slidePerfil()],
      activeSlideIndex: 0,
      style: 'profile',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    const painel = document.querySelector('[data-panel="destaquesDoTexto"]') as HTMLElement;
    expect(painel, 'o painel de destaques não está na barra do Perfil').toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { expanded: false }));

    // Clicar na palavra e escolher uma face bold grava o destaque com a fonte.
    fireEvent.click(within(painel).getByRole('button', { name: 'algumas' }));
    const state = () => useEditorStore.getState().slides[0].highlights ?? [];
    expect(state().some((h) => h.text === 'algumas')).toBe(true);
  });
});

describe('8 — a imagem do Perfil entra inteira, sem crop', () => {
  const comImagem = () => slidePerfil({ gridImageUrl: 'https://x/foto.png' });

  it('é um <img> de proporção livre, não uma caixa recortada por background', () => {
    const { container } = renderPerfil(comImagem());
    const img = container.querySelector('img[src="https://x/foto.png"]') as HTMLImageElement;
    expect(img, 'a mídia precisa ser um <img> para respeitar a proporção').toBeTruthy();
    // `height: auto` é o que faz a caixa seguir a imagem em vez do contrário.
    expect(img.style.height).toBe('auto');
    expect(img.style.maxWidth).toBe('100%');
    // Nada de object-fit: recortar é justamente o que não pode acontecer.
    expect(img.style.objectFit).toBe('');
  });

  it('não sobrou nenhuma camada com background-size: cover para a mídia', () => {
    const { container } = renderPerfil(comImagem());
    const recortada = Array.from(container.querySelectorAll<HTMLElement>('div')).find(
      (d) => d.style.backgroundImage.includes('foto.png'),
    );
    expect(recortada).toBeUndefined();
  });

  it('sem imagem o slide continua sem bloco de mídia', () => {
    const { container } = renderPerfil(slidePerfil());
    expect(container.querySelector('img[src*="foto"]')).toBeNull();
  });
});
