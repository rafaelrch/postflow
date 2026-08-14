// @vitest-environment jsdom
/**
 * Os caminhos que levam às Configurações e à recuperação de senha.
 *
 * A sidebar tinha DOIS links para /conta — o item de navegação e o badge do
 * rodapé com nome/e-mail. Migrar a página e esquecer um deles deixaria um
 * caminho apontando para um redirect (hoje) ou para lugar nenhum (amanhã).
 *
 * E o link de "esqueci minha senha": sem ele a tela de recuperação existe mas é
 * inalcançável — cliente que paga e esquece a senha continua trancado do lado
 * de fora, que é o problema que a Fase 17 foi resolver.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { mockPathname, mockGetSession, mockFrom, mockSignOut } = vi.hoisted(() => ({
  mockPathname: vi.fn(() => '/dashboard'),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getSession: mockGetSession, signOut: mockSignOut },
    from: mockFrom,
  }),
}));

beforeEach(() => {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'u1', email: 'cliente@example.com' } } },
  });
  // A sidebar busca o perfil com .single(); devolver vazio basta — o que se
  // testa aqui são os LINKS, não o nome exibido.
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null }),
        maybeSingle: async () => ({ data: null }),
      }),
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('sidebar', () => {
  async function renderSidebar() {
    const { default: AppSidebar } = await import('../components/ui/AppSidebar');
    return render(<AppSidebar />);
  }

  it('o item de navegação virou "Configurações" e aponta para lá', async () => {
    const screen = await renderSidebar();

    const item = screen.container.querySelector('a[href="/configuracoes"]');
    expect(item).toBeTruthy();
    expect(item?.textContent).toContain('Configurações');
    // O item antigo não pode continuar existindo com o rótulo velho.
    expect(screen.queryByText('Assinatura')).toBeNull();
  });

  it('o badge do rodapé também saiu de /conta — vai para a aba Conta', async () => {
    const screen = await renderSidebar();

    expect(screen.container.querySelector('a[href="/configuracoes/conta"]')).toBeTruthy();
    // NENHUM link para o endereço antigo continua na sidebar.
    expect(screen.container.querySelector('a[href="/conta"]')).toBeNull();
  });
});

describe('login', () => {
  it('oferece "Esqueci minha senha", apontando para a tela de recuperação', async () => {
    const { default: AuthForm } = await import('../components/auth/AuthForm');
    const screen = render(<AuthForm mode="login" />);

    const link = screen.getByTestId('esqueci-minha-senha');
    expect(link.getAttribute('href')).toBe('/recuperar-senha');
  });

  it('o cadastro NÃO oferece — ali a conta ainda não existe', async () => {
    const { default: AuthForm } = await import('../components/auth/AuthForm');
    const screen = render(<AuthForm mode="signup" signupToken="t" lockedEmail="x@y.com" />);

    expect(screen.queryByTestId('esqueci-minha-senha')).toBeNull();
  });
});
