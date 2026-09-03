// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide, type SlideStyle } from '@/types';
import { TEMPLATE_01_MODELS } from '@/lib/templates/template-01';
import { TEMPLATE_03_MODEL_COVER, TEMPLATE_03_MODEL_STEP } from '@/lib/templates/template-03';
import Template01Slide from '@/components/slides/Template01Slide';
import Template02Slide from '@/components/slides/Template02Slide';
import Template03Slide from '@/components/slides/Template03Slide';

/**
 * ABA CANTOS — cada canto liga e desliga SOZINHO.
 *
 * Relato do Rafael (02/09/2026): "quando eu desativo o lado esquerdo ou
 * direito, ele desativa a aba inteira, o canto inteiro. O switch de
 * ativar/desativar não tem nada a ver com o check de cada canto."
 *
 * A CAUSA não estava no CornersPanel nem no render — os dois já eram
 * independentes por slot. Estava no MESTRE calculado em EditorSidebar.tsx: ele
 * era um `every` sobre os slots ("todos os cantos visíveis"), e o corpo do
 * painel só é desenhado quando o mestre está ligado (`{show && …}` no
 * CornersPanel). Então desmarcar UM canto derrubava o mestre e o painel INTEIRO
 * fechava junto — inclusive a linha do canto que continuava visível.
 *
 * Pior que o susto: o estado "esquerdo desligado, direito ligado" ficava
 * INALCANÇÁVEL. Com o painel fechado, a única forma de reabrir era o switch
 * mestre, e ele escreve em TODOS os slots — ressuscitando no render o canto que
 * a pessoa tinha acabado de desligar. Por isso o teste do round trip abaixo
 * mede o RENDER, e não só o estado: era ali que a escolha do usuário sumia.
 *
 * Os dois níveis continuam existindo e são testados separadamente:
 *   - o CHECKBOX de cada linha mexe só no seu canto;
 *   - o SWITCH "Exibir cantos" derruba (e devolve) os dois de uma vez.
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

/**
 * Os três templates que têm a aba Cantos, cada um com os seus dois slots e o
 * componente que desenha o slide. O bug foi procurado nos TRÊS de propósito: o
 * Rafael não disse em qual tinha visto.
 */
const TEMPLATES = [
  {
    nome: 'Manifesto (template01)',
    style: 'template01' as SlideStyle,
    painelId: 'cantos',
    esquerdo: 'cantos.left',
    direito: 'cantos.right',
    ativo: 1,
    deck: (): Slide[] =>
      TEMPLATE_01_MODELS.map((m, i) => ({
        ...DEFAULT_SLIDE,
        id: `s${i}`,
        position: i,
        templateModel: m,
        backgroundImageUrl: '',
        gridImageUrl: '',
        contentImageUrl: '',
      })) as Slide[],
    Slide: Template01Slide,
  },
  {
    nome: 'Radar (template02)',
    style: 'template02' as SlideStyle,
    // No Radar a aba rotulada "Cantos" é o painel de id `cabecalho`: o rótulo
    // de `cabecalho` é por estilo (ver PANEL_REGISTRY em sidebar/panels.ts) e
    // só no FlowLine ele vira "Barra de perfil".
    painelId: 'cabecalho',
    esquerdo: 'header.category',
    direito: 'header.handle',
    ativo: 1,
    deck: (): Slide[] =>
      [1, 2, 3, 1, 2].map((m, i) => ({
        ...DEFAULT_SLIDE,
        id: `s${i}`,
        position: i,
        templateModel: m,
        backgroundImageUrl: '',
        gridImageUrl: '',
        contentImageUrl: '',
      })) as Slide[],
    Slide: Template02Slide,
  },
  {
    nome: 'FlowLine (template03)',
    style: 'template03' as SlideStyle,
    painelId: 'cantos',
    esquerdo: 'cantos.left',
    direito: 'cantos.right',
    ativo: 1,
    deck: (): Slide[] =>
      [0, 1, 2, 3, 4].map((_, i) => ({
        ...DEFAULT_SLIDE,
        id: `s${i}`,
        position: i,
        templateModel: i === 0 ? TEMPLATE_03_MODEL_COVER : TEMPLATE_03_MODEL_STEP,
        backgroundImageUrl: '',
        gridImageUrl: '',
        contentImageUrl: '',
        templateSlots: {},
      })) as Slide[],
    Slide: Template03Slide,
  },
] as const;

function montaBarra(t: (typeof TEMPLATES)[number]) {
  useEditorStore.setState({
    slides: t.deck(),
    activeSlideIndex: t.ativo,
    style: t.style,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });
  return render(
    <EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />,
  );
}

/** Abre a aba Cantos do template e devolve o bloco dela. */
function abreCantos(painelId: string): HTMLElement {
  const painel = document.querySelector(`[data-panel="${painelId}"]`) as HTMLElement;
  expect(painel, `a aba Cantos (${painelId}) não está na barra`).toBeTruthy();
  fireEvent.click(within(painel).getByRole('button', { expanded: false }));
  return painel;
}

/** Os checkboxes de canto do painel, na ordem em que aparecem. */
function checkboxesDeCanto(painel: HTMLElement): HTMLElement[] {
  return within(painel).queryAllByRole('checkbox');
}

/** O switch mestre "Exibir cantos". */
function mestre(painel: HTMLElement): HTMLElement {
  return within(painel).getByRole('switch');
}

/** O slide ativo, como está na store agora. */
function slideAtivo(): Slide {
  const { slides, activeSlideIndex } = useEditorStore.getState();
  return slides[activeSlideIndex];
}

/** O canto está DESENHADO no slide? Medido no render, não no estado. */
function cantoNoRender(t: (typeof TEMPLATES)[number], slot: string): boolean {
  const { globalSettings } = useEditorStore.getState();
  // Os três componentes têm props próprias, mas as quatro que o teste passa
  // são comuns aos três. O cast é só para chamá-los pela mesma variável.
  const SlideComp = t.Slide as unknown as React.ComponentType<{
    slide: Slide;
    globalSettings: typeof globalSettings;
    slideIndex: number;
    totalSlides: number;
  }>;
  const { container, unmount } = render(
    <SlideComp
      slide={slideAtivo()}
      globalSettings={globalSettings}
      slideIndex={t.ativo}
      totalSlides={5}
    />,
  );
  const achou = container.querySelector(`[data-slot="${slot}"]`) != null;
  unmount();
  return achou;
}

afterEach(() => {
  cleanup();
  useEditorStore.setState({ slides: [], activeSlideIndex: 0 });
});

describe.each(TEMPLATES)('$nome — os dois cantos são independentes', (t) => {
  it('os dois cantos nascem visíveis, com uma linha cada', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    expect(checkboxesDeCanto(painel)).toHaveLength(2);
    expect(cantoNoRender(t, t.esquerdo)).toBe(true);
    expect(cantoNoRender(t, t.direito)).toBe(true);
  });

  it('desligar SÓ o esquerdo não fecha o painel nem some com a linha do direito', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    fireEvent.click(checkboxesDeCanto(painel)[0]);

    // Era aqui que quebrava: o mestre virava `false` e `{show && …}` levava
    // TODAS as linhas junto, inclusive a do canto que seguia visível.
    const linhas = checkboxesDeCanto(painel);
    expect(linhas, 'o painel fechou ao desmarcar um canto só').toHaveLength(2);
    expect(linhas[0].getAttribute('aria-checked')).toBe('false');
    expect(linhas[1].getAttribute('aria-checked')).toBe('true');
    expect(mestre(painel).getAttribute('aria-checked')).toBe('true');
  });

  it('desligar SÓ o esquerdo deixa o direito VISÍVEL no render', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    fireEvent.click(checkboxesDeCanto(painel)[0]);

    expect(slideAtivo().templateSlotStyles?.[t.esquerdo]?.visible).toBe(false);
    expect(cantoNoRender(t, t.esquerdo)).toBe(false);
    expect(cantoNoRender(t, t.direito), 'o direito sumiu junto com o esquerdo').toBe(true);
  });

  it('o simétrico: desligar SÓ o direito deixa o esquerdo visível no render', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    fireEvent.click(checkboxesDeCanto(painel)[1]);

    expect(slideAtivo().templateSlotStyles?.[t.direito]?.visible).toBe(false);
    expect(cantoNoRender(t, t.direito)).toBe(false);
    expect(cantoNoRender(t, t.esquerdo), 'o esquerdo sumiu junto com o direito').toBe(true);
  });

  it('o canto desligado continua desligado — desmarcar um não ressuscita o outro', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    // Desliga o esquerdo e, com o painel ainda aberto, desliga o direito.
    // Antes do conserto o painel fechava no primeiro clique e o segundo canto
    // ficava inalcançável: não havia como chegar a "os dois desligados" pela
    // linha, só pelo mestre.
    fireEvent.click(checkboxesDeCanto(painel)[0]);
    fireEvent.click(checkboxesDeCanto(painel)[1]);

    expect(slideAtivo().templateSlotStyles?.[t.esquerdo]?.visible).toBe(false);
    expect(slideAtivo().templateSlotStyles?.[t.direito]?.visible).toBe(false);
    expect(cantoNoRender(t, t.esquerdo)).toBe(false);
    expect(cantoNoRender(t, t.direito)).toBe(false);
  });

  it('religar o esquerdo devolve só ele', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    fireEvent.click(checkboxesDeCanto(painel)[0]);
    fireEvent.click(checkboxesDeCanto(painel)[0]);

    expect(cantoNoRender(t, t.esquerdo)).toBe(true);
    expect(cantoNoRender(t, t.direito)).toBe(true);
  });
});

describe.each(TEMPLATES)('$nome — o mestre "Exibir cantos" continua valendo', (t) => {
  it('o switch mestre derruba os DOIS de uma vez', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    fireEvent.click(mestre(painel));

    expect(slideAtivo().templateSlotStyles?.[t.esquerdo]?.visible).toBe(false);
    expect(slideAtivo().templateSlotStyles?.[t.direito]?.visible).toBe(false);
    expect(cantoNoRender(t, t.esquerdo)).toBe(false);
    expect(cantoNoRender(t, t.direito)).toBe(false);
  });

  it('o mestre desligado esconde as linhas, e religado devolve os dois cantos', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    fireEvent.click(mestre(painel));
    expect(checkboxesDeCanto(painel), 'o mestre desligado ainda mostra linhas').toHaveLength(0);

    fireEvent.click(mestre(painel));
    expect(checkboxesDeCanto(painel)).toHaveLength(2);
    expect(cantoNoRender(t, t.esquerdo)).toBe(true);
    expect(cantoNoRender(t, t.direito)).toBe(true);
  });

  it('com um canto desligado o mestre segue LIGADO — ele fala do bloco, não do slot', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    fireEvent.click(checkboxesDeCanto(painel)[0]);

    // O mestre responde "o bloco de cantos mostra alguma coisa?". Enquanto um
    // canto estiver visível, a resposta é sim — e é isso que mantém o painel
    // aberto para a pessoa continuar mexendo.
    expect(mestre(painel).getAttribute('aria-checked')).toBe('true');
  });

  it('o mestre só desliga sozinho quando NENHUM canto sobra visível', () => {
    montaBarra(t);
    const painel = abreCantos(t.painelId);

    fireEvent.click(checkboxesDeCanto(painel)[0]);
    expect(mestre(painel).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(checkboxesDeCanto(painel)[1]);
    expect(mestre(painel).getAttribute('aria-checked')).toBe('false');
  });
});
