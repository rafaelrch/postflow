// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, within } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';
import {
  TEMPLATE_03_MODELS,
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_MODEL_STEP,
  template03HeaderSlotsForModel,
} from '@/lib/templates/template-03';
import Template03Slide from '@/components/slides/Template03Slide';

/**
 * BARRA DE PERFIL do FlowLine — o mestre também responde pelo BLOCO.
 *
 * Irmão da aba Cantos (ver tests/cantos-independentes.test.tsx, onde a causa
 * está escrita por extenso): o painel tem a MESMA forma — um switch mestre, o
 * corpo desenhado só com ele ligado (`{t03HeaderVisible && …}`) e um checkbox
 * por slot dentro.
 *
 * ⚠️ MEDIÇÃO ANTES DA CONCLUSÃO — o que o `every` fazia aqui, na prática:
 * NADA. A barra de perfil tem UM slot de texto por modelo (`s1.handle` /
 * `s2.handle`); o avatar é slot de IMAGEM e não entra no painel de texto (ver o
 * filtro `kind === 'text'` em EditorSidebar). Sobre uma lista de um elemento,
 * `every` e `some` são a MESMA função — não existe segundo slot para se perder,
 * e por isso o bug dos cantos não tinha como aparecer neste painel. Desmarcar o
 * único @ desligar o mestre está CERTO: nenhum slot visível é o bloco desligado.
 *
 * Então a troca para `some` aqui não conserta um sintoma de hoje: ela fecha a
 * porta para amanhã. No dia em que a barra de perfil ganhar um segundo campo de
 * texto (um nome ao lado do @, por exemplo), o `every` traria o bug dos cantos
 * de volta inteiro. É isso que o último bloco deste arquivo prova, montando
 * exatamente esse cenário — e é o único teste daqui que falha com o `every`.
 *
 * O render confirma que a barra é UMA peça só, de propósito: `profileVisible`
 * (Template03Slide) sai da visibilidade do @ e esconde o grupo inteiro — avatar,
 * @ e selo —, comportamento documentado no próprio componente.
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

/** Deck do FlowLine: capa + 4 slides de conteúdo. */
function deck(): Slide[] {
  return [0, 1, 2, 3, 4].map((_, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    templateModel: i === 0 ? TEMPLATE_03_MODEL_COVER : TEMPLATE_03_MODEL_STEP,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    templateSlots: {},
  })) as Slide[];
}

const ATIVO = 1;

function montaBarra() {
  useEditorStore.setState({
    slides: deck(),
    activeSlideIndex: ATIVO,
    style: 'template03',
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });
  return render(
    <EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />,
  );
}

/** Abre a aba "Barra de perfil" (id `cabecalho` no FlowLine) e devolve o bloco. */
function abreBarraDePerfil(): HTMLElement {
  const painel = document.querySelector('[data-panel="cabecalho"]') as HTMLElement;
  expect(painel, 'a aba Barra de perfil não está na barra').toBeTruthy();
  fireEvent.click(within(painel).getByRole('button', { expanded: false }));
  return painel;
}

const checkboxes = (painel: HTMLElement) => within(painel).queryAllByRole('checkbox');
const mestre = (painel: HTMLElement) => within(painel).getByRole('switch');

function slideAtivo(): Slide {
  const { slides, activeSlideIndex } = useEditorStore.getState();
  return slides[activeSlideIndex];
}

/** O grupo de perfil está DESENHADO no slide? Medido no render. */
function perfilNoRender(): boolean {
  const { globalSettings } = useEditorStore.getState();
  const { container, unmount } = render(
    <Template03Slide
      slide={slideAtivo()}
      globalSettings={globalSettings}
      slideIndex={ATIVO}
      totalSlides={5}
    />,
  );
  const grupo = container.querySelector('[data-profile-group]');
  const visivel = grupo?.getAttribute('data-profile-visible') === 'true';
  unmount();
  return visivel;
}

afterEach(() => {
  cleanup();
  useEditorStore.setState({ slides: [], activeSlideIndex: 0 });
  vi.resetModules();
});

describe('a premissa medida: a barra de perfil tem UM slot de texto', () => {
  it.each(TEMPLATE_03_MODELS)(
    'modelo %i: um campo de texto (o @) e o avatar como imagem',
    (model) => {
      const header = template03HeaderSlotsForModel(model);
      const texto = header.filter((d) => d.kind === 'text');

      // É este 1 que faz `every` e `some` coincidirem hoje. Se este teste
      // quebrar porque a barra ganhou outro campo, leia o último bloco do
      // arquivo: é exatamente o cenário que o `some` passa a segurar.
      expect(texto).toHaveLength(1);
      expect(texto[0].slot).toMatch(/\.handle$/);
      expect(header.some((d) => d.kind === 'image')).toBe(true);
    },
  );
});

describe('o contrato de hoje, com um slot só', () => {
  it('a barra nasce visível, com uma linha e o mestre ligado', () => {
    montaBarra();
    const painel = abreBarraDePerfil();

    expect(checkboxes(painel)).toHaveLength(1);
    expect(mestre(painel).getAttribute('aria-checked')).toBe('true');
    expect(perfilNoRender()).toBe(true);
  });

  it('desmarcar o @ esconde o grupo de perfil inteiro no render', () => {
    montaBarra();
    const painel = abreBarraDePerfil();

    fireEvent.click(checkboxes(painel)[0]);

    // Não é bug: o spec desenha a barra como UMA peça, e o componente
    // documenta que a visibilidade dela é a do @.
    expect(perfilNoRender()).toBe(false);
    // Sem nenhum slot visível o bloco está de fato desligado — o mestre acompanha.
    expect(mestre(painel).getAttribute('aria-checked')).toBe('false');
  });

  it('o switch mestre derruba e devolve a barra inteira', () => {
    montaBarra();
    const painel = abreBarraDePerfil();

    fireEvent.click(mestre(painel));
    expect(perfilNoRender()).toBe(false);
    expect(checkboxes(painel)).toHaveLength(0);

    fireEvent.click(mestre(painel));
    expect(perfilNoRender()).toBe(true);
    expect(checkboxes(painel)).toHaveLength(1);
  });

  it('religar pelo checkbox devolve a barra', () => {
    montaBarra();
    const painel = abreBarraDePerfil();

    fireEvent.click(checkboxes(painel)[0]);
    fireEvent.click(mestre(painel));

    expect(perfilNoRender()).toBe(true);
    expect(slideAtivo().templateSlotStyles?.['s2.handle']?.visible).not.toBe(false);
  });
});

/**
 * A GUARDA — o único teste deste arquivo que o `every` reprova.
 *
 * Monta o futuro: a barra de perfil com DOIS campos de texto. Com o mestre em
 * `every`, desmarcar um derruba o mestre, o corpo do painel some (`{mestre &&
 * …}`) e a linha do outro campo — que continua visível — vai junto. É o bug dos
 * cantos, reencarnado. Com `some`, o painel fica aberto e cada campo responde
 * por si.
 */
describe('guarda: se a barra ganhar um segundo campo, os dois seguem independentes', () => {
  async function barraComDoisCampos() {
    vi.resetModules();
    vi.doMock('@/lib/templates/template-03', async () => {
      const real = await vi.importActual<typeof import('@/lib/templates/template-03')>(
        '@/lib/templates/template-03',
      );
      return {
        ...real,
        template03HeaderSlotsForModel: (model: number) => [
          ...real.template03HeaderSlotsForModel(model),
          {
            slot: `s${model}.nome`,
            label: 'Nome',
            kind: 'text' as const,
            scope: 'header' as const,
            y: 0,
            defaultValue: 'Seu Nome',
          },
        ],
      };
    });
    const Sidebar = (await import('../components/editor/EditorSidebar')).default;
    // Depois do `resetModules` o sidebar passa a usar uma cópia NOVA da store:
    // escrever na instância importada no topo do arquivo não chegaria nele.
    const { useEditorStore: store } = await import('../hooks/useEditorStore');

    store.setState({
      slides: deck(),
      activeSlideIndex: ATIVO,
      style: 'template03',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<Sidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
    return abreBarraDePerfil();
  }

  afterEach(() => vi.doUnmock('@/lib/templates/template-03'));

  it('o painel passa a ter duas linhas', async () => {
    const painel = await barraComDoisCampos();
    expect(checkboxes(painel)).toHaveLength(2);
  });

  it('desmarcar SÓ o primeiro não fecha o painel nem some com a linha do segundo', async () => {
    const painel = await barraComDoisCampos();

    fireEvent.click(checkboxes(painel)[0]);

    const linhas = checkboxes(painel);
    expect(linhas, 'o painel fechou ao desmarcar um campo só').toHaveLength(2);
    expect(linhas[0].getAttribute('aria-checked')).toBe('false');
    expect(linhas[1].getAttribute('aria-checked')).toBe('true');
    expect(mestre(painel).getAttribute('aria-checked')).toBe('true');
  });

  it('o simétrico: desmarcar SÓ o segundo mantém o primeiro marcado', async () => {
    const painel = await barraComDoisCampos();

    fireEvent.click(checkboxes(painel)[1]);

    const linhas = checkboxes(painel);
    expect(linhas).toHaveLength(2);
    expect(linhas[0].getAttribute('aria-checked')).toBe('true');
    expect(linhas[1].getAttribute('aria-checked')).toBe('false');
  });

  it('o mestre só cai quando NENHUM dos dois sobra visível', async () => {
    const painel = await barraComDoisCampos();

    fireEvent.click(checkboxes(painel)[0]);
    expect(mestre(painel).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(checkboxes(painel)[1]);
    expect(mestre(painel).getAttribute('aria-checked')).toBe('false');
  });

  it('o mestre continua derrubando os dois de uma vez', async () => {
    const painel = await barraComDoisCampos();

    fireEvent.click(mestre(painel));

    expect(checkboxes(painel)).toHaveLength(0);
    expect(mestre(painel).getAttribute('aria-checked')).toBe('false');
  });
});
