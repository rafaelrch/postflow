import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O LADO SERVIDOR do atalho para /admin.
 *
 * A parte que decide se isto está certo não é o botão: é ONDE a decisão é
 * tomada. Ela roda no servidor, reusando `decideAdminAccess`, e o que atravessa
 * para o cliente é um booleano. Se um dia alguém "simplificar" isso lendo a
 * allowlist no componente, a lista de e-mails vai junto no bundle.
 */

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/components/AppShell', () => ({
  default: ({ isAdmin }: { isAdmin: boolean }) => ({ isAdmin }),
}));

const ADMIN = 'rafaelrocha250304@gmail.com';
const CONFIRMADO = '2026-01-01T00:00:00Z';

async function importar() {
  vi.resetModules();
  return {
    isCurrentUserAdmin: (await import('../lib/admin-auth')).isCurrentUserAdmin,
    AppLayout: (await import('../app/(app)/layout')).default,
  };
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = ADMIN;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_EMAILS;
});

describe('isCurrentUserAdmin', () => {
  it('admin confirmado → true', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: ADMIN, email_confirmed_at: CONFIRMADO } },
    });
    const { isCurrentUserAdmin } = await importar();
    expect(await isCurrentUserAdmin()).toBe(true);
  });

  it('usuário fora da allowlist → false', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: 'cliente@exemplo.com', email_confirmed_at: CONFIRMADO } },
    });
    const { isCurrentUserAdmin } = await importar();
    expect(await isCurrentUserAdmin()).toBe(false);
  });

  it('sem sessão → false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { isCurrentUserAdmin } = await importar();
    expect(await isCurrentUserAdmin()).toBe(false);
  });

  it('allowlist ausente → false (fail closed)', async () => {
    delete process.env.ADMIN_EMAILS;
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: ADMIN, email_confirmed_at: CONFIRMADO } },
    });
    const { isCurrentUserAdmin } = await importar();
    expect(await isCurrentUserAdmin()).toBe(false);
  });

  it('e-mail na lista mas não confirmado → false', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: ADMIN, email_confirmed_at: null } },
    });
    const { isCurrentUserAdmin } = await importar();
    expect(await isCurrentUserAdmin()).toBe(false);
  });

  it('NÃO lança quando o Supabase explode — devolve false', async () => {
    // Um item de menu não pode derrubar a shell inteira do produto.
    mockGetUser.mockRejectedValue(new Error('supabase fora do ar'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { isCurrentUserAdmin } = await importar();
    expect(await isCurrentUserAdmin()).toBe(false);
    erro.mockRestore();
  });
});

describe('app/(app)/layout — o que desce para o cliente', () => {
  it('passa apenas o booleano para a shell (admin)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: ADMIN, email_confirmed_at: CONFIRMADO } },
    });
    const { AppLayout } = await importar();
    const element = await AppLayout({ children: null });
    expect(element.props.isAdmin).toBe(true);
    // O e-mail que casou com a allowlist NÃO viaja junto.
    expect(JSON.stringify(element.props)).not.toContain(ADMIN);
  });

  it('passa false para usuário comum', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u', email: 'cliente@exemplo.com', email_confirmed_at: CONFIRMADO } },
    });
    const { AppLayout } = await importar();
    const element = await AppLayout({ children: null });
    expect(element.props.isAdmin).toBe(false);
  });
});

describe('ADMIN_EMAILS não atravessa para o navegador', () => {
  const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('a barra do produto não lê a allowlist nem importa admin-auth', () => {
    const barra = ler('components/ui/AppSidebar.tsx');
    expect(barra).not.toContain('process.env.ADMIN_EMAILS');
    expect(barra).not.toContain('admin-auth');
  });

  it('a shell client não lê a allowlist', () => {
    expect(ler('components/AppShell.tsx')).not.toContain('process.env.ADMIN_EMAILS');
  });

  it('nenhum arquivo deste caminho prefixa a allowlist com NEXT_PUBLIC_', () => {
    // O trinco: NEXT_PUBLIC_ADMIN_EMAILS embutiria a lista no bundle e
    // publicaria o e-mail do dono para qualquer visitante.
    for (const arquivo of [
      'lib/admin-auth.ts',
      'app/(app)/layout.tsx',
      'components/AppShell.tsx',
      'components/ui/AppSidebar.tsx',
    ]) {
      expect(ler(arquivo)).not.toContain('NEXT_PUBLIC_ADMIN_EMAILS');
    }
  });
});
