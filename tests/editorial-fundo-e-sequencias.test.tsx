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
 * EDITORIAL — os dois retornos do Rafael depois de testar a F4.
 *
 * 1. O upload da aba "Fundo do Slide" ficou órfão nos slides internos: a F4
 *    tirou a imagem do fundo, mas o controle continuou lá aceitando arquivo que
 *    não entrava em lugar nenhum. Some — MENOS na capa, que é justamente o
 *    slide cuja imagem de fundo continua valendo e que não tem painel "Imagem".
 *
 * 2. Buraco entre título e descrição. As sequências `text-text-image` e
 *    `image-text-text` posicionavam cada bloco por `top` absoluto, com uma
 *    FAIXA FIXA reservada para o título (28% da altura ≈ 378 px). Título curto
 *    deixava ~228 px de vazio antes da descrição — "como se algo fosse ser
 *    inserido ali", que é exatamente o slot da imagem sendo reservado à toa. O
 *    `text-image-text` não tinha o defeito porque já era uma coluna flex com
 *    `gap`. As três passam a ser a MESMA coluna flex; o que muda é só a ordem.
 */

const FOTO = 'https://x/foto.png';
const SEQUENCIAS: ContentLayout[] = ['text-image-text', 'text-text-image', 'image-text-text'];

function slideEditorial(extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 'e1',
    position: 1,
    title: 'Título curto',
    description: 'Descrição do slide',
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

const bloco = (c: HTMLElement, nome: string) =>
  c.querySelector<HTMLElement>(`[data-block="${nome}"]`);

afterEach(cleanup);

describe('2 — o espaço entre título e descrição colapsa quando não há imagem no meio', () => {
  it.each(['text-text-image', 'image-text-text'] as ContentLayout[])(
    '%s: descrição vem colada no título, sem faixa reservada',
    (layout) => {
      const { container } = renderEditorial(slideEditorial({ contentLayout: layout }));
      const titulo = bloco(container, 'title')!;
      const desc = bloco(container, 'description')!;
      expect(titulo).toBeTruthy();
      expect(desc).toBeTruthy();

      // Irmãos imediatos: entre eles só existe o `gap` da coluna.
      expect(desc.previousElementSibling).toBe(titulo);
      // E nenhum `top` absoluto calculado a partir da faixa fixa do título.
      expect(desc.style.top).toBe('');
      expect(titulo.style.top).toBe('');
    },
  );

  it('text-image-text: a imagem continua ENTRE os dois textos', () => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: 'text-image-text', contentImageUrl: FOTO }),
    );
    const titulo = bloco(container, 'title')!;
    const img = bloco(container, 'image')!;
    const desc = bloco(container, 'description')!;
    expect(titulo.nextElementSibling).toBe(img);
    expect(img.nextElementSibling).toBe(desc);
  });

  it.each([
    ['text-text-image', ['title', 'description', 'image']],
    ['image-text-text', ['image', 'title', 'description']],
  ] as const)('%s respeita a ordem da sequência', (layout, ordem) => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: layout as ContentLayout, contentImageUrl: FOTO }),
    );
    const nomes = Array.from(container.querySelectorAll<HTMLElement>('[data-block]')).map(
      (el) => el.dataset.block,
    );
    expect(nomes).toEqual([...ordem]);
  });

  it.each(SEQUENCIAS)('%s usa a mesma coluna flex, com o gap do slide', (layout) => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: layout, titleDescriptionGap: 24 }),
    );
    const coluna = bloco(container, 'title')!.parentElement as HTMLElement;
    expect(coluna.style.display).toBe('flex');
    expect(coluna.style.flexDirection).toBe('column');
    expect(coluna.style.gap).toBe('24px');
  });

  it.each(SEQUENCIAS)('%s: sem descrição o slide não abre vão nenhum', (layout) => {
    const { container } = renderEditorial(
      slideEditorial({ contentLayout: layout, description: '' }),
    );
    expect(bloco(container, 'description')).toBeNull();
  });

  it.each(SEQUENCIAS)('%s: os sliders de mover bloco continuam valendo', (layout) => {
    const { container } = renderEditorial(
      slideEditorial({
        contentLayout: layout,
        contentImageUrl: FOTO,
        editorialTitleOffsetY: 30,
        editorialDescOffsetY: -20,
      }),
    );
    expect(bloco(container, 'title')!.style.transform).toBe('translateY(30px)');
    expect(bloco(container, 'description')!.style.transform).toBe('translateY(-20px)');
  });
});

describe('1 — o upload órfão sai da aba "Fundo do Slide" do Editorial', () => {
  function montaEditorial(slide: Slide, activeSlideIndex = 1) {
    useEditorStore.setState({
      slides: [
        slideEditorial({ id: 'capa', position: 0, contentLayout: 'cover' }),
        slide,
      ],
      activeSlideIndex,
      style: 'editorial',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
    const painel = document.querySelector('[data-panel="fundoDoSlide"]') as HTMLElement;
    expect(painel, 'o painel de fundo não está na barra').toBeTruthy();
    const botao = within(painel).queryByRole('button', { expanded: false });
    if (botao) fireEvent.click(botao);
    return painel;
  }

  it('slide interno: nada de arrastar imagem, só a cor', () => {
    const painel = montaEditorial(slideEditorial({ contentLayout: 'text-image-text' }));
    expect(within(painel).queryByText(/arraste uma imagem de fundo/i)).toBeNull();
    expect(within(painel).getByText('Cor')).toBeTruthy();
  });

  it('na CAPA o upload saiu daqui e foi para o painel "Imagem"', () => {
    // A capa continua sendo o único slide do Editorial onde a imagem de fundo
    // entra — o que mudou é ONDE se põe. A geração por IA já tinha ido para o
    // painel "Imagem"; o upload tinha ficado para trás, e os dois gravavam no
    // MESMO campo a partir de painéis diferentes.
    const painel = montaEditorial(
      slideEditorial({ id: 'capa2', position: 0, contentLayout: 'cover' }),
      0,
    );
    expect(within(painel).queryByText(/arraste uma imagem de fundo/i)).toBeNull();
    expect(within(painel).getByText('Cor')).toBeTruthy();

    const imagem = document.querySelector('[data-panel="imagem"]') as HTMLElement;
    expect(imagem, 'a capa precisa do painel "Imagem"').toBeTruthy();
    const abrir = within(imagem).queryByRole('button', { expanded: false });
    if (abrir) fireEvent.click(abrir);
    expect(within(imagem).getByText(/arraste uma imagem de fundo/i)).toBeTruthy();
  });

  it('carrossel antigo com fundo salvo: o dado não é apagado, mas dá para remover', () => {
    // Não mexemos no que já está gravado — mas sem nenhum controle o usuário
    // ficaria com lixo invisível e sem como limpar.
    const painel = montaEditorial(
      slideEditorial({ contentLayout: 'text-image-text', backgroundImageUrl: FOTO }),
    );
    expect(within(painel).getByText(/não é mais usada/i)).toBeTruthy();

    const remover = within(painel).getByRole('button', { name: /remover imagem de fundo/i });
    // Continua gravado enquanto ele não clicar.
    expect(useEditorStore.getState().slides[1].backgroundImageUrl).toBe(FOTO);
    fireEvent.click(remover);
    expect(useEditorStore.getState().slides[1].backgroundImageUrl).toBe('');
    expect(useEditorStore.getState().slides[1].gridImageUrl).toBe('');
  });

  it('sem fundo salvo o aviso não aparece', () => {
    const painel = montaEditorial(slideEditorial({ contentLayout: 'text-image-text' }));
    expect(within(painel).queryByText(/não é mais usada/i)).toBeNull();
  });
});
