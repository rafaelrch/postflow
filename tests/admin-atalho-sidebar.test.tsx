// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

/**
 * ATALHO PARA O /admin NA BARRA DO PRODUTO.
 *
 * O que este arquivo prova, e por quê:
 *
 *   1. O item só existe para admin — e para o usuário comum ele não aparece NEM
 *      NO HTML. Renderizar escondido com CSS deixaria o href no documento; não
 *      seria brecha de acesso (o servidor protege /admin), mas anunciaria a
 *      existência do painel para quem não precisa saber dele.
 *   2. A decisão vem de FORA, por prop, calculada no servidor. A barra não
 *      consulta allowlist nenhuma — se consultasse, `ADMIN_EMAILS` teria que
 *      virar bundle do cliente.
 *   3. Sem a prop, nada aparece: o default fecha.
 *
 * O que este arquivo NÃO prova, porque não é o papel dele: que /admin está
 * protegido. Isso é tests/admin-pagina-guarda.test.ts, e é lá que mora o
 * controle de acesso de verdade. Esconder link é conveniência.
 */

const { mockFetchCredits } = vi.hoisted(() => ({ mockFetchCredits: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
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

async function renderSidebar(props: { isAdmin?: boolean }) {
  const { default: AppSidebar } = await import('../components/ui/AppSidebar');
  const view = render(<AppSidebar {...props} />);
  // A barra carrega identidade num efeito assíncrono; espera o badge assentar
  // para que o HTML inspecionado seja o final, e não o do primeiro paint.
  await waitFor(() => expect(screen.getByText('Cliente')).toBeTruthy());
  return view;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('atalho para o painel administrativo', () => {
  it('admin vê o item apontando para /admin', async () => {
    const { container } = await renderSidebar({ isAdmin: true });

    const link = screen.getByTestId('sidebar-admin-link');
    expect(link.getAttribute('href')).toBe('/admin');
    expect(container.innerHTML).toContain('/admin');
  });

  it('usuário comum não recebe o item nem o href no HTML renderizado', async () => {
    const { container } = await renderSidebar({ isAdmin: false });

    expect(screen.queryByTestId('sidebar-admin-link')).toBeNull();
    expect(container.innerHTML).not.toContain('/admin');
  });

  it('sem a prop, o atalho não aparece — o default fecha', async () => {
    const { container } = await renderSidebar({});

    expect(screen.queryByTestId('sidebar-admin-link')).toBeNull();
    expect(container.innerHTML).not.toContain('/admin');
  });

  it('a barra não consulta allowlist: ADMIN_EMAILS não é lido no cliente', async () => {
    // Se a decisão fosse tomada aqui dentro, esta env teria que existir no
    // browser — e a única forma de existir no browser é NEXT_PUBLIC_, que
    // publicaria o e-mail do dono no bundle.
    process.env.ADMIN_EMAILS = 'rafaelrocha250304@gmail.com';
    const { container } = await renderSidebar({ isAdmin: false });

    expect(container.innerHTML).not.toContain('rafaelrocha250304@gmail.com');
    expect(screen.queryByTestId('sidebar-admin-link')).toBeNull();
    delete process.env.ADMIN_EMAILS;
  });
});
