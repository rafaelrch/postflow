import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  estimatedArr,
  loadAdminOverview,
  normalizedMrr,
  renewalAmount,
  variation,
} from '../lib/admin-metrics';
import { resolvePeriod } from '../lib/admin-period';
import { PLANS } from '../lib/plans';

/**
 * ── POR QUE UM FAKE QUE APLICA OS FILTROS DE VERDADE ────────────────────────
 * Um mock que devolve `{ count: 7 }` para qualquer query provaria só que o
 * número atravessa a função. O que precisa ser provado é o RECORTE: que a
 * assinatura com cancelamento agendado não entra na previsão de renovação, que
 * "pagou e não criou conta" só pega user_id nulo, que o período usa fim
 * exclusivo. Então o fake guarda linhas e APLICA os filtros encadeados.
 */

type Row = Record<string, unknown>;
type Filter = [string, ...unknown[]];

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      const [op, column, ...rest] = filter as [string, string, ...unknown[]];
      const value = row[column];
      switch (op) {
        case 'in':
          return (rest[0] as unknown[]).includes(value);
        case 'eq':
          return value === rest[0];
        case 'is':
          return rest[0] === null ? value === null || value === undefined : value === rest[0];
        case 'not':
          // .not('user_id', 'is', null)
          return !(value === null || value === undefined);
        case 'gte':
          return String(value) >= String(rest[0]);
        case 'lt':
          return String(value) < String(rest[0]);
        case 'limit':
          return true;
        default:
          throw new Error(`Filtro não previsto no fake: ${op}`);
      }
    }),
  );
}

function fakeAdmin(tables: Record<string, Row[]>, authTotal: number, failingTable?: string) {
  return {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [], total: authTotal }, error: null }),
      },
    },
    from(table: string) {
      if (!(table in tables)) throw new Error(`Tabela inesperada no fake: ${table}`);
      const filters: Filter[] = [];
      let head = false;
      let limit = Infinity;

      const builder: Record<string, unknown> = {
        select(_columns: string, options?: { head?: boolean }) {
          head = Boolean(options?.head);
          return builder;
        },
        limit(value: number) {
          limit = value;
          return builder;
        },
        then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
          try {
            if (table === failingTable) {
              return Promise.resolve({ data: null, count: null, error: { message: 'boom' } }).then(resolve, reject);
            }
            const matched = applyFilters(tables[table], filters);
            const result = head
              ? { count: matched.length, data: null, error: null }
              : { data: matched.slice(0, limit), count: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };

      for (const op of ['in', 'eq', 'is', 'not', 'gte', 'lt']) {
        builder[op] = (...args: unknown[]) => {
          filters.push([op, ...args] as Filter);
          return builder;
        };
      }

      return builder;
    },
  } as unknown as SupabaseClient;
}

const AGORA = new Date('2026-08-15T12:00:00Z');
const PERIODO = resolvePeriod({ periodo: '30d' }, AGORA);

function sub(overrides: Row): Row {
  return {
    id: `sub-${Math.random()}`,
    status: 'active',
    user_id: 'user-1',
    plan_interval: 'month',
    cancel_at_period_end: false,
    current_period_end: '2026-12-01T00:00:00Z',
    ...overrides,
  };
}

function cenario() {
  return {
    subscriptions: [
      // 3 mensais ativas com conta, uma delas renovando em 3 dias.
      sub({ current_period_end: '2026-08-18T00:00:00Z' }),
      sub({ current_period_end: '2026-09-10T00:00:00Z' }),
      sub({ status: 'trialing', current_period_end: '2026-08-20T00:00:00Z' }),
      // 2 anuais ativas: uma renova em 5 dias, a outra só ano que vem.
      sub({ plan_interval: 'year', current_period_end: '2026-08-20T00:00:00Z' }),
      sub({ plan_interval: 'year', current_period_end: '2027-05-01T00:00:00Z' }),
      // Pagou e NÃO criou conta.
      sub({ user_id: null, current_period_end: '2026-09-01T00:00:00Z' }),
      // Cancelamento agendado renovando em 2 dias: NÃO pode entrar na previsão.
      sub({ cancel_at_period_end: true, current_period_end: '2026-08-17T00:00:00Z' }),
      // Ativa, sem cancelamento e sem data: não entra na previsão e precisa ser avisada.
      sub({ current_period_end: null }),
      // Canceladas/inadimplentes não contam como ativas.
      sub({ status: 'canceled' }),
      sub({ status: 'past_due' }),
    ],
    profiles: [
      { id: 'p1', created_at: '2026-08-10T00:00:00Z', onboarding_completed: true },
      { id: 'p2', created_at: '2026-08-01T00:00:00Z', onboarding_completed: false },
      // Fora do período atual, dentro do anterior.
      { id: 'p3', created_at: '2026-06-20T00:00:00Z', onboarding_completed: true },
    ],
    leads: [
      { id: 'l1', created_at: '2026-08-14T00:00:00Z' },
      { id: 'l2', created_at: '2026-08-02T00:00:00Z' },
      { id: 'l3', created_at: '2026-06-20T00:00:00Z' },
    ],
    payment_checkout_refs: [
      // Mesmo lead, três tentativas: uma PESSOA, não três.
      { checkout_session_id: 'c1', lead_id: 'l1', created_at: '2026-08-14T01:00:00Z' },
      { checkout_session_id: 'c2', lead_id: 'l1', created_at: '2026-08-14T02:00:00Z' },
      { checkout_session_id: 'c3', lead_id: 'l1', created_at: '2026-08-14T03:00:00Z' },
      { checkout_session_id: 'c4', lead_id: 'l2', created_at: '2026-08-02T00:00:00Z' },
      { checkout_session_id: 'c5', lead_id: 'l3', created_at: '2026-06-20T00:00:00Z' },
    ],
    user_credits: [
      { user_id: 'u1', balance: 0 },
      { user_id: 'u2', balance: 0 },
      { user_id: 'u3', balance: 42 },
    ],
  };
}

describe('fórmulas', () => {
  it('MRR normalizado usa o preço de lib/plans.ts e divide o anual por 12', () => {
    expect(normalizedMrr(3, 2)).toBeCloseTo(3 * 59.5 + (2 * 499) / 12, 10);
    expect(normalizedMrr(3, 2)).toBeCloseTo(
      3 * PLANS.month.value + (2 * PLANS.year.value) / 12,
      10,
    );
    expect(normalizedMrr(0, 0)).toBe(0);
    // O anual NÃO entra pelo valor cheio.
    expect(normalizedMrr(0, 1)).toBeLessThan(PLANS.year.value);
  });

  it('ARR é o MRR normalizado × 12', () => {
    expect(estimatedArr(normalizedMrr(3, 2))).toBeCloseTo(3 * 59.5 * 12 + 2 * 499, 10);
  });

  it('renovação cobra o ciclo inteiro — o anual não é dividido por 12', () => {
    expect(renewalAmount(2, 1)).toBeCloseTo(2 * 59.5 + 499, 10);
  });

  it('variação é null quando o período anterior é zero', () => {
    expect(variation(10, 0)).toBeNull();
    expect(variation(0, 0)).toBeNull();
    expect(variation(15, 10)).toBeCloseTo(50, 10);
    expect(variation(5, 10)).toBeCloseTo(-50, 10);
  });
});

describe('loadAdminOverview', () => {
  function value<T>(result: { ok: true; value: T } | { ok: false }): T {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('resultado inesperadamente indisponível');
    return result.value;
  }

  it('conta assinaturas ativas pelo estado, não pelo total da tabela', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    expect(value(data.subscriptions.active)).toBe(8);
    expect(value(data.subscriptions.monthly)).toBe(6);
    expect(value(data.subscriptions.yearly)).toBe(2);
    expect(value(data.accounts.total)).toBe(12);
  });

  it('"pagou e não criou conta" conta só as ativas com user_id nulo', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    expect(value(data.subscriptions.withoutAccount)).toBe(1);
    expect(value(data.subscriptions.withAccount)).toBe(7);
    expect(value(data.subscriptions.withAccount) + value(data.subscriptions.withoutAccount)).toBe(
      value(data.subscriptions.active),
    );
  });

  it('MRR e ARR saem das ativas por plano', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    const recurring = value(data.recurring);
    expect(recurring.mrr).toBeCloseTo(normalizedMrr(6, 2), 10);
    expect(recurring.arr).toBeCloseTo(recurring.mrr * 12, 10);
  });

  it('renovação prevista IGNORA assinatura com cancelamento agendado', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    // Janela de 7 dias (15/08 → 22/08): mensal 18/08, mensal 20/08 (trialing) e
    // anual 20/08. A que vence em 17/08 tem cancel_at_period_end e fica fora.
    const next7 = value(data.renewals.next7);
    expect(next7.monthly).toBe(2);
    expect(next7.yearly).toBe(1);
    expect(next7.count).toBe(3);
    expect(next7.amount).toBeCloseTo(2 * 59.5 + 499, 10);
    expect(next7.undated).toBe(1);
  });

  it('cancelamento agendado aparece no próprio card', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    expect(value(data.subscriptions.scheduledCancellation)).toBe(1);
  });

  it('a janela de 30 dias contém a de 7 e continua sem o cancelamento agendado', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    const next7 = value(data.renewals.next7);
    const next30 = value(data.renewals.next30);
    expect(next30.count).toBeGreaterThanOrEqual(next7.count);
    // 18/08, 20/08 (trialing), 20/08 anual, 01/09 (a sem conta) e 10/09.
    expect(next30.count).toBe(5);
  });

  it('checkouts contam PESSOAS distintas, não tentativas', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    expect(value(data.funnel.checkoutAttempts)).toBe(4);
    expect(value(data.funnel.checkoutLeads)).toEqual({ count: 2, capped: false });
  });

  it('recorta leads e perfis pelo período, com período anterior comparável', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    expect(value(data.funnel.leads)).toBe(2);
    expect(value(data.funnel.leadsPrevious)).toBe(1);
    expect(value(data.profiles.createdInPeriod)).toBe(2);
    expect(value(data.profiles.createdInPreviousPeriod)).toBe(1);
  });

  it('onboarding e saldo zero vêm do estado atual', async () => {
    const data = await loadAdminOverview(fakeAdmin(cenario(), 12), PERIODO, AGORA);
    expect(value(data.profiles.onboardingCompleted)).toBe(2);
    expect(value(data.profiles.onboardingIncomplete)).toBe(1);
    expect(value(data.credits.zeroBalance)).toBe(2);
  });

  it('isola uma falha sem derrubar nem zerar as outras métricas', async () => {
    const quebrado = fakeAdmin(cenario(), 12, 'profiles') as unknown as {
      auth: { admin: { listUsers: () => Promise<unknown> } };
    };
    quebrado.auth.admin.listUsers = async () => ({ data: null, error: { message: 'boom' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = await loadAdminOverview(quebrado as unknown as SupabaseClient, PERIODO, AGORA);
    expect(data.accounts.total).toEqual({ ok: false });
    expect(data.profiles.total).toEqual({ ok: false });
    expect(value(data.subscriptions.active)).toBe(8);
    spy.mockRestore();
  });
});
