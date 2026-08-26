// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';
import {
  TEMPLATE_03_MODELS,
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_MODEL_STEP,
  TEMPLATE_03_PALETTE,
  template03AvatarSlot,
  template03HandleSlot,
  template03ImageSlot,
  template03SlotsForModel,
  template03TextSlotsForModel,
} from '@/lib/templates/template-03';
import {
  template03ClearAvatar,
  template03ClearImage,
  template03SetAvatar,
  template03SetImage,
  template03SlideImageUrl,
} from '@/lib/templates/template-03/image';
import {
  TEMPLATE_03_GRADIENT_DIRECTIONS,
  TEMPLATE_03_GRADIENT_DIRECTION_LABELS,
  TEMPLATE_03_CONTENT_POSITION_LABELS,
  TEMPLATE_03_CONTENT_ALIGN_LABELS,
  markTemplate03Override,
  template03DefaultGradientDirection,
  template03GradientDirectionFor,
  template03GradientSlide,
  template03Overrides,
  template03SlideChanges,
  template03SpecBackground,
} from '@/lib/templates/template-03/overrides';
import { TEMPLATE_SIDEBAR_CONFIG, visiblePanels } from '@/components/editor/sidebar/panels';

/**
 * TEMPLATE 3 — "FlowLine", fatia S3: o editor.
 *
 * Moldes: `template-02-editor.test.tsx` e `template-02-barra.test.tsx`. A barra
 * é renderizada de verdade — testar só a config provaria que a lista existe, não
 * que o usuário consegue editar.
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

/** Deck aberto do FlowLine: capa + 4 slides de conteúdo. */
function deck(active: number, slideExtra: Partial<Slide> = {}): Slide[] {
  return [1, 2, 3, 4, 5].map((_, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    templateModel: i === 0 ? TEMPLATE_03_MODEL_COVER : TEMPLATE_03_MODEL_STEP,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    templateSlots: {},
    ...(i === active ? slideExtra : {}),
  })) as Slide[];
}

function montaDeck(active: number, slideExtra: Partial<Slide> = {}) {
  useEditorStore.setState({
    slides: deck(active, slideExtra),
    activeSlideIndex: active,
    style: 'template03',
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });
  return render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
}

/** Abre um painel fechado pelo rótulo e devolve o card dele. */
function abre(painel: string): HTMLElement {
  fireEvent.click(screen.getByText(painel));
  return screen.getByText(painel).closest('[data-panel]') as HTMLElement;
}

/** O rótulo real do painel no PANEL_REGISTRY — não um palpite. */
const RESTAURAR = 'Restaurar estilo original deste slide';

const slideAtivo = () => useEditorStore.getState().slides[useEditorStore.getState().activeSlideIndex];

afterEach(cleanup);

// ── Painéis ─────────────────────────────────────────────────────

describe('TEMPLATE 3 — os painéis da barra', () => {
  it('a config do T3 não é mais o placeholder vazio da S1', () => {
    expect(TEMPLATE_SIDEBAR_CONFIG.template03.length).toBeGreaterThan(0);
    const ids = TEMPLATE_SIDEBAR_CONFIG.template03.flatMap((g) =>
      g.panels.map((p) => (typeof p === 'string' ? p : p.id))
    );
    expect(ids).toContain('conteudoSlide');
    expect(ids).toContain('refinarTexto');
    expect(ids).toContain('sombraOverlay');
  });

  it('o painel do overlay tem rótulo próprio e quatro direções acessíveis', () => {
    montaDeck(0);
    const painel = abre('Overlay degradê');
    expect(within(painel).getByRole('group', { name: 'Direção do degradê' })).toBeTruthy();
    expect(within(painel).queryByRole('group', { name: 'Posição do conteúdo' })).toBeNull();
    expect(within(painel).queryByRole('group', { name: 'Alinhamento do conteúdo' })).toBeNull();
    for (const direction of TEMPLATE_03_GRADIENT_DIRECTIONS) {
      expect(within(painel).getByRole('button', {
        name: TEMPLATE_03_GRADIENT_DIRECTION_LABELS[direction],
      })).toBeTruthy();
    }
  });

  it('a direção escolhida persiste em templateOverrides e o default vem do spec', () => {
    expect(template03DefaultGradientDirection(TEMPLATE_03_MODEL_COVER)).toBe('bottom-to-top');
    expect(template03DefaultGradientDirection(TEMPLATE_03_MODEL_STEP)).toBe('bottom-to-top');
    const slide = { ...DEFAULT_SLIDE, templateModel: TEMPLATE_03_MODEL_COVER } as Slide;
    expect(template03GradientDirectionFor(slide, TEMPLATE_03_MODEL_COVER)).toBe('bottom-to-top');

    montaDeck(0);
    const painel = abre('Overlay degradê');
    fireEvent.click(within(painel).getByRole('button', { name: 'Esquerda para direita' }));
    expect(slideAtivo().templateOverrides?.overlayGradientDirection).toBe('left-to-right');
    expect(template03GradientDirectionFor(slideAtivo(), TEMPLATE_03_MODEL_COVER)).toBe('left-to-right');
  });

  it('posição e alinhamento são overrides independentes por slide', () => {
    montaDeck(1);
    const painel = abre('Conteúdo do slide');

    fireEvent.click(within(painel).getByRole('button', {
      name: TEMPLATE_03_CONTENT_POSITION_LABELS.topo,
    }));
    fireEvent.click(within(painel).getByRole('button', {
      name: TEMPLATE_03_CONTENT_ALIGN_LABELS.direita,
    }));

    expect(useEditorStore.getState().slides[1].templateOverrides).toMatchObject({
      contentPosition: 'topo',
      contentAlign: 'direita',
    });

    // O slide B, do mesmo templateModel, pode ter escolhas próprias.
    useEditorStore.setState({ activeSlideIndex: 2 });
    const painelB = screen.getByText('Conteúdo do slide').closest('[data-panel]') as HTMLElement;
    fireEvent.click(within(painelB).getByRole('button', {
      name: TEMPLATE_03_CONTENT_POSITION_LABELS.centro,
    }));
    fireEvent.click(within(painelB).getByRole('button', {
      name: TEMPLATE_03_CONTENT_ALIGN_LABELS.esquerda,
    }));

    const estado = useEditorStore.getState().slides;
    expect(estado[1].templateOverrides).toMatchObject({ contentPosition: 'topo', contentAlign: 'direita' });
    expect(estado[2].templateOverrides).toMatchObject({ contentPosition: 'centro', contentAlign: 'esquerda' });
    expect(estado[3].templateOverrides?.contentPosition).toBeUndefined();
    expect(estado[3].templateOverrides?.contentAlign).toBeUndefined();
    expect(estado[0].templateOverrides?.contentPosition).toBeUndefined();
    expect(estado[0].templateOverrides?.contentAlign).toBeUndefined();
  });

  /**
   * 🔴 `restaurarTemplate` é o que desfaz tudo o que está acima: fora do fim do
   * grupo, ele desfaria também o que vem depois dele na lista.
   */
  it('restaurarTemplate é SEMPRE o último do grupo', () => {
    for (const grupo of TEMPLATE_SIDEBAR_CONFIG.template03) {
      const ids = grupo.panels.map((p) => (typeof p === 'string' ? p : p.id));
      if (!ids.includes('restaurarTemplate')) continue;
      expect(ids.at(-1)).toBe('restaurarTemplate');
    }
  });

  it('todos os painéis configurados aparecem na tela, na ordem', () => {
    montaDeck(0);
    const ctx = {
      style: 'template03' as const,
      slide: deck(0)[0],
      activeSlideIndex: 0,
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
      template01Model: null,
      template02Model: null,
      isEditorialCover: false,
    };
    const esperados = visiblePanels(ctx).flatMap((g) => g.ids);
    expect(esperados.length).toBeGreaterThan(0);
    for (const id of esperados) {
      expect(document.querySelector(`[data-panel="${id}"]`), id).toBeTruthy();
    }
    expect(document.querySelectorAll('[data-panel]').length).toBe(esperados.length);
  });

  /**
   * Todo modelo do FlowLine tem imagem de fundo — não existe o caso do modelo 6
   * do T1, onde o painel some e a geração cobrava sem pintar nada.
   */
  it('o painel de imagem aparece nos DOIS modelos', () => {
    for (const [i, model] of [[0, TEMPLATE_03_MODEL_COVER], [1, TEMPLATE_03_MODEL_STEP]] as const) {
      montaDeck(i);
      expect(document.querySelector('[data-panel="imagem"]'), `modelo ${model}`).toBeTruthy();
      cleanup();
    }
  });

  it('a barra de perfil e os cantos são painéis DIFERENTES', () => {
    montaDeck(0);
    expect(document.querySelector('[data-panel="cabecalho"]')).toBeTruthy();
    expect(document.querySelector('[data-panel="cantos"]')).toBeTruthy();
  });

  it('a Barra de perfil T3 remove tipografia/margem/opacidade/cor e oferece foto', () => {
    montaDeck(1);
    const painel = abre('Barra de perfil');
    for (const proibido of ['Tamanho fonte', 'Margem', 'Opacidade', 'Cor', 'Fonte', 'Peso']) {
      expect(within(painel).queryByText(proibido), proibido).toBeNull();
    }
    expect(within(painel).getByText('Carregar foto de perfil')).toBeTruthy();
  });

  it('o Estilo do texto T3 não exibe os sliders Margem', () => {
    montaDeck(0);
    const painel = abre('Estilo do texto');
    expect(within(painel).queryAllByText('Margem')).toHaveLength(0);
  });

  it('o upload de perfil sincroniza o avatar do modelo em todos os slides', async () => {
    montaDeck(1);
    abre('Barra de perfil');
    const input = document.querySelector('[data-template03-avatar-input]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })] } });

    await waitFor(() => {
      expect(useEditorStore.getState().slides.every(
        (s) => s.templateSlots?.[template03AvatarSlot(s.templateModel ?? TEMPLATE_03_MODEL_STEP)] === 'https://x/y.png'
      )).toBe(true);
    });
  });

  it('a Barra de perfil oferece somente escala do grupo e ajustes de crop da foto', () => {
    montaDeck(1);
    const painel = abre('Barra de perfil');
    for (const label of [
      'Escala da barra de perfil',
      'Zoom da foto',
      'Posição horizontal da foto',
      'Posição vertical da foto',
    ]) {
      expect(within(painel).getByText(label)).toBeTruthy();
    }
    const ranges = [...painel.querySelectorAll('[data-template03-profile-controls] input[type="range"]')] as HTMLInputElement[];
    expect(ranges).toHaveLength(4);
    expect(ranges.map((input) => [input.min, input.max, input.value])).toEqual([
      ['80', '140', '100'],
      ['100', '250', '100'],
      ['0', '100', '50'],
      ['0', '100', '50'],
    ]);

    fireEvent.change(ranges[0], { target: { value: '120' } });
    fireEvent.change(ranges[1], { target: { value: '180' } });
    fireEvent.change(ranges[2], { target: { value: '20' } });
    fireEvent.change(ranges[3], { target: { value: '75' } });

    for (const current of useEditorStore.getState().slides) {
      const model = current.templateModel ?? TEMPLATE_03_MODEL_STEP;
      const styles = current.templateSlotStyles?.[template03AvatarSlot(model)] as Record<string, number>;
      expect(styles).toMatchObject({
        profileScale: 120,
        avatarZoom: 180,
        avatarPositionX: 20,
        avatarPositionY: 75,
      });
    }
  });

  it('o toggle da barra persiste visibilidade unificada sem perder escala', () => {
    montaDeck(1, {
      templateSlotStyles: {
        's2.avatar': { profileScale: 120 },
        's2.handle': { visible: true },
      },
    });
    const painel = abre('Barra de perfil');
    const toggle = within(painel).getByRole('switch', { name: 'Exibir barra de perfil' });

    fireEvent.click(toggle);
    let active = slideAtivo();
    expect(active.templateSlotStyles?.['s2.handle']?.visible).toBe(false);
    expect(active.templateSlotStyles?.['s2.avatar']?.profileScale).toBe(120);

    fireEvent.click(toggle);
    active = slideAtivo();
    expect(active.templateSlotStyles?.['s2.handle']?.visible).toBe(true);
    expect(active.templateSlotStyles?.['s2.avatar']?.profileScale).toBe(120);
  });
});

// ── Conteúdo ────────────────────────────────────────────────────

describe('TEMPLATE 3 — conteúdo do slide', () => {
  it('mostra um campo por slot de texto do MODELO', () => {
    montaDeck(1);
    const painel = abre('Conteúdo do slide');
    for (const d of template03TextSlotsForModel(TEMPLATE_03_MODEL_STEP)) {
      expect(within(painel).getByText(d.label), d.slot).toBeTruthy();
      expect(painel.querySelector(`[data-slot-input="${d.slot}"]`), d.slot).toBeTruthy();
    }
  });

  it('o conteúdo em qualquer posição edita as chaves s2.*, nunca s3/s4', () => {
    for (const active of [1, 2, 3, 4]) {
      montaDeck(active);
      const painel = abre('Conteúdo do slide');
      expect(painel.querySelector('[data-slot-input="s2.title"]'), `posição ${active}`).toBeTruthy();
      expect(painel.querySelector('[data-slot-input="s3.title"]')).toBeNull();
      cleanup();
    }
  });

  it('editar um campo grava no slot daquele slide', () => {
    montaDeck(1);
    const painel = abre('Conteúdo do slide');
    const input = painel.querySelector('[data-slot-input="s2.title"]') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Ideia 07 - Fechamento' } });
    expect(slideAtivo().templateSlots?.['s2.title']).toBe('Ideia 07 - Fechamento');
  });

  it('o painel de conteúdo NÃO repete o @ nem os cantos', () => {
    // Se aparecessem nos dois lugares, editar num deles divergiria do outro.
    for (const model of TEMPLATE_03_MODELS) {
      const slots = template03TextSlotsForModel(model).map((d) => d.slot);
      expect(slots.some((s) => s.endsWith('.handle'))).toBe(false);
      expect(slots.some((s) => s.startsWith('cantos.'))).toBe(false);
    }
  });
});

// ── Imagem: uma verdade só ──────────────────────────────────────

describe('TEMPLATE 3 — a imagem tem UMA verdade só', () => {
  it('a foto de perfil usa o slot do modelo e pode ser removida', () => {
    const slide = { ...DEFAULT_SLIDE, id: 's', position: 1, templateSlots: {} } as Slide;
    const set = template03SetAvatar(slide, TEMPLATE_03_MODEL_STEP, 'https://x/avatar.webp');
    expect(set.templateSlots?.[template03AvatarSlot(TEMPLATE_03_MODEL_STEP)]).toBe('https://x/avatar.webp');
    const cleared = template03ClearAvatar({ ...slide, ...set } as Slide, TEMPLATE_03_MODEL_STEP);
    expect(cleared.templateSlots?.[template03AvatarSlot(TEMPLATE_03_MODEL_STEP)]).toBe('');
  });
  it('escrever põe no slot e ZERA os genéricos', () => {
    const slide = {
      ...DEFAULT_SLIDE,
      id: 's',
      position: 0,
      backgroundImageUrl: 'https://velha/bg.jpg',
      gridImageUrl: 'https://velha/grid.jpg',
      contentImageUrl: 'https://velha/content.jpg',
    } as Slide;
    const patch = template03SetImage(slide, TEMPLATE_03_MODEL_STEP, 'https://nova/foto.jpg');
    expect(patch.templateSlots?.['s2.image']).toBe('https://nova/foto.jpg');
    expect(patch.backgroundImageUrl).toBe('');
    expect(patch.gridImageUrl).toBe('');
    expect(patch.contentImageUrl).toBe('');
  });

  it('limpar apaga dos DOIS lados, senão a imagem volta sozinha', () => {
    const slide = {
      ...DEFAULT_SLIDE,
      id: 's',
      position: 0,
      templateSlots: { 's1.image': 'https://x/a.jpg' },
      backgroundImageUrl: 'https://x/generica.jpg',
    } as Slide;
    const patch = template03ClearImage(slide, TEMPLATE_03_MODEL_COVER);
    expect(patch.templateSlots?.['s1.image']).toBe('');
    expect(patch.backgroundImageUrl).toBe('');
    expect(patch.gridImageUrl).toBe('');
    expect(patch.contentImageUrl).toBe('');
  });

  /**
   * 🔴 A leitura é SÓ o slot — molde do T2, não o do T1. O FlowLine não tem um
   * único deck salvo de antes da regra, então não pode nascer com a dívida de
   * fallback que fazia a imagem genérica reaparecer.
   */
  it('a leitura ignora os genéricos, mesmo preenchidos', () => {
    const slide = {
      templateSlots: {},
      backgroundImageUrl: 'https://x/generica.jpg',
      gridImageUrl: 'https://x/grid.jpg',
      contentImageUrl: 'https://x/content.jpg',
    } as unknown as Slide;
    expect(template03SlideImageUrl(slide, TEMPLATE_03_MODEL_COVER)).toBe('');
  });

  it('gerar por IA DEPOIS de um upload manual muda a tela', () => {
    // O bug do T1: os dois escreviam em lugares diferentes e o slot vencia, então
    // a geração dizia "pronto!" e nada mudava.
    let slide = { ...DEFAULT_SLIDE, id: 's', position: 0 } as Slide;
    slide = { ...slide, ...template03SetImage(slide, TEMPLATE_03_MODEL_COVER, 'https://upload/manual.jpg') } as Slide;
    expect(template03SlideImageUrl(slide, TEMPLATE_03_MODEL_COVER)).toBe('https://upload/manual.jpg');

    slide = { ...slide, ...template03SetImage(slide, TEMPLATE_03_MODEL_COVER, 'https://ia/gerada.jpg') } as Slide;
    expect(template03SlideImageUrl(slide, TEMPLATE_03_MODEL_COVER)).toBe('https://ia/gerada.jpg');
  });

  it('a imagem é por MODELO: capa e conteúdo não se sobrescrevem', () => {
    expect(template03ImageSlot(TEMPLATE_03_MODEL_COVER)).toBe('s1.image');
    expect(template03ImageSlot(TEMPLATE_03_MODEL_STEP)).toBe('s2.image');
  });

});

// ── Override é MARCA, não valor ─────────────────────────────────

describe('TEMPLATE 3 — override é MARCA, nunca valor', () => {
  /**
   * 🔴 Armadilha #3: a versão antiga do T1 comparava o valor com o padrão. A
   * geração gravava a cor da marca do usuário em todo slide, o valor diferia, e
   * o carrossel nascia pintado chapado por cima do degradê do Figma.
   */
  it('cor de fundo SEM marca não é override — o slide segue o spec', () => {
    const slide = { ...DEFAULT_SLIDE, id: 's', position: 0, backgroundColor: '#FF0000' } as Slide;
    expect(template03Overrides(slide).background).toBeUndefined();
  });

  it('a mesma cor COM marca vira override', () => {
    const slide = {
      ...DEFAULT_SLIDE,
      id: 's',
      position: 0,
      backgroundColor: '#FF0000',
      templateOverrides: markTemplate03Override(undefined, 'background'),
    } as Slide;
    expect(template03Overrides(slide).background).toBe('#FF0000');
  });

  it('a marca não apaga as anteriores', () => {
    const um = markTemplate03Override(undefined, 'background');
    const dois = markTemplate03Override(um, 'backgroundImageOpacity');
    expect(dois.background).toBe(true);
    expect(dois.backgroundImageOpacity).toBe(true);
  });

  it('um deck gerado nasce SEM nenhum override', () => {
    const slide = { ...DEFAULT_SLIDE, id: 's', position: 0, templateSlots: { 's1.title': 'x' } } as Slide;
    expect(slide.templateOverrides).toBeUndefined();
    expect(template03SlideChanges(slide)).toBe(0);
    const ov = template03Overrides(slide);
    expect(ov.background).toBeUndefined();
    expect(ov.image.opacity).toBeUndefined();
    expect(Object.keys(ov.slotStyles)).toHaveLength(0);
  });

  it('o estilo por slot é a PRESENÇA da chave, sem marca', () => {
    const slide = {
      ...DEFAULT_SLIDE,
      id: 's',
      position: 0,
      templateSlotStyles: { 's1.title': { color: '#00FF00' } },
    } as Slide;
    expect(template03Overrides(slide).slotStyles['s1.title'].color).toBe('#00FF00');
    expect(template03SlideChanges(slide)).toBe(1);
  });

  it('mexer no fundo pela barra MARCA o controle', () => {
    montaDeck(0);
    const painel = abre('Fundo do slide');
    // O seletor é um popover próprio (CromiaCompact), não um <input type=color>:
    // abre no botão e escreve o hex no campo de dentro.
    fireEvent.click(within(painel).getByLabelText('Abrir seletor de cor Cor'));
    const hex = within(painel).getByLabelText('Cor HEX') as HTMLInputElement;
    fireEvent.change(hex, { target: { value: '#123456' } });
    fireEvent.blur(hex);
    expect(slideAtivo().backgroundColor).toBe('#123456');
    // 🔴 O que faz o override existir é a MARCA, não o valor ter mudado.
    expect(slideAtivo().templateOverrides?.background).toBe(true);
  });

  it('o seletor de fundo abre no degradê do spec, não num padrão do editor', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const bg = template03SpecBackground(model);
      expect(bg.swatch).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(bg.css).toBe(template03GradientSlide(model).background[0].css);
    }
    // A capa abre no cinza do spec; o passo, no branco do slide 3.
    expect(template03SpecBackground(TEMPLATE_03_MODEL_COVER).swatch).toBe(
      TEMPLATE_03_PALETTE.cinza_capa
    );
    expect(template03SpecBackground(TEMPLATE_03_MODEL_STEP).swatch).toBe(
      TEMPLATE_03_PALETTE.branco
    );
  });
});

// ── Restaurar ───────────────────────────────────────────────────

describe('TEMPLATE 3 — restaurar volta ao spec', () => {
  it('o botão apaga as marcas e o estilo por slot', () => {
    montaDeck(0, {
      templateOverrides: { background: true },
      templateSlotStyles: { 's1.title': { color: '#00FF00' } },
      backgroundColor: '#123456',
    });
    abre(RESTAURAR);
    fireEvent.click(screen.getByText('Restaurar'));
    expect(slideAtivo().templateOverrides).toBeUndefined();
    expect(slideAtivo().templateSlotStyles).toBeUndefined();
  });

  /**
   * O que o "Restaurar" promete é o DESENHO de volta ao gabarito, não só dois
   * campos apagados. Aqui isso é medido no markup.
   */
  it('depois de restaurar, o render volta a ser byte a byte o do spec', async () => {
    const { default: Template03Slide } = await import('@/components/slides/Template03Slide');
    const base = { ...DEFAULT_SLIDE, id: 's', position: 0, templateModel: TEMPLATE_03_MODEL_COVER } as Slide;
    const markup = (s: Slide) =>
      renderToStaticMarkup(
        <Template03Slide slide={s} globalSettings={DEFAULT_GLOBAL_SETTINGS} slideIndex={0} totalSlides={4} />
      );

    const doSpec = markup(base);
    const mexido = markup({
      ...base,
      backgroundColor: '#123456',
      templateOverrides: { background: true },
      templateSlotStyles: { 's1.title': { color: '#00FF00', fontSize: 60 } },
    } as Slide);
    expect(mexido).not.toBe(doSpec);

    // Restaurar = apagar os dois campos.
    const restaurado = markup({
      ...base,
      backgroundColor: '#123456',
      templateOverrides: undefined,
      templateSlotStyles: undefined,
    } as Slide);
    expect(restaurado).toBe(doSpec);
  });

  /**
   * Sem nenhum gesto não há o que restaurar, e o painel nasce DESABILITADO — nem
   * abre. É o mesmo comportamento dos outros dois templates de spec.
   */
  it('o painel nasce desabilitado quando não há nenhum gesto', () => {
    montaDeck(0);
    expect(template03SlideChanges(slideAtivo())).toBe(0);
    const cabecalho = screen.getByText(RESTAURAR).closest('button') as HTMLButtonElement;
    expect(cabecalho.disabled).toBe(true);
    fireEvent.click(cabecalho);
    expect(screen.queryByText('Restaurar')).toBeNull();
  });

  it('com um gesto, o painel abre e o botão aparece', () => {
    montaDeck(0, { templateSlotStyles: { 's1.title': { color: '#00FF00' } } });
    expect(template03SlideChanges(slideAtivo())).toBe(1);
    abre(RESTAURAR);
    expect(screen.getByText('Restaurar')).toBeTruthy();
  });
});

// ── Cada controle tem efeito no render ──────────────────────────

describe('TEMPLATE 3 — cada controle da barra muda o desenho', () => {
  it('cor, tamanho, sublinhado e margem por slot chegam ao render', async () => {
    const { default: Template03Slide } = await import('@/components/slides/Template03Slide');
    const base = { ...DEFAULT_SLIDE, id: 's', position: 0, templateModel: TEMPLATE_03_MODEL_COVER } as Slide;
    const markup = (styles: Record<string, unknown>) =>
      renderToStaticMarkup(
        <Template03Slide
          slide={{ ...base, templateSlotStyles: styles } as Slide}
          globalSettings={DEFAULT_GLOBAL_SETTINGS}
          slideIndex={0}
          totalSlides={4}
        />
      );

    expect(markup({ 's1.title': { color: '#00FF00' } })).toContain('#00FF00');
    expect(markup({ 's1.title': { fontSize: 60 } })).toContain('font-size:60px');
    expect(markup({ 's1.title': { underline: true } })).toContain('underline');
    expect(markup({ 's1.title': { margin: 40 } })).toContain('margin-top:40px');
    // Esconder tira o bloco da árvore — não é opacidade zero.
    expect(markup({ 's1.title': { visible: false } })).not.toContain('data-slot="s1.title"');
  });

  it('o tamanho novo leva a entrelinha junto, na mesma razão', async () => {
    const { default: Template03Slide } = await import('@/components/slides/Template03Slide');
    const base = { ...DEFAULT_SLIDE, id: 's', position: 0, templateModel: TEMPLATE_03_MODEL_COVER } as Slide;
    const html = renderToStaticMarkup(
      <Template03Slide
        slide={{ ...base, templateSlotStyles: { 's1.title': { fontSize: 56.829 } } } as Slide}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
      />
    );
    // Metade do corpo do spec (113.658) ⇒ metade da entrelinha (114.23).
    expect(html).toContain('font-size:56.829px');
    expect(html).toContain('line-height:57.115px');
  });

  it('a opacidade e a posição da imagem só valem COM a marca', async () => {
    const { default: Template03Slide } = await import('@/components/slides/Template03Slide');
    const base = {
      ...DEFAULT_SLIDE,
      id: 's',
      position: 0,
      templateModel: TEMPLATE_03_MODEL_COVER,
      templateSlots: { 's1.image': 'https://x/f.jpg' },
      backgroundImageOpacity: 40,
    } as Slide;
    const semMarca = renderToStaticMarkup(
      <Template03Slide slide={base} globalSettings={DEFAULT_GLOBAL_SETTINGS} slideIndex={0} totalSlides={4} />
    );
    const comMarca = renderToStaticMarkup(
      <Template03Slide
        slide={{ ...base, templateOverrides: { backgroundImageOpacity: true } } as Slide}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
      />
    );
    expect(semMarca).not.toContain('opacity:0.4');
    expect(comMarca).toContain('opacity:0.4');
  });
});

// ── O @ e os cantos valem para o deck ───────────────────────────

describe('TEMPLATE 3 — a assinatura é do deck', () => {
  it('editar o canto escreve em TODOS os slides', () => {
    montaDeck(2);
    const painel = abre('Cantos');
    const input = within(painel).getAllByRole('textbox')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ARKE STUDIO' } });
    for (const s of useEditorStore.getState().slides) {
      expect(s.templateSlots?.['cantos.left']).toBe('ARKE STUDIO');
    }
  });

  it('editar o @ escreve na chave do MODELO de cada slide (deck aberto)', () => {
    // Deck aberto: slide ativo é passo (modelo 2), mas há capa (modelo 1).
    // O @ é slot POR MODELO (`s{model}.handle`); o valor tem de ir para a chave
    // certa de CADA slide, senão num deck aberto o @ "não propaga" — o slide de
    // modelo 1 continua com o @ antigo.
    montaDeck(2);
    const painel = abre('Barra de perfil');
    const input = within(painel).getAllByRole('textbox')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: '@rafael.dev' } });
    for (const s of useEditorStore.getState().slides) {
      const model = s.templateModel ?? TEMPLATE_03_MODEL_STEP;
      expect(s.templateSlots?.[template03HandleSlot(model)]).toBe('@rafael.dev');
    }
  });

  it('o avatar não aparece como campo de TEXTO no painel', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const texto = template03SlotsForModel(model).filter(
        (d) => d.scope === 'header' && d.kind === 'text'
      );
      expect(texto.map((d) => d.slot)).toEqual([`s${model}.handle`]);
    }
  });
});
