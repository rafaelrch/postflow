import { describe, expect, it, vi } from 'vitest';
import { financeGrain, loadAdminFinance } from '@/lib/admin-finance';
import { resolvePeriod } from '@/lib/admin-period';

const now = new Date('2026-08-15T15:00:00Z');

describe('admin financeiro', () => {
  it('escolhe granularidade pela duracao do periodo', () => {
    expect(financeGrain(resolvePeriod({ periodo: '30d' }, now))).toBe('day');
    expect(financeGrain(resolvePeriod({ periodo: '90d' }, now))).toBe('week');
    expect(financeGrain(resolvePeriod({ periodo: 'custom', de: '2025-01-01', ate: '2026-08-15' }, now))).toBe('month');
  });

  it('monta parametros e mapeia o retorno das quatro RPCs', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'admin_financial_revenue'
        ? { received: { count: 2, amount: 119 }, confirmed: { count: 1, amount: 59.5 }, series: [{ bucket: '2026-08-15', count: 2, amount: 119 }], by_plan: [{ plan: 'month', count: 2, amount: 119 }] }
        : name === 'admin_financial_current'
          ? { mrr: 100, arr: 1200, monthly: { count: 2, value: 119 }, yearly: { count: 1, value: 499 } }
          : name === 'admin_financial_attention'
            ? { issues: [], scheduled_cancellations: { count: 0, rows: [] }, paid_without_account: { count: 0, rows: [] } }
            : { undated: 1, next7: { count: 1, amount: 59.5, missing_value: 0, rows: [] }, next30: { count: 2, amount: 119, missing_value: 0, rows: [] } },
      error: null,
    }));
    const period = resolvePeriod({ periodo: '30d' }, now);
    const result = await loadAdminFinance({ rpc } as never, period, now);

    expect(result.revenue).toMatchObject({ ok: true, value: { received: { count: 2, amount: 119 }, grain: 'day' } });
    expect(result.current).toMatchObject({ ok: true, value: { mrr: 100, arr: 1200 } });
    expect(result.forecast).toMatchObject({ ok: true, value: { undated: 1 } });
    expect(rpc).toHaveBeenCalledWith('admin_financial_revenue', { p_from: period.from, p_to: period.to, p_grain: 'day' });
    expect(rpc).toHaveBeenCalledWith('admin_financial_forecast', { p_now: now.toISOString() });
  });

  it('isola a falha de uma RPC sem apagar os demais blocos', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rpc = vi.fn(async (name: string) => name === 'admin_financial_revenue'
      ? { data: null, error: { message: 'sem funcao' } }
      : { data: {}, error: null });
    const result = await loadAdminFinance({ rpc } as never, resolvePeriod({}, now), now);

    expect(result.revenue).toEqual({ ok: false });
    expect(result.current.ok).toBe(true);
    expect(result.attention.ok).toBe(true);
    expect(result.forecast.ok).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('falha isolada em receita'), expect.any(Error));
    errorSpy.mockRestore();
  });
});
