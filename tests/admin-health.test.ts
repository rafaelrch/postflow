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
