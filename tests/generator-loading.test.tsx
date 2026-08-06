// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEditorStore } from '@/hooks/useEditorStore';

const mocks = vi.hoisted(() => ({
  single: vi.fn(),
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
      single: mocks.single,
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
  mocks.single.mockReset();
  useEditorStore.setState({ slides: [], activeSlideIndex: 0, carouselId: null });
});
afterEach(cleanup);

describe('abertura de carrossel salvo', () => {
  it('mantém um loading estável e só monta o editor depois dos slides', async () => {
    const request = deferred<{ data: Record<string, unknown>; error: null }>();
    mocks.single.mockReturnValue(request.promise);

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
    mocks.single.mockResolvedValue({
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
