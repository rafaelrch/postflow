// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HealthDashboard from '@/app/admin/saude/HealthDashboard';
import { HEALTH_CHECKS, type HealthCheckResult } from '@/lib/admin-health';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

function cleanChecks(): HealthCheckResult[] {
  return HEALTH_CHECKS.map((definition) => ({ ok: true, value: {
    ...definition, count: 0, firstAt: null, lastAt: null, rows: [],
  } }));
}

describe('UI Saúde', () => {
  it('mostra toda regra limpa como nenhuma ocorrência, sem escondê-la', () => {
    render(<HealthDashboard checks={cleanChecks()} />);
    expect(screen.getAllByText('Nenhuma ocorrência')).toHaveLength(HEALTH_CHECKS.length);
    expect(screen.getByText('Assinatura ativa sem pagamento confirmado')).toBeTruthy();
    expect(screen.getByText('Pagamento confirmado não processado')).toBeTruthy();
  });

  it('mostra severidade, datas e link para registro afetado', () => {
    const checks = cleanChecks();
    checks[0] = { ok: true, value: {
      ...HEALTH_CHECKS[0], severity: 'critical', count: 1,
      firstAt: '2026-08-15T10:00:00Z', lastAt: '2026-08-15T10:00:00Z',
      rows: [{ recordKey: 'sub_1', email: 'cliente@test.com', occurredAt: '2026-08-15T10:00:00Z', detail: 'Acesso já vinculado', linkKind: 'customers' }],
    } };
    render(<HealthDashboard checks={checks} />);

    expect(screen.getByText('Crítico')).toBeTruthy();
    expect(screen.getByText('cliente@test.com').closest('a')?.getAttribute('href')).toContain('/admin/clientes?');
    expect(screen.getAllByText(/15\/08\/2026/).length).toBeGreaterThan(0);
  });

  it('falha de uma regra não vira zero nem remove as demais', () => {
    const checks = cleanChecks();
    checks[1] = { ok: false };
    render(<HealthDashboard checks={checks} />);

    expect(screen.getByText('Pagamento confirmado não processado não carregou')).toBeTruthy();
    expect(screen.getByText(/Nenhuma ocorrência foi convertida em zero/)).toBeTruthy();
    expect(screen.getAllByText('Nenhuma ocorrência')).toHaveLength(HEALTH_CHECKS.length - 1);
  });
});
