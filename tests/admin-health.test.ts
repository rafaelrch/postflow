import { describe, expect, it, vi } from 'vitest';
import { HEALTH_CHECKS, loadAdminHealth } from '@/lib/admin-health';

describe('loadAdminHealth', () => {
  it('executa uma RPC por regra e preserva falhas isoladas', async () => {
    const rpc = vi.fn(async (name: string, args: { p_check_key: string }) => {
      if (args.p_check_key === 'stale_webhook') return { data: null, error: { message: 'db down' } };
      return { data: { count: 0, severity: 'low', rows: [] }, error: null };
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const checks = await loadAdminHealth({ rpc } as never, new Date('2026-08-15T18:00:00Z'));

    expect(rpc).toHaveBeenCalledTimes(HEALTH_CHECKS.length);
    expect(checks).toHaveLength(HEALTH_CHECKS.length);
    expect(checks[2]).toEqual({ ok: false });
    expect(checks.filter((check) => check.ok)).toHaveLength(HEALTH_CHECKS.length - 1);
    expect(rpc).toHaveBeenCalledWith('admin_health_check', expect.objectContaining({
      p_now: '2026-08-15T18:00:00.000Z', p_limit: 20,
    }));
  });

  it('a regra de cancelamento usa a função NOVA; as antigas, a de sempre', async () => {
    /**
     * Isto é proteção de JANELA DE DEPLOY, não estilo. O código sobe no merge e
     * a migration é aplicada à mão: enquanto ela não roda, a função nova não
     * existe. Com as chamadas separadas, só o card novo falha isoladamente —
     * se tudo passasse por uma função só, a aba Saúde inteira ficaria vazia.
     */
    const rpc = vi.fn(async () => ({ data: { count: 0, severity: 'low', rows: [] }, error: null }));
    await loadAdminHealth({ rpc } as never);

    const porFuncao = rpc.mock.calls.reduce<Record<string, string[]>>((acc, chamada) => {
      const [nome, args] = chamada as unknown as [string, { p_check_key: string }];
      (acc[nome] ??= []).push(args.p_check_key);
      return acc;
    }, {});

    expect(porFuncao.admin_health_cancellation_check).toEqual(['cancellation_not_reflected']);
    expect(porFuncao.admin_health_check).toHaveLength(HEALTH_CHECKS.length - 1);
    expect(porFuncao.admin_health_check).not.toContain('cancellation_not_reflected');
    // E os dois alertas convivem: "evento pendente" e "cancelamento não
    // refletido" são problemas diferentes, com urgências diferentes.
    expect(porFuncao.admin_health_check).toContain('stale_webhook');
  });

  it('mapeia metadados sem carregar payload ou conteúdo privado', async () => {
    const rpc = vi.fn(async () => ({ data: {
      count: 1, severity: 'critical', first_at: '2026-08-15T10:00:00Z',
      last_at: '2026-08-15T10:00:00Z',
      rows: [{ record_key: 'sub_1', email: 'cliente@test.com', occurred_at: '2026-08-15T10:00:00Z', detail: 'Acesso já vinculado', link_kind: 'customers' }],
    }, error: null }));

    const [first] = await loadAdminHealth({ rpc } as never);

    expect(first.ok && first.value).toMatchObject({
      key: 'unconfirmed_subscription', count: 1, severity: 'critical',
      rows: [{ recordKey: 'sub_1', email: 'cliente@test.com', linkKind: 'customers' }],
    });
    expect(JSON.stringify(first)).not.toContain('payload');
    expect(JSON.stringify(first)).not.toContain('prompt');
  });
});
