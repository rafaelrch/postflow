// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';
import {
  TEMPLATE_01_MODELS,
  TEMPLATE_01_SCRIM_SLIDES,
  template01SpecBackground,
} from '@/lib/templates/template-01';
import Template01Slide from '@/components/slides/Template01Slide';
import {
  PANEL_REGISTRY,
  TEMPLATE_SIDEBAR_CONFIG,
  visiblePanels,
  type PanelContext,
} from '@/components/editor/sidebar/panels';

/**
 * COR DE FUNDO DO SLIDE no TEMPLATE 1 — pedido do Rafael (decisão final).
 *
 * No T1 o "Fundo do slide" grava `backgroundColor` + marca `background` (fundo
 * CHAPADO, igual aos outros templates). Por cima dele os MODELOS 1 E 2 trazem um
 * DEGRADÊ PRETO de legibilidade — e SÓ eles.
 *
 * 🔴 O véu vale apenas nos modelos de `TEMPLATE_01_SCRIM_SLIDES` ([1, 2]) —
 * decisão do Rafael em 31/08/2026. Os modelos 1 e 2 são os que têm foto no
 * desenho do spec, e o véu é o que segura o texto legível sobre a imagem. Do 3
 * em diante o fundo é chapado e o véu só sujava (nos modelos 4 e 5, de fundo
 * branco, virava uma faixa preta em degradê embaixo).
 *
 * NOS MODELOS 1 E 2 o véu continua FIXO e INQUEBRÁVEL: sempre presente, sempre
 * preto, independente da cor escolhida no fundo ou de um `slide.shadow` gravado.
 *
 * O painel "Sombra / Overlay" NÃO existe mais na barra do T1 (pedido do Rafael):
 * não há o que ajustar num véu que é fixo. Saiu só a EDIÇÃO — os outros estilos
 * continuam com o painel.
 *
 * O que estes testes travam:
 *   1. sem a MARCA, o fundo é o do spec — é isso que faz o carrossel recém
 *      gerado nascer idêntico ao gabarito;
 *   2. ao mexer no "Fundo do slide" do T1, a cor vira o FUNDO (chapado) e NÃO
 *      substitui o degradê preto de legibilidade, que continua presente por cima;
 *   3. a marca é `background`, nunca `shadow`;
 *   4. o véu de legibilidade (rgba(0,0,0,...)) aparece nos modelos 1 e 2 SEMPRE
 *      — com ou sem a marca de fundo, e não importa a cor escolhida — e NUNCA
 *      nos modelos 3 a 6, cujo fundo chapado do spec fica limpo;
 *   5. restaurar apaga a marca e o spec volta a mandar;
 *   6. a barra do T1 NÃO tem painel "Sombra / Overlay" — nem o rótulo na tela,
 *      nem o id nos `visiblePanels`.
 *
 * A ausência do véu é medida na CAMADA (o div `inset:0` com o gradiente preto,
 * ver `camadasDeVeu`), nunca por grep de `rgba(0,0,0` no HTML: texto, SVG e
 * cantos são legitimamente pretos e acusariam véu onde não há.
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

/** Os modelos que NÃO levam véu — o complemento de TEMPLATE_01_SCRIM_SLIDES. */
const MODELOS_SEM_VEU = TEMPLATE_01_MODELS.filter((m) => !TEMPLATE_01_SCRIM_SLIDES.includes(m));

/**
 * As camadas do VÉU de legibilidade do slide renderizado.
 *
 * 🔴 Mede a CAMADA, não um grep de `rgba(0,0,0` no HTML inteiro: texto, SVG e
 * cantos podem legitimamente ser pretos, e um grep solto acusaria véu onde não
 * há. O véu é filho DIRETO da raiz `.t01-slide`, `position:absolute; inset:0`,
 * pintado com um `linear-gradient` preto. (O jsdom normaliza para
 * `rgba(0, 0, 0, …)`, com espaços — daí a regex.)
 */
function camadasDeVeu(slide: Slide): string[] {
  const { container } = render(
    <Template01Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={slide.position}
      totalSlides={TEMPLATE_01_MODELS.length}
    />
  );
  const raiz = container.querySelector('.t01-slide') as HTMLElement;
  expect(raiz, 'a raiz .t01-slide não renderizou').toBeTruthy();
  return Array.from(raiz.children)
    .map((el) => el.getAttribute('style') ?? '')
    .filter(
      (st) =>
        /position:\s*absolute/.test(st) &&
        /inset:\s*0px/.test(st) &&
        /background:\s*linear-gradient\([^;]*rgba\(0,\s*0,\s*0/.test(st)
    );
}

/** O slide renderizado tem véu de legibilidade? */
const temVeu = (slide: Slide) => camadasDeVeu(slide).length > 0;

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

  it.each(TEMPLATE_01_SCRIM_SLIDES)('o véu PRETO de legibilidade está presente no modelo %i sem marca', (model) => {
    expect(camadasDeVeu(slideDoModelo(model))).toHaveLength(1);
  });

  it.each(MODELOS_SEM_VEU)('o modelo %i NÃO tem véu nenhum — o fundo chapado do spec fica limpo', (model) => {
    expect(camadasDeVeu(slideDoModelo(model))).toHaveLength(0);
  });
});

describe('no T1 a cor do Fundo do slide vira o FUNDO (chapado) + degradê preto por cima', () => {
  it.each(TEMPLATE_01_MODELS)('modelo %i: fundo vira a cor escolhida, e o véu segue a regra do modelo', (model) => {
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
    // Escolher cor NÃO cria nem apaga véu: quem manda é o modelo.
    expect(camadasDeVeu(ativo())).toHaveLength(
      TEMPLATE_01_SCRIM_SLIDES.includes(model) ? 1 : 0
    );
    // A cor escolhida NUNCA aparece como overlay rgba (só no fundo chapado).
    expect(html).not.toContain('rgba(244,21,21');
  });

  it('modelo de degradê do spec (1): ao escolher cor, o fundo do spec some e entra o chapado', () => {
    montaDeck(0); // modelo 1
    const fundo = abrePainel('fundoDoSlide');
    fireEvent.change(campoHex(fundo), { target: { value: VERMELHO } });
    // O fundo (raiz) é a cor escolhida, não o degradê do spec.
    expect(fundoRenderizado(ativo())).toBe(VERMELHO);
    // Mas o véu de legibilidade preto persiste — o modelo 1 é um dos dois que o levam.
    expect(camadasDeVeu(ativo())).toHaveLength(1);
  });

  it('render direto no modelo 6: fundo vermelho e NENHUM véu por cima', () => {
    const slide = slideDoModelo(MODELO_AZUL, {
      backgroundColor: VERMELHO,
      templateOverrides: { background: true },
    });
    expect(fundoRenderizado(slide)).toBe(VERMELHO);
    expect(camadasDeVeu(slide)).toHaveLength(0);
    expect(htmlCompleto(slide)).not.toContain('rgba(244,21,21');
  });

  it('render direto no modelo 2: fundo vermelho + véu preto por cima', () => {
    const slide = slideDoModelo(2, {
      backgroundColor: VERMELHO,
      templateOverrides: { background: true },
    });
    expect(fundoRenderizado(slide)).toBe(VERMELHO);
    expect(camadasDeVeu(slide)).toHaveLength(1);
    expect(htmlCompleto(slide)).not.toContain('rgba(244,21,21');
  });
});

describe('nos modelos 1 e 2 o véu é INQUEBRÁVEL', () => {
  it.each(TEMPLATE_01_SCRIM_SLIDES)('modelo %i: aparece com ou sem marca de fundo', (model) => {
    // Sem marca nenhuma.
    expect(camadasDeVeu(slideDoModelo(model))).toHaveLength(1);
    // Com marca de fundo de uma cor qualquer.
    const marcado = slideDoModelo(model, {
      backgroundColor: VERDE,
      templateOverrides: { background: true },
    });
    expect(camadasDeVeu(marcado)).toHaveLength(1);
  });

  it.each(TEMPLATE_01_SCRIM_SLIDES)(
    'modelo %i: a cor do véu é SEMPRE preta, ignorando slide.shadow.color',
    (model) => {
      // Se alguém gravou uma cor de sombra (ex.: via API/legacy), o T1 ainda
      // renderiza o véu PRETO, nunca essa cor.
      const comCorEstranha = slideDoModelo(model, {
        shadow: { ...DEFAULT_SLIDE.shadow, color: VERMELHO },
        templateOverrides: { shadow: true },
      });
      expect(camadasDeVeu(comCorEstranha)).toHaveLength(1);
      expect(htmlCompleto(comCorEstranha)).not.toContain('rgba(244,21,21');
    }
  );
});

describe('do modelo 3 em diante NÃO há véu — nem com marca, nem com shadow gravado', () => {
  it.each(MODELOS_SEM_VEU)('modelo %i: marca de fundo não ressuscita o véu', (model) => {
    expect(camadasDeVeu(slideDoModelo(model))).toHaveLength(0);
    const marcado = slideDoModelo(model, {
      backgroundColor: VERDE,
      templateOverrides: { background: true },
    });
    expect(camadasDeVeu(marcado)).toHaveLength(0);
  });

  it.each(MODELOS_SEM_VEU)('modelo %i: nem um slide.shadow gravado ressuscita o véu', (model) => {
    const comSombra = slideDoModelo(model, {
      shadow: { ...DEFAULT_SLIDE.shadow, color: VERMELHO },
      templateOverrides: { shadow: true },
    });
    expect(camadasDeVeu(comSombra)).toHaveLength(0);
  });

  it('o gate é o MODELO, não a posição: modelo 6 na posição 0 continua sem véu', () => {
    // Deck reordenado / com modelo repetido não pode enganar o gate.
    const slide = { ...slideDoModelo(6), position: 0 } as Slide;
    expect(camadasDeVeu(slide)).toHaveLength(0);
  });

  it('o gate é o MODELO, não a posição: modelo 2 na posição 5 continua COM véu', () => {
    const slide = { ...slideDoModelo(2), position: 5 } as Slide;
    expect(camadasDeVeu(slide)).toHaveLength(1);
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

  it.each(TEMPLATE_01_MODELS)('o painel "Sombra / Overlay" NÃO aparece na barra do T1 (modelo %i)', (model) => {
    montaDeck(model - 1);
    // Só a EDIÇÃO sai: o degradê preto de legibilidade continua renderizando
    // (os testes de render acima seguem provando isso).
    expect(screen.queryByText('Sombra / Overlay')).toBeNull();
    expect(document.querySelector('[data-panel="sombraOverlay"]')).toBeNull();
  });

  it('o id sombraOverlay não está mais nos visiblePanels do T1 — mas continua nos outros estilos', () => {
    montaDeck(MODELO_AZUL - 1);
    const ctx: PanelContext = {
      style: 'template01',
      slide: ativo(),
      activeSlideIndex: useEditorStore.getState().activeSlideIndex,
      globalSettings: useEditorStore.getState().globalSettings,
      template01Model: ativo().templateModel ?? null,
      template02Model: null,
      isEditorialCover: false,
    };
    expect(visiblePanels(ctx).flatMap((g) => g.ids)).not.toContain('sombraOverlay');

    // O PanelId e o registro em PANEL_REGISTRY ficam de pé: T3, editorial e
    // minimalist ainda editam o overlay. (O T2 nunca teve esse painel.)
    expect(PANEL_REGISTRY.sombraOverlay).toBeTruthy();
    for (const estilo of ['template03', 'editorial', 'minimalist'] as const) {
      const ids = TEMPLATE_SIDEBAR_CONFIG[estilo].flatMap((g) =>
        g.panels.map((p) => (typeof p === 'string' ? p : p.id))
      );
      expect(ids, `${estilo} perdeu o painel do overlay`).toContain('sombraOverlay');
    }
  });
});
