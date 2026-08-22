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
 * COR DE FUNDO DO SLIDE no TEMPLATE 1 — pedido do Rafael (decisão final).
 *
 * No T1 o "Fundo do slide" grava `backgroundColor` + marca `background` (fundo
 * CHAPADO, igual aos outros templates). Por cima dele o T1 traz um DEGRADÊ
 * PRETO de legibilidade, FIXO e INQUEBRÁVEL — sempre presente, sempre preto,
 * independente da cor escolhida no fundo ou do que o usuário mexe no painel
 * "Sombra / Overlay".
 *
 * O que estes testes travam:
 *   1. sem a MARCA, o fundo é o do spec — é isso que faz o carrossel recém
 *      gerado nascer idêntico ao gabarito;
 *   2. ao mexer no "Fundo do slide" do T1, a cor vira o FUNDO (chapado) e NÃO
 *      substitui o degradê preto de legibilidade, que continua presente por cima;
 *   3. a marca é `background`, nunca `shadow`;
 *   4. o degradê de legibilidade (rgba(0,0,0,...)) aparece SEMPRE — com ou sem
 *      a marca de fundo, e não importa a cor escolhida;
 *   5. restaurar apaga a marca e o spec volta a mandar.
 *
 * Os modelos 1 e 2 têm DEGRADÊ no desenho do spec: mesmo neles, ao escolher uma
 * cor o fundo vira chapado e o degradê PRETO de legibilidade é composto por cima.
 */

vi.mock('@/hooks/useGenerateCarouselImages', async () => {
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

const VERMELHO = '#F41515';
const VERDE = '#12B76A';
const MODELO_AZUL = 6;
const AZUL_DO_SPEC = '#0D39E4';
/** Os únicos dois modelos com degradê no desenho do spec. */
const MODELOS_DEGRADE = [1, 2];
/** rgb do preto, para conferir o overlay de legibilidade. */
const PRETO_RGB = 'rgba(0,0,0';

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

/** O `background` inline do slide renderizado (raiz). */
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

/** O HTML completo do slide — pega também o overlay de legibilidade (div filha). */
function htmlCompleto(slide: Slide): string {
  return renderToStaticMarkup(
    <Template01Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={slide.position}
      totalSlides={TEMPLATE_01_MODELS.length}
    />
  );
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
  fireEvent.click(within(painel).getByRole('button', { name: /abrir seletor de cor/i }));
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
    const slide = slideDoModelo(MODELO_AZUL, { backgroundColor: VERMELHO });
    expect(fundoRenderizado(slide)).toBe(AZUL_DO_SPEC);
  });

  it.each(MODELOS_DEGRADE)('o modelo %i é degradê, não cor chapada', (model) => {
    const bg = template01SpecBackground(model);
    expect(bg.solid).toBeUndefined();
    expect(bg.css).toContain('linear-gradient');
    expect(bg.swatch).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it.each(TEMPLATE_01_MODELS)('o degradê de legibilidade PRETO está presente no modelo %i sem marca', (model) => {
    expect(htmlCompleto(slideDoModelo(model))).toContain(PRETO_RGB);
  });
});

describe('no T1 a cor do Fundo do slide vira o FUNDO (chapado) + degradê preto por cima', () => {
  it.each(TEMPLATE_01_MODELS)('modelo %i: fundo vira a cor escolhida e o degradê preto continua', (model) => {
    montaDeck(model - 1);
    const fundo = abrePainel('fundoDoSlide');
    fireEvent.change(campoHex(fundo), { target: { value: VERMELHO } });

    // Marca `background`, nunca `shadow`.
    expect(ativo().templateOverrides?.background).toBe(true);
    expect(ativo().templateOverrides?.shadow).toBeFalsy();
    expect(ativo().backgroundColor).toBe(VERMELHO);

    const html = htmlCompleto(ativo());
    // O fundo (raiz) virou a cor escolhida, chapada.
    expect(fundoRenderizado(ativo())).toBe(VERMELHO);
    // O degradê PRETO de legibilidade continua por cima — não virou a cor.
    expect(html).toContain(PRETO_RGB);
    // A cor escolhida NUNCA aparece como overlay rgba (só no fundo chapado).
    expect(html).not.toContain('rgba(244,21,21');
  });

  it('modelo de degradê do spec (1): ao escolher cor, o fundo do spec some e entra o chapado', () => {
    montaDeck(0); // modelo 1
    const fundo = abrePainel('fundoDoSlide');
    fireEvent.change(campoHex(fundo), { target: { value: VERMELHO } });
    // O fundo (raiz) é a cor escolhida, não o degradê do spec.
    expect(fundoRenderizado(ativo())).toBe(VERMELHO);
    // Mas o degradê de legibilidade preto persiste.
    expect(htmlCompleto(ativo())).toContain(PRETO_RGB);
  });

  it('render direto: escolher vermelho deixa fundo vermelho + overlay preto', () => {
    const slide = slideDoModelo(MODELO_AZUL, {
      backgroundColor: VERMELHO,
      templateOverrides: { background: true },
    });
    expect(fundoRenderizado(slide)).toBe(VERMELHO);
    const html = htmlCompleto(slide);
    expect(html).toContain(PRETO_RGB);
    expect(html).not.toContain('rgba(244,21,21');
  });
});

describe('o degradê de legibilidade é INQUEBRÁVEL', () => {
  it('aparece sempre, com ou sem marca de fundo', () => {
    // Sem marca nenhuma.
    expect(htmlCompleto(slideDoModelo(3))).toContain(PRETO_RGB);
    // Com marca de fundo de uma cor qualquer.
    const marcado = slideDoModelo(3, {
      backgroundColor: VERDE,
      templateOverrides: { background: true },
    });
    expect(htmlCompleto(marcado)).toContain(PRETO_RGB);
  });

  it('a cor do overlay é SEMPRE preta, ignorando slide.shadow.color', () => {
    // Se alguém gravou uma cor de sombra (ex.: via API/legacy), o T1 ainda
    // renderiza o overlay PRETO, nunca essa cor.
    const comCorEstranha = slideDoModelo(3, {
      shadow: { ...DEFAULT_SLIDE.shadow, color: VERMELHO },
      templateOverrides: { shadow: true },
    });
    const html = htmlCompleto(comCorEstranha);
    expect(html).toContain(PRETO_RGB);
    expect(html).not.toContain('rgba(244,21,21');
  });
});

describe('restaurar volta ao spec', () => {
  it('sem a marca o fundo é o do desenho de novo', () => {
    const escolhido = slideDoModelo(MODELO_AZUL, {
      backgroundColor: VERMELHO,
      templateOverrides: { background: true },
    });
    expect(fundoRenderizado(escolhido)).toBe(VERMELHO);

    // Restaurar apaga a MARCA; `backgroundColor` pode continuar gravado.
    const restaurado = { ...escolhido, templateOverrides: undefined } as Slide;
    expect(fundoRenderizado(restaurado)).toBe(AZUL_DO_SPEC);
  });

  it('o botão da barra lateral conta a alteração (background) e a desfaz', () => {
    montaDeck(MODELO_AZUL - 1);

    const fundo = abrePainel('fundoDoSlide');
    fireEvent.change(campoHex(fundo), { target: { value: VERMELHO } });
    expect(ativo().templateOverrides?.background).toBe(true);

    const restaurar = document.querySelector('[data-panel="restaurarTemplate"]') as HTMLElement;
    expect(within(restaurar).getByText('1')).toBeTruthy();

    fireEvent.click(within(restaurar).getByRole('button', { expanded: false }));
    fireEvent.click(within(restaurar).getByText('Restaurar'));

    expect(ativo().templateOverrides).toBeUndefined();
    expect(fundoRenderizado(ativo())).toBe(AZUL_DO_SPEC);
  });
});

describe('o painel na barra lateral', () => {
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

  it('abre na cor de fundo quando ela já foi escolhida', () => {
    montaDeck(MODELO_AZUL - 1, {
      backgroundColor: VERMELHO,
      templateOverrides: { background: true },
    });
    expect(campoHex(abrePainel('fundoDoSlide')).value).toBe(VERMELHO);
  });

  it('escrever a cor grava no backgroundColor E marca background', () => {
    montaDeck(MODELO_AZUL - 1);
    fireEvent.change(campoHex(abrePainel('fundoDoSlide')), { target: { value: VERMELHO } });

    expect(ativo().backgroundColor).toBe(VERMELHO);
    expect(ativo().templateOverrides?.background).toBe(true);
    expect(ativo().templateOverrides?.shadow).toBeFalsy();
  });

  it('vem entre "Estilo do texto" e "Restaurar", que continua o último', () => {
    montaDeck(MODELO_AZUL - 1);
    const ids = Array.from(document.querySelectorAll('[data-panel]')).map((el) =>
      el.getAttribute('data-panel')
    );
    expect(ids.indexOf('fundoDoSlide')).toBeGreaterThan(ids.indexOf('estiloDoTexto'));
    expect(ids.indexOf('fundoDoSlide')).toBeLessThan(ids.indexOf('restaurarTemplate'));
    expect(ids.indexOf('cantos')).toBeLessThan(ids.indexOf('restaurarTemplate'));
    expect(ids.at(-1)).toBe('restaurarTemplate');
  });

  it('mostra SÓ a cor: nada de upload nem de IA', () => {
    montaDeck(MODELO_AZUL - 1);
    const painel = abrePainel('fundoDoSlide');
    expect(within(painel).queryByText(/arraste/i)).toBeNull();
    expect(within(painel).queryByText(/IA/)).toBeNull();
    expect(within(painel).getByTestId('cromia-swatch')).toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { name: /abrir seletor de cor/i }));
    expect(within(painel).getAllByRole('slider')).toHaveLength(2);
    expect(within(painel).getByRole('slider', { name: /saturação/i })).toBeTruthy();
    expect(within(painel).getByRole('slider', { name: /matiz/i })).toBeTruthy();
  });

  it('o rótulo "Fundo do slide" aparece uma vez só', () => {
    montaDeck(MODELO_AZUL - 1);
    expect(screen.getAllByText('Fundo do slide')).toHaveLength(1);
  });

  it.each(TEMPLATE_01_MODELS)('não mostra explicação sobre degradê no modelo %i', (model) => {
    montaDeck(model - 1);
    expect(within(abrePainel('fundoDoSlide')).queryByText(/degradê/)).toBeNull();
  });

  it('o painel "Sombra / Overlay" trava a cor em preto e não tem liga/desliga no T1', () => {
    montaDeck(MODELO_AZUL - 1);
    const painel = abrePainel('sombraOverlay');
    // Sem toggle de "Exibir sombra" (sempre ligado).
    expect(within(painel).queryByText('Exibir sombra')).toBeNull();
    // A cor aparece travada em preto, sem picker.
    expect(within(painel).getByText('preto fixo (legibilidade)')).toBeTruthy();
    // Sliders de opacidade/tamanho/distância continuam disponíveis.
    expect(within(painel).getByText('Opacidade')).toBeTruthy();
    expect(within(painel).getByText('Tamanho')).toBeTruthy();
    expect(within(painel).getByText('Distância')).toBeTruthy();
  });
});
