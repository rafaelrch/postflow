// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * A guarda de app/(app)/setup/layout.tsx. /setup é 'use client' e chama
 * /api/check-db (hoje protegida por admin) — sem esta guarda, um usuário
 * comum logado abriria a página e só tomaria erro no fetch. Aqui prova-se
 * que o layout barra ANTES disso, no servidor.
 *
 * `redirect()` de verdade nunca retorna — interrompe lançando NEXT_REDIRECT
 * por baixo dos panos. O mock replica esse comportamento de propósito: se a
 * chamada a redirect() for removida do layout, a função passa a resolver
 * normalmente em vez de rejeitar, e os testes de acesso negado abaixo falham.
 */

const { mockRequireAdmin, mockRedirect } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/admin-auth', async () => {
  const real = await vi.importActual<typeof import('../lib/admin-auth')>('../lib/admin-auth');
  return { ...real, requireAdmin: mockRequireAdmin };
});

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));

async function loadLayout() {
  vi.resetModules();
  return (await import('../app/(app)/setup/layout')).default;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('app/(app)/setup/layout — guarda de admin', () => {
  it('sem sessão (401 no_session) → redireciona para /dashboard e não chega a renderizar', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: false, status: 401, reason: 'no_session' });
    const SetupLayout = await loadLayout();

    await expect(
      SetupLayout({ children: <div>conteúdo de /setup</div> }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('logado, fora da allowlist (403 not_allowlisted) → redireciona e não renderiza', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: false, status: 403, reason: 'not_allowlisted' });
    const SetupLayout = await loadLayout();

    await expect(
      SetupLayout({ children: <div>conteúdo de /setup</div> }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('ADMIN_EMAILS ausente/vazia (403 allowlist_unset) → redireciona mesmo assim (fail closed)', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: false, status: 403, reason: 'allowlist_unset' });
    const SetupLayout = await loadLayout();

    await expect(
      SetupLayout({ children: <div>conteúdo de /setup</div> }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('admin autenticado → renderiza os children, sem redirecionar', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: 'u', email: 'admin@x.com' });
    const SetupLayout = await loadLayout();

    const tree = await SetupLayout({ children: <div>conteúdo de /setup</div> });
    expect(mockRedirect).not.toHaveBeenCalled();

    render(tree);
    expect(screen.getByText('conteúdo de /setup')).toBeTruthy();
  });
});
