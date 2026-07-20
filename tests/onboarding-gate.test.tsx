// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

/**
 * Etapa 4 do fluxo de cadastro: depois do callback trocar o code por sessão,
 * quem ainda não completou o onboarding é mandado pro /onboarding.
 *
 * A decisão vive em components/AuthProvider.tsx:29-40 (client component) —
 * as etapas server-side do fluxo estão em tests/auth-signup-flow.test.ts.
 */

const { mockReplace, mockGetSession, mockOnAuthStateChange, mockSingle } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getSession: mockGetSession, onAuthStateChange: mockOnAuthStateChange },
    from: () => ({ select: () => ({ eq: () => ({ single: mockSingle }) }) }),
  }),
}));

const SESSION = { user: { id: 'user-novo-123', email: 'novo@example.com' } };

/**
 * AuthProvider guarda `onboardingChecked` num `let` de nível de módulo
 * (AuthProvider.tsx:12), que sobrevive entre testes e faria o 2º caso passar
 * sem exercitar nada. Reimportar o módulo zera esse estado.
 */
async function renderAuthProvider() {
  vi.resetModules();
  const { default: AuthProvider } = await import('../components/AuthProvider');
  return render(<AuthProvider>conteúdo protegido</AuthProvider>);
}

beforeEach(() => {
  window.history.replaceState({}, '', '/dashboard');
  mockGetSession.mockResolvedValue({ data: { session: SESSION } });
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthProvider — gate de onboarding_completed', () => {
  it('manda pro /onboarding quem tem sessão mas ainda não completou o onboarding', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false } });

    await renderAuthProvider();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'));
  });

  it('deixa seguir pro destino quem já completou o onboarding', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: true } });

    await renderAuthProvider();

    await waitFor(() => expect(mockSingle).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('manda pro /onboarding quando o profile ainda não existe (linha de corrida do trigger)', async () => {
    mockSingle.mockResolvedValue({ data: null });

    await renderAuthProvider();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'));
  });

  it('não consulta profiles nem redireciona quando já se está em /onboarding', async () => {
    window.history.replaceState({}, '', '/onboarding');
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false } });

    await renderAuthProvider();

    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(mockSingle).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('checa de novo quando OUTRO usuário loga na mesma aba (flag é por usuário, não por aba)', async () => {
    // Sem vi.resetModules() entre as duas renderizações: é justamente o estado
    // de módulo sobrevivente que reproduz a aba real. Com a flag booleana
    // antiga, a segunda checagem nunca rodava e o usuário B entrava direto.
    vi.resetModules();
    const { default: AuthProvider } = await import('../components/AuthProvider');

    // Usuário A — já completou o onboarding.
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    mockSingle.mockResolvedValue({ data: { onboarding_completed: true } });

    const primeira = render(<AuthProvider>conteúdo protegido</AuthProvider>);
    await waitFor(() => expect(mockSingle).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
    primeira.unmount();

    // Usuário B, mesma aba — ainda NÃO completou.
    const OUTRO_USUARIO = { user: { id: 'user-outro-999', email: 'outro@example.com' } };
    mockGetSession.mockResolvedValue({ data: { session: OUTRO_USUARIO } });
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false } });

    render(<AuthProvider>conteúdo protegido</AuthProvider>);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'));
    expect(mockSingle).toHaveBeenCalledTimes(2);
  });

  it('não repete a checagem do MESMO usuário em remontagens (evita round-trip por clique)', async () => {
    vi.resetModules();
    const { default: AuthProvider } = await import('../components/AuthProvider');

    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    mockSingle.mockResolvedValue({ data: { onboarding_completed: true } });

    const primeira = render(<AuthProvider>conteúdo protegido</AuthProvider>);
    await waitFor(() => expect(mockSingle).toHaveBeenCalledTimes(1));
    primeira.unmount();

    render(<AuthProvider>conteúdo protegido</AuthProvider>);
    await waitFor(() => expect(mockGetSession).toHaveBeenCalledTimes(2));

    // mesma conta ⇒ segue consultando profiles uma vez só
    expect(mockSingle).toHaveBeenCalledTimes(1);
  });

  it('logout limpa o usuário checado para a próxima conta da mesma aba', async () => {
    vi.resetModules();
    let onAuthChange: ((event: string, session: unknown) => void) | undefined;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      onAuthChange = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const { default: AuthProvider } = await import('../components/AuthProvider');

    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    mockSingle.mockResolvedValue({ data: { onboarding_completed: true } });

    const primeira = render(<AuthProvider>conteúdo protegido</AuthProvider>);
    await waitFor(() => expect(mockSingle).toHaveBeenCalledTimes(1));

    // logout
    onAuthChange?.('SIGNED_OUT', null);
    primeira.unmount();

    // mesma conta volta a logar: como houve logout, a checagem roda de novo
    render(<AuthProvider>conteúdo protegido</AuthProvider>);
    await waitFor(() => expect(mockSingle).toHaveBeenCalledTimes(2));
  });

  it('manda pro /login preservando o destino quando não há sessão', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await renderAuthProvider();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login?next=%2Fdashboard'));
    expect(mockSingle).not.toHaveBeenCalled();
  });
});
