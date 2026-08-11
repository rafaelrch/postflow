// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  saveNow: vi.fn(async () => undefined),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => key === 'id' ? 'carousel-1' : null }),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: mocks.maybeSingle,
    };
    return { from: () => query };
  },
}));

vi.mock('@/hooks/useAutoSave', () => ({ useAutoSave: () => ({ saveNow: mocks.saveNow }) }));
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.maybeSingle.mockReset();
  useEditorStore.setState({ slides: [], activeSlideIndex: 0, carouselId: null });
});
afterEach(cleanup);

describe('abertura de carrossel salvo', () => {
  it('mantém um loading estável e só monta o editor depois dos slides', async () => {
    const request = deferred<{ data: Record<string, unknown>; error: null }>();
    mocks.maybeSingle.mockReturnValue(request.promise);

    render(<GeneratorClient />);
    expect(screen.getByRole('status', { name: 'Carregando carrossel' })).toBeTruthy();
    expect(screen.queryByText('canvas do editor')).toBeNull();

    request.resolve({
      data: {
        id: 'carousel-1',
        title: 'Carrossel salvo',
        style: 'template01',
        theme: 'light',
        font_pair: 'SF Pro Display + IvyOra Text',
        accent_color: '#00CFFF',
        slides: [{ id: 'slide-1', position: 0, title: 'Conteúdo salvo' }],
      },
      error: null,
    });

    await waitFor(() => expect(screen.getByText('canvas do editor')).toBeTruthy());
    expect(screen.queryByRole('status', { name: 'Carregando carrossel' })).toBeNull();
    expect(useEditorStore.getState().slides[0].title).toBe('Conteúdo salvo');
  });

  it('não troca o loading por um editor vazio quando o banco devolve zero slides', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'carousel-1',
        title: 'Cópia incompleta',
        style: 'template01',
        slides: [],
      },
      error: null,
    });

    render(<GeneratorClient />);
    await waitFor(() => expect(screen.getByText('Não foi possível abrir')).toBeTruthy());
    expect(screen.queryByText('canvas do editor')).toBeNull();
    expect(screen.getByText('Este carrossel não possui slides salvos.')).toBeTruthy();
  });
});

/**
 * O F5 no editor caía em "Carrossel não encontrado" para qualquer desfecho que
 * não fosse sucesso — inclusive quando o carrossel existe e só a leitura falhou.
 * Aqui os dois lados ficam separados NA TELA, que é onde o usuário vê.
 */
describe('falha de carga: ausência e indisponibilidade são telas diferentes', () => {
  it('quando a query responde que não há nada, diz "não encontrado" e NÃO oferece tentar de novo', async () => {
    // `maybeSingle` devolve linha ausente como data:null SEM erro.
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    render(<GeneratorClient />);
    await waitFor(() => expect(screen.getByText('Carrossel não encontrado.')).toBeTruthy());

    expect(screen.getByText('Não foi possível abrir')).toBeTruthy();
    // Repetir a leitura de algo que de fato não existe é uma porta que não abre.
    expect(screen.queryByText('Tentar de novo')).toBeNull();
    expect(screen.getByText('Voltar aos carrosséis')).toBeTruthy();
  });

  it('quando a leitura FALHA, não afirma que sumiu — e oferece tentar de novo', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'network' } });

    render(<GeneratorClient />);
    await waitFor(() => expect(screen.getByText('Não foi possível carregar agora')).toBeTruthy());

    // 🔴 O ponto do defeito: falha NÃO pode ser dita como ausência.
    expect(screen.queryByText('Carrossel não encontrado.')).toBeNull();
    expect(screen.getByText(/não foi perdido/i)).toBeTruthy();
    expect(screen.getByText('Tentar de novo')).toBeTruthy();
  });

  it('"Tentar de novo" refaz a leitura e abre o editor quando ela vai bem', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'network' } });

    render(<GeneratorClient />);
    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeTruthy());

    // A segunda leitura responde — e é o usuário quem pede, não um laço cego.
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'carousel-1',
        title: 'Carrossel salvo',
        style: 'template01',
        slides: [{ id: 'slide-1', position: 0, title: 'Conteúdo salvo' }],
      },
      error: null,
    });
    fireEvent.click(screen.getByText('Tentar de novo'));

    await waitFor(() => expect(screen.getByText('canvas do editor')).toBeTruthy());
  });

  it('usa o updated_at do banco como horário do último save', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'carousel-1',
        title: 'Carrossel salvo',
        style: 'template01',
        updated_at: '2026-01-15T14:35:00.000Z',
        slides: [{ id: 'slide-1', position: 0, title: 'Conteúdo salvo' }],
      },
      error: null,
    });

    render(<GeneratorClient />);
    await waitFor(() => expect(screen.getByText('canvas do editor')).toBeTruthy());

    // Sem isto a barra de status abria "Salvo" sem hora até o primeiro save
    // da sessão — e a hora existia, só não chegava até lá.
    expect(useEditorStore.getState().lastSavedAt).toBe(
      new Date('2026-01-15T14:35:00.000Z').getTime(),
    );
  });

  it('data ilegível não vira "Invalid Date" na barra de status', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'carousel-1',
        title: 'Carrossel salvo',
        style: 'template01',
        updated_at: 'nao-e-data',
        slides: [{ id: 'slide-1', position: 0, title: 'Conteúdo salvo' }],
      },
      error: null,
    });

    render(<GeneratorClient />);
    await waitFor(() => expect(screen.getByText('canvas do editor')).toBeTruthy());
    expect(useEditorStore.getState().lastSavedAt).toBeNull();
  });
});
