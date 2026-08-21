// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

/**
 * A entrada do Roadmap na barra do produto.
 *
 * Arquivo separado do `roadmap-tela.test.tsx` porque montar a `AppSidebar` exige
 * mockar navegação, tema, créditos e supabase — ruído que não tem nada a ver com
 * o quadro. Mesmo conjunto de mocks de `admin-atalho-sidebar.test.tsx`.
 */

const { mockFetchCredits } = vi.hoisted(() => ({ mockFetchCredits: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/roadmap',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useCreditsStore', () => ({
  useCreditsStore: (selector: (s: unknown) => unknown) =>
    selector({ balance: 0, fetch: mockFetchCredits }),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: { user: { id: 'u1', email: 'cliente@exemplo.com', user_metadata: { name: 'Cliente' } } } },
        }),
      signOut: () => Promise.resolve({}),
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

async function renderSidebar() {
  const { default: AppSidebar } = await import('../components/ui/AppSidebar');
  const view = render(<AppSidebar />);
  await waitFor(() => expect(screen.getByText('Cliente')).toBeTruthy());
  return view;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Roadmap na navegação', () => {
  it('tem item apontando para /roadmap', async () => {
    await renderSidebar();
    const link = screen.getByRole('link', { name: /roadmap/i });
    expect(link.getAttribute('href')).toBe('/roadmap');
  });

  /**
   * O ÚLTIMO da lista, depois de Configurações — ordem pedida pelo Rafael
   * (21/08). Antes ele ficava entre Agenda e Onboarding.
   */
  it('é o último item da navegação, depois de Configurações', async () => {
    await renderSidebar();
    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => !!h);

    expect(hrefs.indexOf('/roadmap')).toBeGreaterThan(hrefs.indexOf('/configuracoes'));
    expect(hrefs.indexOf('/roadmap')).toBeGreaterThan(hrefs.indexOf('/onboarding'));
    expect(hrefs.indexOf('/roadmap')).toBeGreaterThan(hrefs.indexOf('/agenda'));
  });

  it('leva um ícone, como todos os outros itens', async () => {
    await renderSidebar();
    const link = screen.getByRole('link', { name: /roadmap/i });
    expect(link.querySelector('svg')).toBeTruthy();
  });
});
