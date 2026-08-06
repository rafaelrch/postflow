// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';
import { TEMPLATE_02_DEFAULT_MODELS, template02Limits } from '@/lib/templates/template-02';

/**
 * BARRA LATERAL DO TEMPLATE 2 (fatia S2) — renderizada de verdade.
 *
 * Testar só a config de painéis provaria que a lista existe, não que o usuário
 * consegue editar. O que importa aqui é o que ele vê e o que acontece quando
 * mexe: os painéis certos, os cantos, a seleção do destaque e o "Restaurar".
 */

vi.mock('@/hooks/useGenerateCarouselImages', () => ({
  useGenerateCarouselImages: () => ({
    generateAll: vi.fn(),
    generateOne: vi.fn(),
    generating: false,
    progress: null,
  }),
  isEditorialCoverSlide: () => false,
}));

vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));

vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import EditorSidebar from '@/components/editor/EditorSidebar';

/** Deck de 5 slides do template02, na sequência padrão do spec. */
function montaDeck(active: number, slideExtra: Partial<Slide> = {}) {
  const slides = TEMPLATE_02_DEFAULT_MODELS.map((model, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    templateModel: model,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    templateSlots: {},
    ...(i === active ? slideExtra : {}),
  })) as Slide[];

  useEditorStore.setState({
    slides,
    activeSlideIndex: active,
    style: 'template02',
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });

  return render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
}

/** Abre um painel fechado pelo rótulo e devolve o card dele. */
function abre(painel: string): HTMLElement {
  fireEvent.click(screen.getByText(painel));
  return screen.getByText(painel).closest('[data-panel]') as HTMLElement;
}

afterEach(cleanup);

describe('TEMPLATE 2 — painéis na tela', () => {
  it('mostra todos os painéis dentro do slide selecionado', () => {
    montaDeck(1);
    for (const p of [
      'Conteúdo do slide',
      'Imagem',
      'Estilo do texto',
      'Fundo do slide',
      'Restaurar estilo original deste slide',
      'Cantos',
    ]) {
      expect(screen.getByText(p), p).toBeTruthy();
    }
  });

  it('NÃO mostra os painéis que são de outro estilo', () => {
    montaDeck(1);
    expect(screen.queryByText('Cabeçalho')).toBeNull();
    expect(screen.queryByText('Perfil')).toBeNull();
    expect(screen.queryByText('Sombra / Overlay')).toBeNull();
  });

  it('não cria grupo global para o cabeçalho', () => {
    montaDeck(1);
    expect(screen.getByText('SLIDE 02')).toBeTruthy();
    expect(screen.queryByText('Conteúdo do carrossel')).toBeNull();
    expect(screen.queryByText('Estilo global')).toBeNull();
  });
});

describe('TEMPLATE 2 — conteúdo do slide', () => {
  it('a capa mostra título, destaque e chamada; o interno, título e descrição', () => {
    montaDeck(0); // modelo 1 = capa
    expect(screen.getByText('Título')).toBeTruthy();
    expect(screen.getByText('Destaque')).toBeTruthy();
    expect(screen.getByText('Chamada')).toBeTruthy();
    cleanup();

    montaDeck(1); // modelo 2 = conteúdo
    expect(screen.getByText('Título')).toBeTruthy();
    expect(screen.getByText('Descrição')).toBeTruthy();
    expect(screen.queryByText('Chamada')).toBeNull();
  });

  it('editar um campo grava no slot do slide ativo, e só nele', () => {
    montaDeck(1);
    const painel = screen.getByText('Título').closest('[data-panel]') as HTMLElement;
    const campo = within(painel).getAllByRole('textbox')[0];
    fireEvent.change(campo, { target: { value: 'Marca não é logo' } });

    const { slides } = useEditorStore.getState();
    expect(slides[1].templateSlots?.['content.title']).toBe('Marca não é logo');
    expect(slides[2].templateSlots?.['content.title']).toBeUndefined();
  });

  it('mostra as palavras do título em sequência e marca as já destacadas', () => {
    montaDeck(0, {
      templateSlots: {
        'cover.headline': 'STARTUPS ERRAM A\nIDENTIDADE',
        'cover.highlight': 'ERRAM A',
      },
    });
    const picker = screen.getByRole('group', { name: 'Palavras em destaque' });
    expect(within(picker).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'STARTUPS',
      'ERRAM',
      'A',
      'IDENTIDADE',
    ]);
    expect(within(picker).getByRole('button', { name: 'ERRAM' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(within(picker).getByRole('button', { name: 'A' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('um clique atualiza imediatamente o destaque na ordem do título', () => {
    montaDeck(0, {
      templateSlots: { 'cover.headline': 'STARTUPS ERRAM A\nIDENTIDADE', 'cover.highlight': 'ERRAM A' },
    });
    const picker = screen.getByRole('group', { name: 'Palavras em destaque' });
    fireEvent.click(within(picker).getByRole('button', { name: 'STARTUPS' }));
    expect(useEditorStore.getState().slides[0].templateSlots?.['cover.highlight']).toBe(
      'STARTUPS, ERRAM, A'
    );
  });

  it('acusa o estouro do limite', () => {
    const limite = template02Limits('content.title').maxChar!;
    montaDeck(1, { templateSlots: { 'content.title': 'a'.repeat(limite + 1) } });
    expect(screen.getByText(`${limite + 1}/${limite} car.`)).toBeTruthy();
    expect(screen.getByText(/Estourou o limite do slot/i)).toBeTruthy();
  });

  it('não mostra textos explicativos na sidebar', () => {
    montaDeck(0);
    expect(screen.queryByText(/Enter quebra a linha/i)).toBeNull();
    expect(screen.queryByText(/Separe por vírgula/i)).toBeNull();
  });
});

describe('TEMPLATE 2 — cantos', () => {
  it('editar a categoria muda somente o slide ativo', () => {
    montaDeck(2);
    const painel = abre('Cantos');
    const campo = within(painel).getAllByRole('textbox')[0];
    fireEvent.change(campo, { target: { value: 'ARKE STUDIO' } });

    const { slides } = useEditorStore.getState();
    expect(slides[2].templateSlots?.['header.category']).toBe('ARKE STUDIO');
    expect(slides[1].templateSlots?.['header.category']).toBeUndefined();
  });

  it('editar o @ também muda somente o slide ativo', () => {
    montaDeck(0);
    const painel = abre('Cantos');
    const campo = within(painel).getAllByRole('textbox')[1];
    fireEvent.change(campo, { target: { value: '@ARKEBRANDING' } });
    const slides = useEditorStore.getState().slides;
    expect(slides[0].templateSlots?.['header.handle']).toBe('@ARKEBRANDING');
    expect(slides[1].templateSlots?.['header.handle']).toBeUndefined();
  });

  it('liga e desliga só no slide ativo e oferece fonte, cor, tamanho e margem', () => {
    montaDeck(1);
    const painel = abre('Cantos');

    expect(within(painel).getByText('Exibir cantos')).toBeTruthy();
    expect(within(painel).getByText('Cor')).toBeTruthy();
    expect(within(painel).getByText('Fonte')).toBeTruthy();
    expect(within(painel).getByText('Tamanho fonte')).toBeTruthy();
    expect(within(painel).getByText('Margem')).toBeTruthy();

    fireEvent.click(within(painel).getByText('Exibir cantos'));
    const slides = useEditorStore.getState().slides;
    expect(slides[1].templateSlotStyles?.['header.category']?.visible).toBe(false);
    expect(slides[1].templateSlotStyles?.['header.handle']?.visible).toBe(false);
    expect(slides[0].templateSlotStyles).toBeUndefined();
  });

  it('tamanho e margem são globais e não poluem o estilo de nenhum slide', () => {
    montaDeck(2);
    const painel = abre('Cantos');
    const sliders = within(painel).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '30' } });
    fireEvent.change(sliders[1], { target: { value: '18' } });

    const state = useEditorStore.getState();
    expect(state.globalSettings.templateCornerStyle).toMatchObject({ fontSize: 30, margin: 18 });
    expect(state.slides.every((slide) => slide.templateSlotStyles == null)).toBe(true);
  });

  it('família e peso dos cantos também são globais', () => {
    montaDeck(1);
    const painel = abre('Cantos');
    fireEvent.change(within(painel).getByRole('combobox', { name: 'Fonte' }), {
      target: { value: 'Inter' },
    });
    fireEvent.change(within(painel).getByRole('combobox', { name: 'Peso da fonte' }), {
      target: { value: 'Inter Bold' },
    });

    expect(useEditorStore.getState().globalSettings.templateCornerStyle?.font).toBe('Inter Bold');
  });
});

describe('TEMPLATE 2 — imagem', () => {
  it('sem imagem, não há slider mexendo em nada', () => {
    montaDeck(1);
    const painel = screen.getByText('Imagem').closest('[data-panel]') as HTMLElement;
    expect(within(painel).queryByText('Opacidade')).toBeNull();
    expect(within(painel).queryByText('Zoom')).toBeNull();
    expect(within(painel).queryByText(/placeholder cinza/i)).toBeNull();
  });

  it('com imagem, aparecem a miniatura e os ajustes', () => {
    montaDeck(1, { templateSlots: { 'content.image': 'https://x/foto.jpg' } });
    const painel = screen.getByText('Imagem').closest('[data-panel]') as HTMLElement;
    expect(within(painel).getByAltText('Imagem anexada')).toBeTruthy();
    expect(within(painel).getByText('Opacidade')).toBeTruthy();
    expect(within(painel).getByText('Zoom')).toBeTruthy();
  });

  it('remover limpa o SLOT — a mesma chave que o upload e a IA escrevem', () => {
    montaDeck(1, {
      templateSlots: { 'content.image': 'https://x/foto.jpg' },
      contentImageUrl: 'https://x/generico.jpg',
    });
    fireEvent.click(screen.getByTitle('Remover imagem'));
    const slide = useEditorStore.getState().slides[1];
    expect(slide.templateSlots?.['content.image']).toBe('');
    // E o genérico junto, senão a imagem "volta sozinha".
    expect(slide.contentImageUrl).toBe('');
  });
});

describe('TEMPLATE 2 — estilo e restauração', () => {
  it('o Destaque oferece somente fonte e cor do marcador', () => {
    montaDeck(0);
    const painel = abre('Estilo do texto');
    const destaque = within(painel).getByText('Destaque').parentElement!;

    expect(within(destaque).getByText('Cor do marcador')).toBeTruthy();
    expect(within(destaque).getByText('Fonte')).toBeTruthy();
    expect(within(destaque).queryByText('Tamanho')).toBeNull();
    expect(within(destaque).queryByText('Espaçamento de letras')).toBeNull();
    expect(within(destaque).queryByTitle('Sublinhado')).toBeNull();
  });

  it('o seletor de tamanho abre no número do spec, não num padrão do editor', () => {
    montaDeck(1);
    const painel = abre('Estilo do texto');
    // 73.1693 do slideTitle, arredondado para o slider.
    expect(within(painel).getAllByDisplayValue('73').length).toBeGreaterThan(0);
  });

  it('mexer no estilo de um bloco grava só nele', () => {
    montaDeck(1);
    const painel = abre('Estilo do texto');
    const sliders = within(painel).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '90' } });
    const styles = useEditorStore.getState().slides[1].templateSlotStyles ?? {};
    expect(styles['content.title']?.fontSize).toBe(90);
    expect(styles['content.body']).toBeUndefined();
  });

  it('"Restaurar" nasce desabilitado e ganha o badge depois do primeiro gesto', () => {
    montaDeck(1);
    const botao = screen.getByText('Restaurar estilo original deste slide').closest('button')!;
    expect(botao.hasAttribute('disabled')).toBe(true);
    cleanup();

    montaDeck(1, { templateSlotStyles: { 'content.title': { color: '#f00' } } });
    const ativo = screen.getByText('Restaurar estilo original deste slide').closest('button')!;
    expect(ativo.hasAttribute('disabled')).toBe(false);
    expect(within(ativo).getByText('1')).toBeTruthy();
  });

  it('restaurar limpa estilo e marcas, sem tocar no texto', () => {
    montaDeck(1, {
      templateSlots: { 'content.title': 'Marca não é logo' },
      templateSlotStyles: { 'content.title': { color: '#f00' } },
      templateOverrides: { background: true },
    });
    // O botão de dentro se chama só "Restaurar"; o texto longo é o cabeçalho
    // do painel.
    const painel = abre('Restaurar estilo original deste slide');
    fireEvent.click(within(painel).getByText('Restaurar'));
    const slide = useEditorStore.getState().slides[1];
    expect(slide.templateSlotStyles).toBeUndefined();
    expect(slide.templateOverrides).toBeUndefined();
    expect(slide.templateSlots?.['content.title']).toBe('Marca não é logo');
  });
});
