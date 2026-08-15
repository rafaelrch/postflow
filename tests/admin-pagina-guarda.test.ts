import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A guarda das PÁGINAS /admin. O que se prova aqui é o status: visitante vê
 * 401 e logado-sem-permissão vê 403 — nada de redirect silencioso para o
 * login, que esconderia do Rafael que o problema é a allowlist e não a senha.
 */

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

// unauthorized()/forbidden() do Next interrompem o render lançando. Aqui eles
// lançam um erro identificável para o teste poder afirmar QUAL foi chamado.
vi.mock('next/navigation', () => ({
  unauthorized: () => {
    throw new Error('INTERRUPT:401');
  },
  forbidden: () => {
    throw new Error('INTERRUPT:403');
  },
}));

const ADMIN = 'rafaelrocha250304@gmail.com';

async function guard() {
  vi.resetModules();
  return (await import('../lib/admin-page-guard')).requireAdminPage;
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = ADMIN;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_EMAILS;
});

describe('requireAdminPage', () => {
  it('visitante sem sessão → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect((await guard())()).rejects.toThrow('INTERRUPT:401');
  });

  it('logado fora da allowlist → 403', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: 'outro@x.com', email_confirmed_at: '2026-01-01T00:00:00Z' } },
    });
    await expect((await guard())()).rejects.toThrow('INTERRUPT:403');
  });

  it('ADMIN_EMAILS vazia → 403 mesmo para o dono', async () => {
    process.env.ADMIN_EMAILS = '';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: ADMIN, email_confirmed_at: '2026-01-01T00:00:00Z' } },
    });
    await expect((await guard())()).rejects.toThrow('INTERRUPT:403');
  });

  it('admin da allowlist entra e recebe o e-mail normalizado', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: ADMIN.toUpperCase(), email_confirmed_at: '2026-01-01T00:00:00Z' } },
    });
    await expect((await guard())()).resolves.toEqual({ ok: true, userId: 'u', email: ADMIN });
  });
});
