// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';
import { TEMPLATE_01_SLIDE_COUNT } from '@/lib/templates/template-01';

/**
 * PAINEL DE IMAGEM DO TEMPLATE 1 — pedido do Rafael.
 *
 * O defeito: os sliders de imagem (posição X, posição Y, zoom, opacidade)
 * apareciam SEMPRE, mesmo em slide sem imagem nenhuma — controle mexendo em
 * nada. E não havia como ver nem remover a imagem que estava no slide.
 *
 * A regra agora: preview + X logo abaixo do botão de gerar com IA, e slider só
 * quando HÁ imagem no slot. Vale para imagem de qualquer origem — gerada por IA
 * ou enviada pelo usuário —, porque o controle é sobre o slot do slide.
 */

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

vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import EditorSidebar from '@/components/editor/EditorSidebar';

const IMG = 'https://exemplo.test/imagem.png';

/** Um deck de 6 slides de template01, com o slide `active` selecionado. */
function montaDeck(active: number, slideExtra: Partial<Slide> = {}) {
  const slides = Array.from({ length: TEMPLATE_01_SLIDE_COUNT }, (_, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...(i === active ? slideExtra : {}),
  })) as Slide[];

  useEditorStore.setState({
    slides,
    activeSlideIndex: active,
    style: 'template01',
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });

  return render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
}

/**
 * Abre o painel "Imagem" e devolve SÓ o bloco dele.
 *
 * O rótulo é único no sidebar inteiro — antes existiam DOIS painéis de imagem
 * ("Imagem" no conteúdo e "Imagem — Slide N" no estilo), cada um escrevendo num
 * campo diferente. `getByText` falha se a duplicata voltar, o que é de
 * propósito: é o teste que trava a unificação.
 */
function abreSecaoImagem(_active: number): HTMLElement {
  const painel = screen.getByText('Imagem').closest('[data-panel]') as HTMLElement;
  // O painel de imagem já nasce aberto — clicar sem checar o fecharia.
  const fechado = within(painel).queryAllByRole('button', { expanded: false });
  if (fechado.length > 0) fireEvent.click(fechado[0]);
  return painel;
}

const SLIDERS = ['Posição X', 'Posição Y', 'Zoom', 'Opacidade'];

beforeEach(() => {
  useEditorStore.setState({ slides: [], activeSlideIndex: 0 });
});

// Sem `globals` no vitest.config, o cleanup automático do testing-library não
// se registra e o painel do teste anterior fica no DOM.
afterEach(cleanup);

describe('TEMPLATE 1 — painel de imagem', () => {
  it('slide COM imagem de fundo: mostra preview e os sliders', () => {
    montaDeck(0, { templateSlots: { 's1.image': IMG } });
    const painel = abreSecaoImagem(0);

    const img = within(painel).getByAltText('Imagem anexada') as HTMLImageElement;
    expect(img.src).toBe(IMG);
    for (const s of SLIDERS) expect(within(painel).getByText(s), s).toBeTruthy();
  });

  it('slide SEM imagem: nenhum preview e NENHUM slider', () => {
    montaDeck(0);
    const painel = abreSecaoImagem(0);

    expect(within(painel).queryByAltText('Imagem anexada')).toBeNull();
    for (const s of SLIDERS) expect(within(painel).queryByText(s), s).toBeNull();
  });

  it('o botão de gerar com IA continua lá mesmo sem imagem', () => {
    // Sem ele não haveria como conseguir a primeira imagem do slide.
    montaDeck(0);
    const painel = abreSecaoImagem(0);
    expect(within(painel).getByText(/Gerar imagem com IA/)).toBeTruthy();
  });

  it('o X do preview remove a imagem do slot', () => {
    montaDeck(0, { templateSlots: { 's1.image': IMG } });
    const painel = abreSecaoImagem(0);

    fireEvent.click(within(painel).getByTitle('Remover imagem'));

    const slide = useEditorStore.getState().slides[0];
    expect(slide.templateSlots?.['s1.image'] ?? '').toBe('');
    expect(within(painel).queryByAltText('Imagem anexada')).toBeNull();
    for (const s of SLIDERS) expect(within(painel).queryByText(s), s).toBeNull();
  });

  it('vale para a imagem de CONTEÚDO também (slide 3), não só a de fundo', () => {
    montaDeck(2, { templateSlots: { 's3.image': IMG } });
    const painel = abreSecaoImagem(2);

    expect(within(painel).getByAltText('Imagem anexada')).toBeTruthy();
    for (const s of SLIDERS) expect(within(painel).getByText(s), s).toBeTruthy();

    fireEvent.click(within(painel).getByTitle('Remover imagem'));
    expect(useEditorStore.getState().slides[2].templateSlots?.['s3.image'] ?? '').toBe('');
  });

  it('imagem vinda dos campos genéricos do editor também aparece no preview', () => {
    // A origem não importa: o controle é sobre o SLOT do slide, e o render
    // já cai nesses campos quando o slot está vazio.
    montaDeck(2, { contentImageUrl: IMG });
    const painel = abreSecaoImagem(2);
    expect(within(painel).getByAltText('Imagem anexada')).toBeTruthy();
  });

  it('remover limpa também o campo genérico — senão a imagem voltaria', () => {
    montaDeck(2, { contentImageUrl: IMG });
    const painel = abreSecaoImagem(2);
    fireEvent.click(within(painel).getByTitle('Remover imagem'));

    const slide = useEditorStore.getState().slides[2];
    expect(slide.contentImageUrl ?? '').toBe('');
    expect(within(painel).queryByAltText('Imagem anexada')).toBeNull();
  });

  it('slide 6 não tem slot de imagem: o painel inteiro não aparece', () => {
    // Antes o painel abria só para dizer "este slide não tem imagem no
    // template" — uma linha de navegação que só servia para decepcionar. A
    // condição vive na config do template (`when`), então ele some.
    montaDeck(5);

    expect(screen.queryByText('Imagem')).toBeNull();
    expect(screen.queryByAltText('Imagem anexada')).toBeNull();
    for (const s of SLIDERS) expect(screen.queryByText(s), s).toBeNull();
    expect(screen.queryByText(/Gerar imagem com IA/)).toBeNull();
  });
});
