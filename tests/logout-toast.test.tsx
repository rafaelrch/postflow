// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockReplace, mockRefresh, mockSignOut, mockToastPromise } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
  mockSignOut: vi.fn(),
  mockToastPromise: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useCreditsStore', () => ({
  useCreditsStore: (selector: (state: unknown) => unknown) =>
    selector({ balance: 0, fetch: vi.fn() }),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: mockSignOut,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: { promise: mockToastPromise },
}));

describe('logout com toast', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('aciona o logout com toast sem competir com o redirect do AuthProvider', async () => {
    let resolveToast: (() => void) | undefined;
    const logout = Promise.resolve({ error: null });
    mockSignOut.mockReturnValue(logout);
    mockToastPromise.mockReturnValue(new Promise<void>((resolve) => {
      resolveToast = resolve;
    }));

    const { default: AppSidebar } = await import('../components/ui/AppSidebar');
    render(<AppSidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(mockToastPromise).toHaveBeenCalledTimes(1));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockToastPromise.mock.calls[0]?.[0]).toBe(logout);
    expect(mockToastPromise.mock.calls[0]?.[1]).toMatchObject({
      loading: { title: 'Saindo...' },
      success: { title: 'Sessão encerrada' },
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();

    resolveToast?.();
    await waitFor(() => expect(mockToastPromise).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
