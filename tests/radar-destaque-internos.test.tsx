// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Template02Slide from '@/components/slides/Template02Slide';
import { mapDbSlideToSlide, mapSlideToDbRow } from '@/lib/slide-mapper';
import {
  TEMPLATE_02_COLORS,
  TEMPLATE_02_EXTENSIONS,
  TEMPLATE_02_HIGHLIGHT_COLOR,
  template02HighlightTextColor,
  template02Limits,
  template02SlotColor,
  template02SlotsForModel,
} from '@/lib/templates/template-02';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

/**
 * DESTAQUE NOS SLIDES INTERNOS DO RADAR — pedido do Rafael (02/09/2026).
 *
 * *"o template ele já tem o destaque, tanto que na sidebar do editor o usuário
 * consegue mudar a cor, então tem que ter esse destaque."*
 *
 * O spec só desenhou `cover.highlight`, com `models: [1]`. Os internos não
 * tinham nada. `content.highlight` é EXTENSÃO — existe no produto e não no
 * spec — e por isso mora em `TEMPLATE_02_EXTENSIONS`, não em
 * `TEMPLATE_02_DESIGN_TWEAKS`: desvio muda valor que o gabarito já tinha,
 * extensão acrescenta o que ele não tem.
 *
 * 🔴 O LIME SOBRE O CREME É ESCOLHA, NÃO DESCUIDO. Medido antes de decidir e
 * levado ao Rafael com os três números: lime 1.10:1, ink invertido 16.85:1,
 * cinza 3.86:1. Ele escolheu o lime pela consistência com a capa. Este arquivo
 * TRAVA essa decisão de propósito — quem "consertar" o lime achando que foi
 * esquecimento vai derrubar um teste que explica por quê.
 */

vi.mock('@/hooks/useGenerateCarouselImages', async () => {
  const real = await vi.importActual<typeof import('@/hooks/useGenerateCarouselImages')>(
    '@/hooks/useGenerateCarouselImages',
  );
  return {
    ...real,
    useGenerateCarouselImages: () => ({
      generateAll: vi.fn(), generateOne: vi.fn(), generating: false, progress: null,
    }),
    isEditorialCoverSlide: () => false,
  };
});
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import EditorSidebar from '@/components/editor/EditorSidebar';

const TITULO = 'CINCO ERROS QUE TRAVAM';

function slide(model: number, slots: Record<string, string> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: `s${model}`,
    position: model === 1 ? 0 : 1,
    templateModel: model,
    templateSlots: slots,
  } as Slide;
}

function desenha(s: Slide, slideIndex = 1) {
  const { container, unmount } = render(
    <Template02Slide
      slide={s}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={slideIndex}
      totalSlides={5}
    />,
  );
  return { container, unmount };
}

/** Os trechos marcados de um slot, na ordem. */
function marcados(s: Slide, slot: string, slideIndex = 1): string[] {
  const { container, unmount } = desenha(s, slideIndex);
  const achados = Array.from(container.querySelectorAll(`[data-slot="${slot}"]`)).map(
    (el) => el.textContent ?? '',
  );
  unmount();
  return achados;
}

/** Luminância relativa (WCAG). */
function lum(hex: string): number {
  const canal = hex
    .replace('#', '')
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canal[0] + 0.7152 * canal[1] + 0.0722 * canal[2];
}
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

afterEach(() => {
  cleanup();
  useEditorStore.setState({ slides: [], activeSlideIndex: 0 });
});

describe('o slot existe nos internos, e é extensão declarada', () => {
  it.each([2, 3])('o modelo %i tem content.highlight', (model) => {
    const slots = template02SlotsForModel(model).map((d) => d.slot);
    expect(slots).toContain('content.highlight');
  });

  it('a CAPA não ganhou o slot novo — ela já tinha o dela', () => {
    const slots = template02SlotsForModel(1).map((d) => d.slot);
    expect(slots).toContain('cover.highlight');
    expect(slots).not.toContain('content.highlight');
  });

  it('a extensão declara TUDO explicitamente, sem depender de fallback', () => {
    // O spec não conhece o slot: medido, ele devolveria limites {}, default
    // undefined e cor caindo no preto por acidente. Nada aqui pode ser acidente.
    const ext = TEMPLATE_02_EXTENSIONS.contentHighlight;
    expect(ext.slot).toBe('content.highlight');
    expect(ext.models).toEqual([2, 3]);
    expect(ext.default).toBe('');
    expect(template02Limits('content.highlight')).toEqual(ext.limits);
    expect(template02SlotColor('content.highlight', 2)).toBe(TEMPLATE_02_COLORS[ext.textColor]);
  });

  it('a extensão registra o motivo e a decisão do Rafael', () => {
    expect(TEMPLATE_02_EXTENSIONS.contentHighlight.motivo).toMatch(/Rafael/);
  });
});

describe('o render dos internos pinta o destaque no content.title', () => {
  it.each([2, 3])('modelo %i: a palavra marcada sai com o marcador', (model) => {
    const s = slide(model, { 'content.title': TITULO, 'content.highlight': 'ERROS' });
    expect(marcados(s, 'content.highlight')).toEqual(['ERROS']);
  });

  it('sem destaque, nenhum span de marcador entra no DOM', () => {
    const s = slide(2, { 'content.title': TITULO });
    expect(marcados(s, 'content.highlight')).toEqual([]);
  });

  it('o título continua inteiro, marcado ou não', () => {
    const s = slide(2, { 'content.title': TITULO, 'content.highlight': 'ERROS' });
    const { container, unmount } = desenha(s);
    expect(container.querySelector('[data-slot="content.title"]')?.textContent).toBe(TITULO);
    unmount();
  });

  it('vários termos, separados por vírgula, viram várias tarjas', () => {
    const s = slide(2, { 'content.title': TITULO, 'content.highlight': 'CINCO, TRAVAM' });
    expect(marcados(s, 'content.highlight')).toEqual(['CINCO', 'TRAVAM']);
  });

  it('termo que não está no título não pinta nada, e não quebra o slide', () => {
    const s = slide(2, { 'content.title': TITULO, 'content.highlight': 'INEXISTENTE' });
    expect(marcados(s, 'content.highlight')).toEqual([]);
    const { container, unmount } = desenha(s);
    expect(container.querySelector('[data-slot="content.title"]')?.textContent).toBe(TITULO);
    unmount();
  });

  it('a frase marcada usa boxDecorationBreak, para quebrar como marca-texto', () => {
    // Decisão do Rafael: marcar a FRASE e deixar quebrar em dois retângulos.
    // Sem `clone`, o padding só apareceria na primeira linha.
    const s = slide(2, { 'content.title': TITULO, 'content.highlight': 'ERROS QUE' });
    const { container, unmount } = desenha(s);
    const span = container.querySelector('[data-slot="content.highlight"]') as HTMLElement;
    expect(span.style.boxDecorationBreak).toBe('clone');
    unmount();
  });
});

describe('a decisão do lime, travada com os números', () => {
  it('o marcador dos internos é o MESMO lime da capa', () => {
    const s = slide(2, { 'content.title': TITULO, 'content.highlight': 'ERROS' });
    const { container, unmount } = desenha(s);
    const span = container.querySelector('[data-slot="content.highlight"]') as HTMLElement;
    expect(span.style.background).toBe('rgb(225, 255, 0)'); // #E1FF00 = accent
    unmount();
  });

  it('a TARJA é fraca sobre o creme — e isso foi aceito de olhos abertos', () => {
    // 1.10:1. Escolha informada do Rafael, com ink (16.85:1) e cinza (3.86:1)
    // na mesa. Se algum dia isto for revisto, que seja por decisão nova.
    expect(contraste(TEMPLATE_02_HIGHLIGHT_COLOR, TEMPLATE_02_COLORS.paper)).toBeLessThan(1.5);
  });

  it('a LEITURA da palavra não sofre — o texto sobre o marcador é forte', () => {
    // O ponto que atenua tudo: o que fica fraco é a percepção da tarja, não a
    // legibilidade. O texto sai com MAIS contraste que o título normal.
    const corTexto = template02HighlightTextColor(TEMPLATE_02_HIGHLIGHT_COLOR);
    const noMarcador = contraste(corTexto, TEMPLATE_02_HIGHLIGHT_COLOR);
    const tituloNormal = contraste(TEMPLATE_02_COLORS.ink, TEMPLATE_02_COLORS.paper);

    expect(noMarcador).toBeGreaterThan(15);
    expect(noMarcador).toBeGreaterThan(tituloNormal);
  });

  it('trocando a cor do marcador, o texto acompanha sozinho', () => {
    // É a saída do Rafael se o lime não agradar no ar. Com fundo escuro o texto
    // vira claro, sem ninguém precisar escolher.
    const s = slide(2, { 'content.title': TITULO, 'content.highlight': 'ERROS' });
    s.templateSlotStyles = { 'content.highlight': { background: '#000000' } };
    const { container, unmount } = desenha(s);
    const span = container.querySelector('[data-slot="content.highlight"]') as HTMLElement;
    expect(span.style.background).toBe('rgb(0, 0, 0)');
    expect(span.style.color).toBe('rgb(255, 255, 255)');
    unmount();
  });
});

describe('A CAPA NÃO REGREDIU — ela já funcionava', () => {
  const capa = (slots: Record<string, string>) => slide(1, slots);

  it('o marcador da capa continua pintando', () => {
    const s = capa({ 'cover.headline': TITULO, 'cover.highlight': 'ERROS' });
    expect(marcados(s, 'cover.highlight', 0)).toEqual(['ERROS']);
  });

  it('a capa não desenha o slot dos internos', () => {
    const s = capa({ 'cover.headline': TITULO, 'cover.highlight': 'ERROS' });
    expect(marcados(s, 'content.highlight', 0)).toEqual([]);
  });

  it('a capa sem destaque continua sem tarja', () => {
    expect(marcados(capa({ 'cover.headline': TITULO }), 'cover.highlight', 0)).toEqual([]);
  });
});

describe('a barra lateral expõe as palavras do título dos internos', () => {
  function montaBarra(active: number) {
    useEditorStore.setState({
      slides: [1, 2, 3, 2, 3].map((m, i) => ({
        ...DEFAULT_SLIDE,
        id: `s${i}`,
        position: i,
        templateModel: m,
        templateSlots: i === active ? { 'content.title': TITULO } : {},
      })) as Slide[],
      activeSlideIndex: active,
      style: 'template02',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    return render(
      <EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />,
    );
  }

  /** O painel de conteúdo do slide, aberto. */
  function abreConteudo(): HTMLElement {
    const painel = document.querySelector('[data-panel="conteudoSlide"]') as HTMLElement;
    expect(painel, 'o painel de conteúdo não está na barra').toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { expanded: false }));
    return painel;
  }

  it('num slide interno, as palavras do título viram pastilhas', () => {
    montaBarra(1);
    abreConteudo();

    const chips = screen.getByRole('group', { name: 'Palavras em destaque' });
    expect(Array.from(chips.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'CINCO', 'ERROS', 'QUE', 'TRAVAM',
    ]);
  });

  it('clicar numa palavra grava o termo em content.highlight', () => {
    montaBarra(1);
    abreConteudo();

    const chips = screen.getByRole('group', { name: 'Palavras em destaque' });
    fireEvent.click(within(chips).getByText('ERROS'));

    const ativo = useEditorStore.getState().slides[1];
    expect(ativo.templateSlots?.['content.highlight']).toBe('ERROS');
  });

  it('o seletor de cor do marcador existe nos internos', () => {
    // O argumento do Rafael para pedir a feature, e a saída dele se o lime não
    // agradar. Sem isto a tarefa não atende ao que ele pediu.
    // Ele mora no painel de ESTILO do texto, não no de conteúdo — é lá que o
    // ramo `isHighlight` desenha a cor e a fonte do marcador.
    montaBarra(1);
    const painel = document.querySelector('[data-panel="estiloDoTexto"]') as HTMLElement;
    expect(painel, 'o painel de estilo não está na barra').toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { expanded: false }));

    expect(within(painel).getByText('Cor do marcador')).toBeTruthy();
    // E o rótulo do slot aparece, para a pessoa saber a que campo ele pertence.
    expect(within(painel).getAllByText('Destaque').length).toBeGreaterThan(0);
  });
});

describe('ida e volta, e carrossel antigo', () => {
  it('salvar e reabrir preserva o destaque dos internos', () => {
    const s = slide(2, { 'content.title': TITULO, 'content.highlight': 'ERROS' });
    const devolta = mapDbSlideToSlide({ ...mapSlideToDbRow(s, 'c1', 1), id: 's2' });

    expect(devolta.templateSlots?.['content.highlight']).toBe('ERROS');
    expect(marcados(devolta, 'content.highlight')).toEqual(['ERROS']);
  });

  it('Radar salvo ANTES desta feature abre igual, sem marcador', () => {
    // Nenhum carrossel existente tem `content.highlight`. O slide tem de abrir
    // exatamente como abria, e não com um span vazio ou um default de fábrica.
    const antigo = slide(2, { 'content.title': TITULO, 'content.body': 'corpo' });
    const devolta = mapDbSlideToSlide({ ...mapSlideToDbRow(antigo, 'c1', 1), id: 's2' });

    expect(devolta.templateSlots?.['content.highlight']).toBeUndefined();
    expect(marcados(devolta, 'content.highlight')).toEqual([]);
    const { container, unmount } = desenha(devolta);
    expect(container.querySelector('[data-slot="content.title"]')?.textContent).toBe(TITULO);
    unmount();
  });
});
