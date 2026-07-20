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

  it('manda pro /login preservando o destino quando não há sessão', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await renderAuthProvider();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login?next=%2Fdashboard'));
    expect(mockSingle).not.toHaveBeenCalled();
  });
});
