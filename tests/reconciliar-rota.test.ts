import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A ROTA que dispara a reconciliação, e o gatilho escolhido.
 *
 * Duas coisas se provam aqui:
 *   1. ela é administrativa de verdade — `requireAdmin` ANTES de o client
 *      service_role existir, porque esse client bypassa RLS;
 *   2. o gatilho NÃO é cron nem job de fundo, e o webhook continua intocado.
 *      O caminho do dinheiro não ganhou trabalho novo para consertar uma
 *      exceção que a aba Saúde já denuncia.
 */

const { mockRequireAdmin, mockRun, mockAdminClient } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRun: vi.fn(),
  mockAdminClient: vi.fn(),
}));

vi.mock('@/lib/admin-auth', async () => {
  const real = await vi.importActual<typeof import('../lib/admin-auth')>('../lib/admin-auth');
  return { ...real, requireAdmin: mockRequireAdmin };
});

vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabaseClient: mockAdminClient }));
vi.mock('@/lib/asaas-reconciliation', () => ({ runReconciliation: mockRun }));

async function POST() {
  const { POST: handler } = await import('../app/api/admin/reconciliar/route');
  return handler();
}

beforeEach(() => {
  vi.resetModules();
  mockAdminClient.mockReturnValue({});
  mockRun.mockResolvedValue({ scanned: 1, reconciled: 1, alreadyReconciled: 0, skipped: [], failed: 0 });
});

afterEach(() => vi.clearAllMocks());

describe('POST /api/admin/reconciliar', () => {
  it('sem sessão → 401 e a reconciliação NÃO roda', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: false, status: 401, reason: 'no_session' });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
    // E o client de service_role nem chegou a ser criado.
    expect(mockAdminClient).not.toHaveBeenCalled();
  });

  it('logado fora da allowlist → 403 e nada roda', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: false, status: 403, reason: 'not_allowlisted' });
    const res = await POST();
    expect(res.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockAdminClient).not.toHaveBeenCalled();
    // A resposta não diz QUAL condição falhou.
    expect(JSON.stringify(await res.json())).not.toMatch(/allowlist|ADMIN_EMAILS/i);
  });

  it('admin → devolve o resumo da reconciliação', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: 'u', email: 'admin@x.com' });
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scanned: 1, reconciled: 1, alreadyReconciled: 0, skipped: [], failed: 0 });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('falha inesperada vira 500 sem vazar detalhe do Postgres', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: 'u', email: 'admin@x.com' });
    mockRun.mockRejectedValue(new Error('relation "subscriptions" does not exist'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
    erro.mockRestore();
  });
});

describe('o gatilho escolhido', () => {
  const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('não existe cron nem job de fundo chamando a reconciliação', () => {
    const rota = ler('app/api/admin/reconciliar/route.ts');
    expect(rota).not.toContain('CronCreate');
    expect(rota).not.toMatch(/setInterval|setTimeout|schedule\(/);
    expect(ler('lib/asaas-reconciliation.ts')).not.toMatch(/setInterval|setTimeout/);
  });

  it('o webhook NÃO ganhou a reconciliação: o caminho do dinheiro segue igual', () => {
    // Se um dia isto mudar, é decisão consciente — não efeito colateral.
    expect(ler('app/api/asaas/webhook/route.ts')).not.toContain('asaas-reconciliation');
    expect(ler('app/api/asaas/webhook/route.ts')).not.toContain('runReconciliation');
  });

  it('a reconciliação nunca escreve status nem crédito', () => {
    const fonte = ler('lib/asaas-reconciliation.ts');
    // As duas regras duras, travadas por construção e não por revisão.
    expect(fonte).not.toContain('refresh_credits');
    expect(fonte).not.toMatch(/patch\.status\s*=/);
    expect(fonte).not.toMatch(/patch\.current_period_end\s*=/);
    // E jamais cria assinatura a partir de um evento.
    expect(fonte).not.toContain('.upsert(');
  });
});
