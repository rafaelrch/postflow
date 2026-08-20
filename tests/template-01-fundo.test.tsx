// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';
import {
  TEMPLATE_01_MODELS,
  template01SpecBackground,
} from '@/lib/templates/template-01';
import Template01Slide from '@/components/slides/Template01Slide';

/**
 * COR DE FUNDO DO SLIDE no TEMPLATE 1 — pedido do Rafael.
 *
 * O caminho de dados já existia inteiro (`Template01SlideControl.background`,
 * `template01Overrides`, `slideBackground`); faltava a UI. O que estes testes
 * travam é a REGRA, não a tela:
 *
 *   1. sem a MARCA, o fundo é o do spec — é isso que faz o carrossel recém
 *      gerado nascer idêntico ao gabarito, e é o que quebra se alguém voltar a
 *      inferir override por comparação de valor;
 *   2. com a marca, vale a cor escolhida;
 *   3. restaurar apaga a marca e o spec volta a mandar;
 *   4. o painel só grava com a marca junto — sem ela a cor não apareceria e o
 *      controle pareceria quebrado.
 *
 * Os modelos 1 e 2 têm DEGRADÊ no desenho: escolher uma cor ali substitui o
 * degradê inteiro por chapado. Não é bloqueado (o Rafael pediu liberdade), mas a
 * UI tem de avisar — e isso também está travado aqui.
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

const VERDE = '#12B76A';
const MODELO_AZUL = 6;
const AZUL_DO_SPEC = '#0D39E4';
/** Os únicos dois modelos com degradê no desenho. */
const MODELOS_DEGRADE = [1, 2];

/** Um slide de template01 sem imagem — o fundo tem de vir do spec, não da foto. */
function slideDoModelo(model: number, extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: `s${model}`,
    position: model - 1,
    templateModel: model,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    ...extra,
  } as Slide;
}

/** O `background` inline do slide renderizado. */
function fundoRenderizado(slide: Slide): string {
  const html = renderToStaticMarkup(
    <Template01Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={slide.position}
      totalSlides={TEMPLATE_01_MODELS.length}
    />
  );
  const raiz = html.slice(0, html.indexOf('>'));
  const m = /style="([^"]*)"/.exec(raiz);
  const decl = (m?.[1] ?? '')
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('background:'));
  return (decl ?? '').slice('background:'.length).trim().replace(/&#x27;|&quot;/g, '');
}

/** Deck de 6 slides, um por modelo, com o `active` selecionado. */
function montaDeck(active: number, slideExtra: Partial<Slide> = {}) {
  const slides = TEMPLATE_01_MODELS.map((m, i) =>
    slideDoModelo(m, i === active ? slideExtra : {})
  );

  useEditorStore.setState({
    slides,
    activeSlideIndex: active,
    style: 'template01',
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });

  return render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
}

/** Abre um painel pelo id e devolve o bloco dele. */
function abrePainel(id: string): HTMLElement {
  const painel = document.querySelector(`[data-panel="${id}"]`) as HTMLElement;
  expect(painel, `painel ${id} não está na barra`).toBeTruthy();
  const botao = within(painel).getByRole('button', { expanded: false });
  fireEvent.click(botao);
  return painel;
}

/** O campo hexadecimal do `ColorPicker` dentro de um painel. */
function campoHex(painel: HTMLElement): HTMLInputElement {
  return within(painel).getByPlaceholderText('#000000') as HTMLInputElement;
}

const ativo = () => useEditorStore.getState().slides[useEditorStore.getState().activeSlideIndex];

beforeEach(() => {
  useEditorStore.setState({ slides: [], activeSlideIndex: 0, style: 'template01' });
});
afterEach(cleanup);

describe('sem a marca, o fundo é o do spec', () => {
  it.each(TEMPLATE_01_MODELS)('modelo %i nasce com o fundo do desenho', (model) => {
    expect(fundoRenderizado(slideDoModelo(model))).toBe(template01SpecBackground(model).css);
  });

  it('o modelo 6 é o azul do Figma', () => {
    expect(template01SpecBackground(MODELO_AZUL).css).toBe(AZUL_DO_SPEC);
    expect(template01SpecBackground(MODELO_AZUL).solid).toBe(AZUL_DO_SPEC);
  });

  it('cor gravada SEM a marca não pinta nada — é o que segura o carrossel gerado', () => {
    // A geração grava `backgroundColor` da marca do usuário em todo slide. Se o
    // override voltasse a ser inferido por valor, isso pintaria chapado por cima
    // do degradê do Figma — foi exatamente o defeito de antes.
    const slide = slideDoModelo(MODELO_AZUL, { backgroundColor: VERDE });
    expect(fundoRenderizado(slide)).toBe(AZUL_DO_SPEC);
  });

  it.each(MODELOS_DEGRADE)('o modelo %i é degradê, não cor chapada', (model) => {
    const bg = template01SpecBackground(model);
    expect(bg.solid).toBeUndefined();
    expect(bg.css).toContain('linear-gradient');
    // O seletor precisa de um `#RRGGBB` para abrir: a primeira parada do degradê.
    expect(bg.swatch).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('com a marca, a cor escolhida manda', () => {
  it.each(TEMPLATE_01_MODELS)('modelo %i pinta a cor do usuário', (model) => {
    const slide = slideDoModelo(model, {
      backgroundColor: VERDE,
      templateOverrides: { background: true },
    });
    expect(fundoRenderizado(slide)).toBe(VERDE);
  });

  it('nos modelos de degradê a cor SUBSTITUI o degradê inteiro', () => {
    for (const model of MODELOS_DEGRADE) {
      const slide = slideDoModelo(model, {
        backgroundColor: VERDE,
        templateOverrides: { background: true },
      });
      expect(fundoRenderizado(slide)).not.toContain('gradient');
    }
  });
});

describe('restaurar volta ao spec', () => {
  it('sem a marca o fundo é o do desenho de novo', () => {
    const escolhido = slideDoModelo(MODELO_AZUL, {
      backgroundColor: VERDE,
      templateOverrides: { background: true },
    });
    expect(fundoRenderizado(escolhido)).toBe(VERDE);

    // Restaurar apaga a MARCA; `backgroundColor` pode continuar gravado.
    const restaurado = { ...escolhido, templateOverrides: undefined } as Slide;
    expect(fundoRenderizado(restaurado)).toBe(AZUL_DO_SPEC);
  });

  it('o botão da barra lateral conta a alteração e a desfaz', () => {
    montaDeck(MODELO_AZUL - 1);

    const fundo = abrePainel('fundoDoSlide');
    fireEvent.change(campoHex(fundo), { target: { value: VERDE } });
    expect(ativo().templateOverrides?.background).toBe(true);

    // O badge do painel de restaurar conta as chaves de `templateOverrides`.
    const restaurar = document.querySelector('[data-panel="restaurarTemplate"]') as HTMLElement;
    expect(within(restaurar).getByText('1')).toBeTruthy();

    fireEvent.click(within(restaurar).getByRole('button', { expanded: false }));
    fireEvent.click(within(restaurar).getByText('Restaurar'));

    expect(ativo().templateOverrides).toBeUndefined();
    expect(fundoRenderizado(ativo())).toBe(AZUL_DO_SPEC);
  });
});

describe('o painel na barra lateral', () => {
  // O TEXTO do canto vale para o deck inteiro (é a assinatura do carrossel);
  // cor e visibilidade continuam por slide. Pedido do Rafael.
  it('propaga o texto do canto ao deck e desliga só no slide selecionado', () => {
    montaDeck(1);
    const painel = abrePainel('cantos');
    expect(within(painel).getByText('Exibir cantos')).toBeTruthy();
    expect(within(painel).getByText('Cor')).toBeTruthy();
    expect(within(painel).getByText('Fonte')).toBeTruthy();
    expect(within(painel).getByText('Tamanho fonte')).toBeTruthy();
    expect(within(painel).getByText('Margem')).toBeTruthy();

    const textos = within(painel).getAllByRole('textbox');
    expect((textos[0] as HTMLInputElement).value).toBe('LOREM IPSUM');
    expect((textos[1] as HTMLInputElement).value).toBe('@LOREMIPSUM');
    fireEvent.change(textos[0], { target: { value: 'CREATOOLS' } });

    let slides = useEditorStore.getState().slides;
    for (const s of slides) {
      expect(s.templateSlots?.['cantos.left']).toBe('CREATOOLS');
    }

    fireEvent.click(within(painel).getByRole('switch'));
    slides = useEditorStore.getState().slides;
    expect(slides[1].templateSlotStyles?.['cantos.left']?.visible).toBe(false);
    expect(slides[1].templateSlotStyles?.['cantos.right']?.visible).toBe(false);
    expect(slides[0].templateSlotStyles).toBeUndefined();
  });

  it('tamanho e margem dos cantos valem para o carrossel inteiro', () => {
    montaDeck(1);
    const painel = abrePainel('cantos');
    const sliders = within(painel).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '28' } });
    fireEvent.change(sliders[1], { target: { value: '24' } });

    const state = useEditorStore.getState();
    expect(state.globalSettings.templateCornerStyle).toMatchObject({ fontSize: 28, margin: 24 });
    expect(state.slides.every((slide) => slide.templateSlotStyles == null)).toBe(true);
  });

  it('abre mostrando o hex do spec daquele slide', () => {
    montaDeck(MODELO_AZUL - 1);
    expect(campoHex(abrePainel('fundoDoSlide')).value).toBe(AZUL_DO_SPEC);
  });

  it('escrever a cor grava o valor E a marca — sem a marca o spec venceria', () => {
    montaDeck(MODELO_AZUL - 1);
    fireEvent.change(campoHex(abrePainel('fundoDoSlide')), { target: { value: VERDE } });

    expect(ativo().backgroundColor).toBe(VERDE);
    expect(ativo().templateOverrides?.background).toBe(true);
  });

  it('vem entre "Estilo do texto" e "Restaurar", que continua o último', () => {
    montaDeck(MODELO_AZUL - 1);
    const ids = Array.from(document.querySelectorAll('[data-panel]')).map((el) =>
      el.getAttribute('data-panel')
    );
    expect(ids.indexOf('fundoDoSlide')).toBeGreaterThan(ids.indexOf('estiloDoTexto'));
    expect(ids.indexOf('fundoDoSlide')).toBeLessThan(ids.indexOf('restaurarTemplate'));
    // Os cantos agora pertencem ao slide selecionado e o restaurar fecha tudo.
    expect(ids.indexOf('cantos')).toBeLessThan(ids.indexOf('restaurarTemplate'));
    expect(ids.at(-1)).toBe('restaurarTemplate');
  });

  it('mostra SÓ a cor: nada de upload nem de IA', () => {
    montaDeck(MODELO_AZUL - 1);
    const painel = abrePainel('fundoDoSlide');
    expect(within(painel).queryByText(/arraste/i)).toBeNull();
    expect(within(painel).queryByText(/IA/)).toBeNull();
    expect(within(painel).queryAllByRole('slider')).toHaveLength(0);
  });

  it('o rótulo "Fundo do slide" aparece uma vez só', () => {
    montaDeck(MODELO_AZUL - 1);
    expect(screen.getAllByText('Fundo do slide')).toHaveLength(1);
  });

  it.each(MODELOS_DEGRADE)('não mostra explicação sobre degradê no modelo %i', (model) => {
    montaDeck(model - 1);
    expect(within(abrePainel('fundoDoSlide')).queryByText(/degradê/)).toBeNull();
  });

  it('não avisa de degradê em slide de cor chapada', () => {
    montaDeck(MODELO_AZUL - 1);
    expect(within(abrePainel('fundoDoSlide')).queryByText(/degradê/)).toBeNull();
  });
});
