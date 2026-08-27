// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

/**
 * A CORRIDA DO AUTOSAVE — o editor piscava "não possui slides salvos" por cima
 * de um deck que estava ali, inteiro.
 *
 * A sequência do defeito, toda dentro do PRIMEIRO save:
 *   1. `useAutoSave` faz o INSERT em `carousels` e troca a URL para `?id=`
 *      ANTES de gravar os slides.
 *   2. O `useSearchParams` da página vê um id — e a página nunca CARREGOU esse
 *      deck (ele nasceu em memória), então `loadedCarouselId` é null e o estado
 *      vira 'loading'.
 *   3. A releitura volta com 0 slides (ainda não gravados) e cai no desfecho
 *      `sortedSlides.length === 0`, que não é transiente: nem retry sobra.
 *
 * Nada se perdia — recarregar a mesma URL abria certo —, mas o usuário via uma
 * tela de erro no meio da primeira frase que digitou.
 *
 * O conserto fecha a corrida na ORIGEM: quem acabou de criar o carrossel já tem
 * o deck em memória, então o id nasce marcado como carregado e a releitura nem
 * começa. Adiar o `replaceState` para depois dos slides só estreitaria a
 * janela — o insert dos slides pode falhar ou demorar do mesmo jeito.
 */

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  carouselInsert: vi.fn(),
  carouselUpdate: vi.fn(),
  slidesDelete: vi.fn(),
  slidesInsert: vi.fn(),
  getUser: vi.fn(),
  /** O `?id=` que a página enxerga. O replaceState do hook mexe nele. */
  idParam: { value: null as string | null },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? mocks.idParam.value : null) }),
  useRouter: () => ({ replace: vi.fn() }),
}));

/**
 * Supabase de mentira, por tabela — o `useAutoSave` entra de VERDADE neste
 * teste. É o único jeito de provar a corrida: ela mora na ordem entre o insert
 * do carrossel, a troca da URL e o insert dos slides.
 */
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'slides') {
        return {
          delete: () => ({ eq: mocks.slidesDelete }),
          insert: mocks.slidesInsert,
        };
      }
      const leitura = {
        select: () => leitura,
        eq: () => leitura,
        maybeSingle: mocks.maybeSingle,
      };
      return {
        ...leitura,
        insert: () => ({ select: () => ({ single: mocks.carouselInsert }) }),
        update: () => ({ eq: mocks.carouselUpdate }),
      };
    },
  }),
}));

vi.mock('@/hooks/useExport', () => ({
  useExport: () => ({ registerSlideRef: vi.fn(), downloadSlide: vi.fn(), downloadAll: vi.fn() }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/editor/EditorSidebar', () => ({ default: () => <div>barra do editor</div> }));
vi.mock('@/components/editor/SlideCanvas', () => ({ default: () => <div>canvas do editor</div> }));
vi.mock('@/components/editor/HiddenSlides', () => ({ default: () => null }));
vi.mock('@/components/editor/CreateWizard', () => ({ default: () => null }));
vi.mock('@/components/editor/ScheduleModal', () => ({ default: () => null }));

import GeneratorClient from '@/app/(app)/generator/GeneratorClient';

const NOVO_ID = 'carrossel-recem-criado';

function slide(i: number): Slide {
  return { ...DEFAULT_SLIDE, id: `s${i}`, position: i, title: `Slide ${i + 1}` } as Slide;
}

/** Linha de `carousels` como o select devolve, com os slides embutidos. */
function linhaDoBanco(slides: Record<string, unknown>[]) {
  return {
    data: {
      id: NOVO_ID,
      title: 'Deck',
      style: 'editorial',
      slides,
      caption: '',
      hashtags: [],
      updated_at: new Date().toISOString(),
      ...DEFAULT_GLOBAL_SETTINGS,
    },
    error: null,
  };
}

function linhaDeSlide(position: number) {
  return { id: `db-${position}`, position, title: `Slide ${position + 1}`, description: '' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.idParam.value = null;
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mocks.carouselInsert.mockResolvedValue({ data: { id: NOVO_ID }, error: null });
  mocks.carouselUpdate.mockResolvedValue({ error: null });
  mocks.slidesDelete.mockResolvedValue({ error: null });
  mocks.slidesInsert.mockResolvedValue({ error: null });
  useEditorStore.setState({
    carouselId: null,
    slides: [],
    activeSlideIndex: 0,
    saveStatus: 'saved',
    history: [],
    historyIndex: -1,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('criar → digitar → autosave', () => {
  it('NÃO cai na tela de erro quando o primeiro save troca a URL', async () => {
    // O deck existe só em memória: foi criado na tela, nunca foi lido do banco.
    useEditorStore.setState({ carouselId: null, slides: [slide(0), slide(1)] });

    // A releitura, SE acontecer, pega o carrossel sem slides — é exatamente a
    // janela entre o INSERT do carrossel e o INSERT dos slides.
    mocks.maybeSingle.mockResolvedValue(linhaDoBanco([]));

    const { rerender } = render(<GeneratorClient />);
    expect(screen.getByText('canvas do editor')).toBeTruthy();

    // O replaceState do hook é o gatilho real: no Next ele sincroniza com o
    // `useSearchParams` (docs: shallow routing on the client). Aqui a troca da
    // URL vira a troca do param, e o rerender é o render que ela provocaria.
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(((
      _s: unknown, _t: string, url?: string | URL | null,
    ) => {
      const id = String(url ?? '').split('id=')[1];
      if (id) mocks.idParam.value = id;
    }) as typeof window.history.replaceState);

    // Digitar: a store vira 'unsaved' e o autosave dispara 2,5s depois.
    await vi.waitFor(() => expect(true).toBe(true));
    useEditorStore.getState().updateSlide(0, { title: 'Primeira frase que eu digitei' });

    await waitFor(() => expect(replace).toHaveBeenCalled(), { timeout: 4000 });
    rerender(<GeneratorClient />);

    // 🔴 O ponto do teste: o editor continua na tela.
    expect(screen.queryByTestId('generator-load-error')).toBeNull();
    expect(screen.getByText('canvas do editor')).toBeTruthy();
    expect(useEditorStore.getState().slides).toHaveLength(2);

    // E a releitura nem chegou a acontecer: quem acabou de criar o carrossel já
    // tem o deck em memória. Fechar a corrida na origem é isto.
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  }, 10000);
});

describe('os desfechos que já existiam continuam de pé', () => {
  it('abrir por URL um carrossel VAZIO de verdade cai no desfecho dele', async () => {
    mocks.idParam.value = NOVO_ID;
    mocks.maybeSingle.mockResolvedValue(linhaDoBanco([]));

    render(<GeneratorClient />);

    const erro = await screen.findByTestId('generator-load-error');
    expect(erro.textContent).toContain('Este carrossel não possui slides salvos.');
    // Não é transiente: repetir a leitura não faria slides aparecerem.
    expect(screen.queryByText('Tentar de novo')).toBeNull();
    expect(screen.getByText('Voltar aos carrosséis')).toBeTruthy();
  });

  it('abrir por URL um carrossel COM slides carrega o editor', async () => {
    mocks.idParam.value = NOVO_ID;
    mocks.maybeSingle.mockResolvedValue(linhaDoBanco([linhaDeSlide(0), linhaDeSlide(1)]));

    render(<GeneratorClient />);

    await waitFor(() => expect(screen.getByText('canvas do editor')).toBeTruthy());
    expect(screen.queryByTestId('generator-load-error')).toBeNull();
    expect(useEditorStore.getState().slides).toHaveLength(2);
  });

  it('trocar de id pela URL sem desmontar entra em loading, sem frame do deck velho', async () => {
    mocks.idParam.value = 'deck-antigo';
    mocks.maybeSingle.mockResolvedValue(linhaDoBanco([linhaDeSlide(0)]));

    const { rerender } = render(<GeneratorClient />);
    await waitFor(() => expect(screen.getByText('canvas do editor')).toBeTruthy());

    // Troca de carrossel pela URL, com a rota montada.
    mocks.idParam.value = 'deck-novo';
    rerender(<GeneratorClient />);

    // O loading entra JÁ no primeiro render: nada do deck velho pisca.
    expect(screen.getByRole('status', { name: 'Carregando carrossel' })).toBeTruthy();
    expect(screen.queryByText('canvas do editor')).toBeNull();
  });

  it('a leitura é pulada só para o deck que já está em memória, nunca para outro id', async () => {
    mocks.idParam.value = 'deck-antigo';
    mocks.maybeSingle.mockResolvedValue(linhaDoBanco([linhaDeSlide(0)]));

    const { rerender } = render(<GeneratorClient />);
    await waitFor(() => expect(screen.getByText('canvas do editor')).toBeTruthy());
    const leiturasAteAqui = mocks.maybeSingle.mock.calls.length;

    mocks.idParam.value = 'deck-novo';
    rerender(<GeneratorClient />);

    // O id mudou: a guarda não pode engolir a carga do carrossel novo.
    await waitFor(() =>
      expect(mocks.maybeSingle.mock.calls.length).toBeGreaterThan(leiturasAteAqui)
    );
  });
});
