// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';
import { TEMPLATE_02_DEFAULT_MODELS } from '@/lib/templates/template-02';

/**
 * BARRA LATERAL DO TEMPLATE 2 (fatia S2) — renderizada de verdade.
 *
 * Testar só a config de painéis provaria que a lista existe, não que o usuário
 * consegue editar. O que importa aqui é o que ele vê e o que acontece quando
 * mexe: os painéis certos, o cabeçalho propagando pelo deck, o aviso quando o
 * marcador não vai aparecer, e o "Restaurar" sabendo se há o que restaurar.
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
  it('mostra os painéis do slide e o do carrossel', () => {
    montaDeck(1);
    for (const p of [
      'Conteúdo do slide',
      'Imagem',
      'Estilo do texto',
      'Fundo do slide',
      'Restaurar estilo original deste slide',
      'Cabeçalho',
    ]) {
      expect(screen.getByText(p), p).toBeTruthy();
    }
  });

  it('NÃO mostra os painéis que são de outro estilo', () => {
    montaDeck(1);
    // "Cantos" é do Template 1; o equivalente do T2 é o "Cabeçalho".
    expect(screen.queryByText('Cantos')).toBeNull();
    expect(screen.queryByText('Perfil')).toBeNull();
    expect(screen.queryByText('Sombra / Overlay')).toBeNull();
  });

  it('o grupo global diz CONTEÚDO DO CARROSSEL, não "estilo global"', () => {
    montaDeck(1);
    // O cabeçalho do T2 é conteúdo. Rótulo que mente foi o que a refatoração
    // desta barra veio acabar.
    expect(screen.getByText('Conteúdo do carrossel')).toBeTruthy();
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

  it('avisa quando o destaque não está em nenhuma linha do título', () => {
    // Sem o aviso, o marcador simplesmente não desenha e o usuário não tem como
    // descobrir por quê.
    montaDeck(0, {
      templateSlots: { 'cover.headline': 'LINHA UM\nLINHA DOIS', 'cover.highlight': 'INEXISTENTE' },
    });
    expect(screen.getByText(/não está em nenhuma linha do título/i)).toBeTruthy();
  });

  it('não avisa quando o destaque cabe numa linha', () => {
    montaDeck(0, {
      templateSlots: { 'cover.headline': 'STARTUPS ERRAM A\nIDENTIDADE', 'cover.highlight': 'ERRAM A' },
    });
    expect(screen.queryByText(/não está em nenhuma linha do título/i)).toBeNull();
  });

  it('acusa o estouro do limite do spec', () => {
    montaDeck(1, { templateSlots: { 'content.title': 'a'.repeat(41) } });
    expect(screen.getByText('41/40 car.')).toBeTruthy();
    expect(screen.getByText(/Estourou o limite do slot/i)).toBeTruthy();
  });

  it('diz que a quebra da capa é decisão do usuário', () => {
    // O spec manda quebrar por sentido; se a interface não disser, ele escreve
    // corrido e o template quebra onde couber.
    montaDeck(0);
    expect(screen.getByText(/Enter quebra a linha, e é você que decide onde/i)).toBeTruthy();
  });
});

describe('TEMPLATE 2 — cabeçalho é do deck', () => {
  it('editar a categoria propaga para TODOS os slides', () => {
    montaDeck(2);
    const painel = abre('Cabeçalho');
    const campo = within(painel).getAllByRole('textbox')[0];
    fireEvent.change(campo, { target: { value: 'ARKE STUDIO' } });

    const { slides } = useEditorStore.getState();
    // Editar num slide e ver outro divergir seria bug, não liberdade.
    for (const s of slides) expect(s.templateSlots?.['header.category']).toBe('ARKE STUDIO');
  });

  it('editar o @ propaga também', () => {
    montaDeck(0);
    const painel = abre('Cabeçalho');
    const campo = within(painel).getAllByRole('textbox')[1];
    fireEvent.change(campo, { target: { value: '@ARKEBRANDING' } });
    for (const s of useEditorStore.getState().slides) {
      expect(s.templateSlots?.['header.handle']).toBe('@ARKEBRANDING');
    }
  });
});

describe('TEMPLATE 2 — imagem', () => {
  it('sem imagem, não há slider mexendo em nada', () => {
    montaDeck(1);
    const painel = screen.getByText('Imagem').closest('[data-panel]') as HTMLElement;
    expect(within(painel).queryByText('Opacidade')).toBeNull();
    expect(within(painel).queryByText('Zoom')).toBeNull();
    expect(within(painel).getByText(/placeholder cinza/i)).toBeTruthy();
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
