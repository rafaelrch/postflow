// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideStyle } from '@/types';
import { TEMPLATE_SIDEBAR_CONFIG, panelLabel, visiblePanels } from '@/components/editor/sidebar/panels';

/**
 * PELE DO ESTÚDIO (/generator) — o redesenho da página do editor.
 *
 * O que estes testes travam é o que o redesenho pode quebrar sem ninguém notar:
 * a barra de status mostrando os quatro campos, o badge e o contorno marcando
 * SÓ o slide ativo, e — a regressão mais provável desta fatia — a barra lateral
 * continuando a montar os painéis certos por template. A pele mudou de mão em
 * `SidebarPanel`/`SidebarScopeHeader`, e é exatamente o tipo de mexida que
 * derruba a composição orientada a dado sem quebrar compilação.
 */

vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

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

// O saldo de créditos migrou do trilho global para a barra superior do editor;
// no teste ele não pode ir ao Supabase de verdade.
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));

import SlideCanvas from '@/components/editor/SlideCanvas';
import EditorSidebar from '@/components/editor/EditorSidebar';

beforeAll(() => {
  // O canvas mede a área disponível com ResizeObserver, que o jsdom não tem.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

afterEach(cleanup);

function montaDeck(total: number, active: number, style: SlideStyle = 'editorial') {
  const slides = Array.from({ length: total }, (_, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    templateSlots: {},
  })) as Slide[];

  useEditorStore.setState({
    slides,
    activeSlideIndex: active,
    style,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    lastSavedAt: null,
  });
  return slides;
}

/**
 * Deck de template de forma fixa. O MODELO é dado do slide (`templateModel`),
 * nunca a posição — é o que o popup de modelo grava e o que o desenho segue.
 */
function montaDeckTemplate(style: 'template01' | 'template02') {
  const modelos = style === 'template01' ? [1, 2, 3] : [1, 2, 3];
  const slides = modelos.map((templateModel, i) => ({
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    templateModel,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
    templateSlots: {},
  })) as Slide[];

  useEditorStore.setState({
    slides,
    activeSlideIndex: 0,
    style,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    lastSavedAt: null,
  });
  return slides;
}

describe('barra de status', () => {
  it('mostra os quatro campos: salvamento, slide, formato e template', () => {
    montaDeck(6, 0, 'editorial');
    render(<SlideCanvas />);

    const barra = screen.getByTestId('studio-status-bar');
    expect(barra).toBeTruthy();

    // O primeiro campo é o único que muda de estado — os outros são metadado.
    expect(screen.getByTestId('status-save').textContent).toMatch(/Salvo|Salvando|Não salvo/);
    expect(screen.getByTestId('status-slide').textContent).toBe('Slide 1/6');
    // × de multiplicação, não a letra x, e o "px" colado no número.
    expect(screen.getByTestId('status-format').textContent).toBe('1080 × 1350px');
    expect(screen.getByTestId('status-template').textContent).toBe('Editorial');
  });

  it('acompanha o slide ativo', () => {
    montaDeck(6, 3, 'editorial');
    render(<SlideCanvas />);
    expect(screen.getByTestId('status-slide').textContent).toBe('Slide 4/6');
  });

  it('mostra "Salvo às HH:MM" quando há horário de salvamento', () => {
    montaDeck(6, 0, 'editorial');
    // 14:35 local — o horário vem de `carousels.updated_at` na carga, então a
    // barra já abre com hora em vez de um "Salvo" pelado.
    const quando = new Date(2026, 0, 15, 14, 35).getTime();
    useEditorStore.setState({ lastSavedAt: quando, saveStatus: 'saved' });
    render(<SlideCanvas />);

    expect(screen.getByTestId('status-save').textContent).toBe('Salvo às 14:35');
  });

  it('sem horário conhecido, diz o estado sem inventar hora', () => {
    montaDeck(6, 0, 'editorial');
    useEditorStore.setState({ lastSavedAt: null, saveStatus: 'unsaved' });
    render(<SlideCanvas />);

    // "Não salvo" é verdade e é útil. O que não pode é exibir uma hora chutada.
    expect(screen.getByTestId('status-save').textContent).toBe('Não salvo');
  });
});

describe('badge e contorno do slide ativo', () => {
  it('numera todos os slides a partir de 1', () => {
    montaDeck(4, 0, 'editorial');
    render(<SlideCanvas />);

    for (let i = 0; i < 4; i++) {
      expect(screen.getByTestId(`slide-badge-${i}`).textContent).toBe(String(i + 1));
    }
  });

  it('marca o badge do ativo com a cor de seleção e os outros com a cor inativa', () => {
    montaDeck(4, 2, 'editorial');
    render(<SlideCanvas />);

    const ativo = screen.getByTestId('slide-badge-2');
    expect(ativo.dataset.active).toBe('true');
    expect(ativo.style.background).toContain('--studio-select');

    for (const i of [0, 1, 3]) {
      const badge = screen.getByTestId(`slide-badge-${i}`);
      expect(badge.dataset.active).toBe('false');
      expect(badge.style.background).toContain('--studio-badge-idle');
    }
  });

  it('põe o contorno de seleção no ativo e SÓ nele', () => {
    montaDeck(4, 1, 'editorial');
    render(<SlideCanvas />);

    const marcados = [0, 1, 2, 3].filter((i) =>
      screen.getByTestId(`slide-card-${i}`).className.includes('outline-[var(--studio-select)]')
    );
    expect(marcados).toEqual([1]);
  });

  it('usa outline e não border no ativo — o contorno não pode empurrar o layout', () => {
    montaDeck(3, 0, 'editorial');
    render(<SlideCanvas />);

    // 🔴 O passo da faixa (gap 18) é o mesmo para todos os cards. Se o contorno
    // virar `border`, o card ativo encolhe por dentro e a faixa anda.
    const cls = screen.getByTestId('slide-card-0').className;
    expect(cls).toContain('outline-2');
    expect(cls).not.toMatch(/\bborder-2\b/);
  });
});

describe('a faixa passa por baixo da barra lateral', () => {
  /**
   * A faixa deixou de ser cortada na borda da coluna de conteúdo: ela ocupa a
   * largura inteira e desliza POR BAIXO do painel. O que não pode regredir é o
   * estado inicial — com a rolagem no começo, o primeiro card continua na
   * mesma posição de sempre.
   *
   * jsdom não faz layout, então o teste trava a IDENTIDADE que produz isso: o
   * recuo negativo que leva o rolável até x=0 e o padding que devolve a coluna
   * têm que ser o mesmo número. Se um mudar sem o outro, o primeiro card sai
   * do lugar — e é exatamente aí que a regressão apareceria.
   */
  it('o recuo negativo da faixa e o padding do trilho se cancelam', () => {
    montaDeck(3, 0, 'editorial');
    const { container } = render(<SlideCanvas />);

    const rolavel = container.querySelector('.overflow-x-auto') as HTMLElement;
    // O trilho é o filho direto do rolável (o Droppable); o DragDropContext
    // não põe nó nenhum no DOM.
    const trilho = rolavel.firstElementChild as HTMLElement;
    const faixa = rolavel.parentElement as HTMLElement;

    const padTrilho = parseFloat(getComputedStyle(trilho).paddingLeft || '0');
    const margemFaixa = parseFloat(getComputedStyle(faixa).marginLeft || '0');

    expect(padTrilho).toBeGreaterThan(0);
    // Um anula o outro: card 1 fica onde sempre esteve com scrollLeft 0.
    expect(padTrilho).toBe(-margemFaixa);
  });

  it('a rolagem trata a área visível como começando na coluna de conteúdo', () => {
    montaDeck(3, 0, 'editorial');
    const { container } = render(<SlideCanvas />);

    const rolavel = container.querySelector('.overflow-x-auto') as HTMLElement;
    const trilho = rolavel.firstElementChild as HTMLElement;

    // 🔴 Sem isto o scrollIntoView pararia o card ativo embaixo do painel: para
    // a rolagem, "visível" tem que começar em 334, não em 0.
    const scrollPad = parseFloat(rolavel.style.scrollPaddingLeft || '0');
    expect(scrollPad).toBe(parseFloat(getComputedStyle(trilho).paddingLeft || '0'));
  });
});

/**
 * O grupo de controle do slide absorveu as setas soltas, o "+ Adicionar" e o
 * "Deletar" da barra da direita. O que estes testes travam é que as FUNÇÕES
 * vieram junto — principalmente o caminho especial do "+" nos templates de
 * forma fixa, que abre o popup de MODELO em vez de criar um slide genérico.
 */
describe('grupo de controle do slide', () => {
  it('o "+" adiciona direto nos estilos de forma livre', () => {
    montaDeck(3, 0, 'editorial');
    render(<SlideCanvas />);

    fireEvent.click(screen.getByLabelText('Adicionar slide'));
    expect(useEditorStore.getState().slides).toHaveLength(4);
  });

  it('o "+" abre o popup de MODELO no Template 1, sem criar slide direto', () => {
    montaDeckTemplate('template01');
    render(<SlideCanvas />);
    const antes = useEditorStore.getState().slides.length;

    fireEvent.click(screen.getByLabelText('Adicionar slide'));

    // 🔴 Nos templates de forma fixa o slide novo passa pela escolha de modelo.
    expect(useEditorStore.getState().slides).toHaveLength(antes);
    expect(screen.getByText('Escolha o modelo do slide')).toBeTruthy();
    expect(screen.getByText(/6 modelos do Template 1/)).toBeTruthy();
  });

  it('o "+" abre o popup de MODELO no Template 2, sem criar slide direto', () => {
    montaDeckTemplate('template02');
    render(<SlideCanvas />);
    const antes = useEditorStore.getState().slides.length;

    fireEvent.click(screen.getByLabelText('Adicionar slide'));

    expect(useEditorStore.getState().slides).toHaveLength(antes);
    expect(screen.getByText('Escolha o modelo do slide')).toBeTruthy();
  });

  it('a lixeira exclui o slide ATIVO', () => {
    montaDeck(3, 1, 'editorial');
    render(<SlideCanvas />);
    const idAtivo = useEditorStore.getState().slides[1].id;

    fireEvent.click(screen.getByLabelText('Excluir slide ativo'));

    const restantes = useEditorStore.getState().slides;
    expect(restantes).toHaveLength(2);
    expect(restantes.map((s) => s.id)).not.toContain(idAtivo);
  });

  it('a lixeira não deixa o deck sem slide', () => {
    montaDeck(1, 0, 'editorial');
    render(<SlideCanvas />);

    const lixeira = screen.getByLabelText('Excluir slide ativo') as HTMLButtonElement;
    expect(lixeira.disabled).toBe(true);

    fireEvent.click(lixeira);
    expect(useEditorStore.getState().slides).toHaveLength(1);
  });

  it('a lixeira do hover do card continua existindo — alcances diferentes', () => {
    montaDeck(3, 0, 'editorial');
    render(<SlideCanvas />);

    // A do grupo age no ativo; a do card age naquele card.
    expect(screen.getByLabelText('Excluir slide ativo')).toBeTruthy();
    expect(screen.getByLabelText('Excluir slide 3')).toBeTruthy();
  });

  it('o contador do grupo acompanha o slide ativo', () => {
    montaDeck(5, 2, 'editorial');
    render(<SlideCanvas />);
    expect(screen.getByTestId('slide-control-contador').textContent).toBe('Slide 3 de 5');
  });
});

describe('navegação slide a slide na barra superior', () => {
  const setas = () => ({
    anterior: screen.getByLabelText('Slide anterior') as HTMLButtonElement,
    proximo: screen.getByLabelText('Próximo slide') as HTMLButtonElement,
  });

  it('avança e volta um slide por clique', () => {
    montaDeck(5, 2, 'editorial');
    render(<SlideCanvas />);

    fireEvent.click(setas().proximo);
    expect(useEditorStore.getState().activeSlideIndex).toBe(3);

    fireEvent.click(setas().anterior);
    expect(useEditorStore.getState().activeSlideIndex).toBe(2);
  });

  it('desabilita "anterior" no primeiro slide', () => {
    montaDeck(5, 0, 'editorial');
    render(<SlideCanvas />);

    expect(setas().anterior.disabled).toBe(true);
    expect(setas().proximo.disabled).toBe(false);
  });

  it('desabilita "próximo" no último slide', () => {
    montaDeck(5, 4, 'editorial');
    render(<SlideCanvas />);

    expect(setas().anterior.disabled).toBe(false);
    expect(setas().proximo.disabled).toBe(true);
  });

  it('com um slide só, as duas pontas ficam desabilitadas', () => {
    montaDeck(1, 0, 'editorial');
    render(<SlideCanvas />);

    expect(setas().anterior.disabled).toBe(true);
    expect(setas().proximo.disabled).toBe(true);
  });

  it('não duplica o contador — ele já vive na barra de status', () => {
    montaDeck(5, 1, 'editorial');
    render(<SlideCanvas />);

    expect(screen.getByTestId('status-slide').textContent).toBe('Slide 2/5');
    expect(screen.queryAllByText('Slide 2/5')).toHaveLength(1);
  });
});

describe('reordenar e excluir continuam existindo', () => {
  it('mantém o botão de excluir por slide, mesmo fora do desenho', () => {
    montaDeck(3, 0, 'editorial');
    render(<SlideCanvas />);
    // O mock não mostra a lixeira; ela vive no hover do card e continua aqui.
    expect(screen.getByLabelText('Excluir slide 1')).toBeTruthy();
    expect(screen.getByLabelText('Excluir slide 3')).toBeTruthy();
  });
});

/**
 * A regressão mais provável desta fatia: a pele da linha mudou, e junto com ela
 * o cabeçalho de grupo ganhou um slot novo (a pílula "Voltar"). Se algo disso
 * fixar seis linhas ou perder um grupo, é aqui que estoura.
 */
describe('a barra lateral continua orientada a dado', () => {
  const CTX_BASE = {
    slide: { ...DEFAULT_SLIDE } as Slide,
    activeSlideIndex: 0,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    template01Model: 1,
    template02Model: 1,
    isEditorialCover: false,
  };

  const ESTILOS = Object.keys(TEMPLATE_SIDEBAR_CONFIG) as SlideStyle[];

  it.each(ESTILOS)('monta os painéis configurados para %s', (style) => {
    montaDeck(6, 0, style);
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    const ctx = { ...CTX_BASE, style };
    const esperados = visiblePanels(ctx).flatMap((g) => g.ids);

    // Não é "seis linhas": é exatamente o que a config declara, na quantidade
    // que ela declara.
    expect(esperados.length).toBeGreaterThan(0);
    for (const id of esperados) {
      expect(document.querySelector(`[data-panel="${id}"]`)).toBeTruthy();
    }
    expect(document.querySelectorAll('[data-panel]').length).toBe(esperados.length);
  });

  it.each(ESTILOS)('abre com TODOS os painéis fechados em %s', (style) => {
    montaDeck(6, 0, style);
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    // Nenhum painel nasce aberto, em nenhum template — como no desenho.
    const abertos = [...document.querySelectorAll('[data-panel] button[aria-expanded="true"]')];
    expect(abertos.map((b) => b.closest('[data-panel]')?.getAttribute('data-panel'))).toEqual([]);
  });

  /**
   * A abertura passou a ser animada (linha de grid de 0fr a 1fr). O risco da
   * técnica é manter o corpo no DOM para ter o que animar — aí o conteúdo
   * fechado continuaria alcançável por Tab e por leitor de tela.
   *
   * Aqui o corpo fechado NÃO existe: ele só monta ao abrir e é desmontado
   * depois que o fechamento termina. Estes testes travam a intenção — conteúdo
   * fechado não existe para o usuário — independente da técnica de animação.
   */
  it('o corpo do painel fechado não está no DOM nem é focável', () => {
    montaDeck(6, 0, 'editorial');
    const { container } = render(
      <EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />,
    );

    const painel = container.querySelector('[data-panel="textoDoSlide"]') as HTMLElement;
    const focaveis = painel.querySelectorAll('input, textarea, select, button, [tabindex]');

    // Só o cabeçalho é focável enquanto o painel está fechado.
    expect(focaveis).toHaveLength(1);
    expect(focaveis[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('abrir monta o corpo; fechar desmonta quando a animação termina', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      montaDeck(6, 0, 'editorial');
      const { container } = render(
        <EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />,
      );
      const painel = () => container.querySelector('[data-panel="textoDoSlide"]') as HTMLElement;
      const campos = () =>
        painel().querySelectorAll('input, textarea, select, button, [tabindex]').length;

      fireEvent.click(screen.getByText('Texto do slide'));
      expect(campos()).toBeGreaterThan(1);

      fireEvent.click(screen.getByText('Texto do slide'));
      // Durante o fechamento o corpo ainda existe — é o que a animação percorre.
      expect(campos()).toBeGreaterThan(1);

      await act(async () => { vi.advanceTimersByTime(400); });

      // Terminada a animação, o conteúdo deixa de existir para o usuário.
      expect(campos()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('anima propriedades declaradas uma a uma, nunca `transition-all`', () => {
    montaDeck(6, 0, 'editorial');
    const { container } = render(
      <EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Texto do slide'));

    const corpos = [...container.querySelectorAll('.studio-panel-body')] as HTMLElement[];
    expect(corpos.length).toBeGreaterThan(0);
    expect(corpos[0].className).toContain('transition-[grid-template-rows]');

    // 🔴 Nos elementos que ESTA fatia anima, a propriedade é declarada uma a
    // uma. `transition-all` aqui poria altura e largura na animação — foi
    // exatamente assim que o card da faixa ficou preso num tamanho velho.
    // (Controles DENTRO do painel têm transições próprias de hover e não são
    // alvo desta regra: o que muda de tamanho na abertura é o wrapper.)
    const chevron = container.querySelector('[data-panel] svg.lucide-chevron-right');
    for (const el of [...corpos, chevron].filter(Boolean) as Element[]) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/\btransition-all\b/);
    }
  });

  it('o clique continua abrindo e fechando o painel', () => {
    montaDeck(6, 0, 'editorial');
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    const botao = screen.getByText('Texto do slide').closest('button') as HTMLButtonElement;
    expect(botao.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('false');
  });

  it('preserva os rótulos do registry — a pele não renomeia painel', () => {
    montaDeck(6, 0, 'editorial');
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    const ctx = { ...CTX_BASE, style: 'editorial' as SlideStyle };
    for (const id of visiblePanels(ctx).flatMap((g) => g.ids)) {
      expect(screen.getByText(panelLabel(id, ctx))).toBeTruthy();
    }
  });

  it('mantém os grupos separados por escopo do Editorial (slide + global)', () => {
    montaDeck(6, 0, 'editorial');
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    // O grupo global perdeu o RÓTULO, não os painéis: "Cantos" é o painel dele
    // e continua na lista. Se o redesenho comer um grupo, ele some sem quebrar
    // mais nada — e é isso que este teste protege.
    expect(screen.getByText('Cantos')).toBeTruthy();
    expect(screen.getByText('Conteúdo')).toBeTruthy();
  });

  it('não mostra mais o rótulo "Estilo global" na lista', () => {
    for (const style of ['editorial', 'minimalist'] as SlideStyle[]) {
      montaDeck(6, 0, style);
      render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
      expect(screen.queryByText(/estilo global/i), style).toBeNull();
      cleanup();
    }
  });

  /**
   * 🔴 A regressão mais provável desta leva: "CONTEÚDO — SLIDE 01" sai do MESMO
   * componente de escopo que o "Estilo global" removido. No Profile ele nem é a
   * linha do topo — é o cabeçalho do SEGUNDO grupo, no corpo da lista.
   */
  it('preserva "CONTEÚDO — SLIDE 01" em todos os estilos', () => {
    for (const style of Object.keys(TEMPLATE_SIDEBAR_CONFIG) as SlideStyle[]) {
      montaDeck(6, 0, style);
      render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
      expect(screen.getByText('Conteúdo'), style).toBeTruthy();
      expect(screen.getByText('SLIDE 01'), style).toBeTruthy();
      cleanup();
    }
  });

  /**
   * A linha ficava 13px mais estreita que o rodapé quando a lista rolava — e em
   * 1280x720 a lista JÁ rola com todos os painéis fechados, então o estado
   * desalinhado era o normal no notebook, não a exceção.
   *
   * Em jsdom não há layout de verdade, então o que dá para travar é a REGRA que
   * produz o alinhamento: a canaleta é reservada sempre e a margem da linha
   * desconta exatamente ela. É isso que faz a largura não depender de estar
   * rolando ou não.
   */
  it('linha e rodapé têm a MESMA borda esquerda e a MESMA borda direita', () => {
    montaDeck(6, 0, 'editorial');
    const { container } = render(
      <EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />,
    );

    /**
     * jsdom não faz layout, então as bordas são DERIVADAS dos números que as
     * produzem — e comparadas como bordas, não como mecanismo.
     *
     * A versão anterior deste teste checava o mecanismo ("tem ml-13", "não tem
     * mr") e passou com a linha em 270 contra 259 do rodapé. Checar o meio não
     * prova o fim: o que tem que bater é x e a borda direita.
     */
    const px = (cls: string, re: RegExp): number => {
      const m = cls.match(re);
      if (!m) throw new Error(`não achei ${re} em: ${cls}`);
      return Number(m[1]);
    };

    const aside = container.querySelector('aside') as HTMLElement;
    const painelW = px(aside.className, /\bw-\[(\d+)px\]/);

    const linha = container.querySelector('[data-panel]') as HTMLElement;
    const linhaX = px(linha.className, /\bml-\[(\d+)px\]/);
    const linhaW = px(linha.className, /\bw-\[(\d+)px\]/);
    // Margem à direita entraria na conta e é justamente um dos jeitos de errar.
    expect(linha.className, 'linha não pode ter margem à direita').not.toMatch(/\bmr-/);

    const rodape = screen.getByText(/Baixar Slide/).closest('div') as HTMLElement;
    const rodapeX = px(rodape.className, /\bpx-\[(\d+)px\]/);

    // Geometria do desenho: painel 285, inset 13 dos dois lados.
    expect(painelW).toBe(285);
    expect(linhaX).toBe(13);
    expect(rodapeX).toBe(13);

    // O que o Rafael mede na tela: mesma borda esquerda…
    expect(linhaX).toBe(rodapeX);
    // …e mesma borda direita. 13 + 259 = 285 − 13 = 272.
    const linhaDir = linhaX + linhaW;
    const rodapeDir = painelW - rodapeX;
    expect(linhaDir).toBe(rodapeDir);
    expect(linhaW).toBe(painelW - 2 * rodapeX);
  });

  it('a largura da linha não depende da barra de rolagem', () => {
    montaDeck(6, 0, 'editorial');
    const { container } = render(
      <EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />,
    );

    // 🔴 Barra sobreposta (sem canaleta) e barra clássica (com canaleta) dão
    // larguras de conteúdo diferentes. Com largura fixa a linha ignora as duas
    // — foi por depender delas que este número errou para os dois lados.
    const linha = container.querySelector('[data-panel]') as HTMLElement;
    expect(linha.className).toMatch(/\bw-\[\d+px\]/);
    expect(linha.className).not.toMatch(/w-full|flex-1|w-auto/);
  });

  it('mostra a pílula de voltar ao Dashboard uma única vez', () => {
    montaDeck(6, 0, 'editorial');
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    // O Editorial tem DOIS grupos; a pílula é do primeiro, não de cada um.
    // Texto visível é curto ("Dashboard") para caber ao lado do rótulo do
    // escopo; a frase inteira fica no aria-label, e é por ela que se procura.
    expect(screen.getAllByLabelText('Voltar para Dashboard')).toHaveLength(1);
  });
});
