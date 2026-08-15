// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FinanceDashboard from '@/app/admin/financeiro/FinanceDashboard';
import { resolvePeriod } from '@/lib/admin-period';
import type { AdminFinance } from '@/lib/admin-finance';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ok = <T,>(value: T) => ({ ok: true as const, value });
const base: AdminFinance = {
  revenue: ok({ received: { count: 0, amount: 0 }, confirmed: { count: 0, amount: 0 }, refunded: { count: 0, amount: 0 }, chargeback: { count: 0, amount: 0 }, newSubscriptions: 0, renewals: 0, historyStartedAt: null, series: [], byPlan: [], grain: 'day' }),
  current: ok({ mrr: 0, arr: 0, missingValue: 0, monthly: { count: 0, value: 0 }, yearly: { count: 0, value: 0 } }),
  attention: ok({ issues: [], scheduledCancellations: { count: 0, rows: [] }, paidWithoutAccount: { count: 0, rows: [] } }),
  forecast: ok({ undated: 0, next7: { count: 0, amount: 0, missingValue: 0, rows: [] }, next30: { count: 0, amount: 0, missingValue: 0, rows: [] } }),
};
const period = resolvePeriod({ periodo: '30d' }, new Date('2026-08-15T15:00:00Z'));

afterEach(cleanup);

describe('UI Financeiro', () => {
  it('periodo sem transacao mostra empty state explicito', () => {
    render(<FinanceDashboard data={base} period={period} />);
    expect(screen.getByTestId('finance-empty-state').textContent).toContain('Nenhuma transação no período');
  });

  it('falha de receita nao apaga os outros tres blocos nem vira zero', () => {
    render(<FinanceDashboard data={{ ...base, revenue: { ok: false } }} period={period} />);
    expect(screen.getByText('Receita do período não carregou')).toBeTruthy();
    expect(screen.getByText('MRR atual')).toBeTruthy();
    expect(screen.getByText('Atenção')).toBeTruthy();
    expect(screen.getByText('Cobranças previstas')).toBeTruthy();
    expect(screen.queryByTestId('finance-revenue-cards')).toBeNull();
  });

  it('explica por que churn historico nao e exibido', () => {
    render(<FinanceDashboard data={base} period={period} />);
    expect(screen.getByText(/Churn histórico não é exibido/)).toBeTruthy();
  });
});
