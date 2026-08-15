import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET /api/admin/overview.
 *
 * O teste mais importante do arquivo não é o do 200: é o que prova que o
 * client service_role NÃO É CRIADO quando o acesso é negado. Ele bypassa RLS —
 * se ele nascer antes da checagem, uma inversão de ordem vira o banco inteiro
 * aberto para qualquer sessão.
 */

const { mockGetUser, mockCreateAdmin, mockLoadOverview } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCreateAdmin: vi.fn(),
  mockLoadOverview: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: mockCreateAdmin,
}));

vi.mock('@/lib/admin-metrics', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin-metrics')>();
  return { ...original, loadAdminOverview: mockLoadOverview };
});

const ADMIN = 'rafaelrocha250304@gmail.com';

async function route() {
  vi.resetModules();
  return import('../app/api/admin/overview/route');
}

function get(url = 'http://local/api/admin/overview') {
  return new NextRequest(url);
}

function sessao(overrides: Record<string, unknown> = {}) {
  mockGetUser.mockResolvedValue({
    data: {
      user: { id: 'user-1', email: ADMIN, email_confirmed_at: '2026-01-01T00:00:00Z', ...overrides },
    },
  });
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = ADMIN;
  mockCreateAdmin.mockReturnValue({ marcador: 'service-role' });
  mockLoadOverview.mockResolvedValue({ generatedAt: '2026-08-15T12:00:00.000Z' });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_EMAILS;
});

describe('GET /api/admin/overview', () => {
  it('visitante sem sessão recebe 401 e o service_role nem é instanciado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await (await route()).GET(get());

    expect(response.status).toBe(401);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
    expect(mockLoadOverview).not.toHaveBeenCalled();
  });

  it('usuário logado fora da allowlist recebe 403 e não lê nada', async () => {
    sessao({ email: 'intruso@exemplo.com' });

    const response = await (await route()).GET(get());

    expect(response.status).toBe(403);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
    expect(mockLoadOverview).not.toHaveBeenCalled();
  });

  it('ADMIN_EMAILS vazia nega até o dono', async () => {
    process.env.ADMIN_EMAILS = '';
    sessao();

    const response = await (await route()).GET(get());

    expect(response.status).toBe(403);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('ADMIN_EMAILS ausente nega todo mundo (fail closed)', async () => {
    delete process.env.ADMIN_EMAILS;
    sessao();

    const response = await (await route()).GET(get());

    expect(response.status).toBe(403);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('e-mail da allowlist com caixa e espaço diferentes passa', async () => {
    process.env.ADMIN_EMAILS = `  ${ADMIN.toUpperCase()} , alguem@x.com `;
    sessao({ email: 'RafaelRocha250304@Gmail.com' });

    const response = await (await route()).GET(get());

    expect(response.status).toBe(200);
    expect(mockCreateAdmin).toHaveBeenCalledTimes(1);
  });

  it('e-mail não confirmado recebe 403 mesmo estando na allowlist', async () => {
    sessao({ email_confirmed_at: null });

    const response = await (await route()).GET(get());

    expect(response.status).toBe(403);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('admin recebe 200, com o período da query string aplicado e sem cache', async () => {
    sessao();

    const response = await (await route()).GET(get('http://local/api/admin/overview?periodo=7d'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.period.key).toBe('7d');
    expect(body.overview.generatedAt).toBe('2026-08-15T12:00:00.000Z');
    expect(mockLoadOverview).toHaveBeenCalledWith(
      { marcador: 'service-role' },
      expect.objectContaining({ key: '7d' }),
    );
  });

  it('falha de leitura vira 500 sem vazar a mensagem do Postgres', async () => {
    sessao();
    mockLoadOverview.mockRejectedValue(new Error('relation "public.subscriptions" does not exist'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await (await route()).GET(get());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/subscriptions/);
    erro.mockRestore();
  });

  it('corpo do 403 não conta ao intruso QUAL condição falhou', async () => {
    sessao({ email: 'intruso@exemplo.com' });
    const negado = await (await route()).GET(get());

    process.env.ADMIN_EMAILS = '';
    sessao();
    const semLista = await (await route()).GET(get());

    expect(await negado.json()).toEqual(await semLista.json());
  });
});
