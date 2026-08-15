import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS } from './plans';
import type { ResolvedPeriod } from './admin-period';

/** Status que dão acesso pago hoje. */
export const ACTIVE_STATUSES = ['active', 'trialing'] as const;

/**
 * Teto de linhas lidas para deduplicar leads com checkout. Ao atingir o teto,
 * o card assume explicitamente que o valor é um piso.
 */
export const CHECKOUT_LEADS_CAP = 5000;

/**
 * Resultado de UMA leitura. A falha não carrega a mensagem do banco porque o
 * mesmo objeto também é exposto pela rota de diagnóstico. O detalhe técnico
 * fica somente no log do servidor.
 */
export type MetricResult<T> =
  | { ok: true; value: T }
  | { ok: false };

export interface RenewalWindow {
  monthly: number;
  yearly: number;
  count: number;
  amount: number;
  /** Ativas, sem cancelamento agendado e sem data: ficaram fora da previsão. */
  undated: number;
}

export interface AdminOverview {
  generatedAt: string;
  accounts: { total: MetricResult<number> };
  profiles: {
    total: MetricResult<number>;
    createdInPeriod: MetricResult<number>;
    createdInPreviousPeriod: MetricResult<number>;
    onboardingCompleted: MetricResult<number>;
    onboardingIncomplete: MetricResult<number>;
  };
  subscriptions: {
    active: MetricResult<number>;
    withAccount: MetricResult<number>;
    withoutAccount: MetricResult<number>;
    monthly: MetricResult<number>;
    yearly: MetricResult<number>;
    scheduledCancellation: MetricResult<number>;
  };
  recurring: MetricResult<{ mrr: number; arr: number; monthly: number; yearly: number }>;
  renewals: {
    next7: MetricResult<RenewalWindow>;
    next30: MetricResult<RenewalWindow>;
  };
  funnel: {
    leads: MetricResult<number>;
    leadsPrevious: MetricResult<number>;
    checkoutAttempts: MetricResult<number>;
    checkoutLeads: MetricResult<{ count: number; capped: boolean }>;
  };
  credits: { zeroBalance: MetricResult<number> };
}

export function normalizedMrr(monthly: number, yearly: number): number {
  return monthly * PLANS.month.value + (yearly * PLANS.year.value) / 12;
}

export function estimatedArr(mrr: number): number {
  return mrr * 12;
}

export function renewalAmount(monthly: number, yearly: number): number {
  return monthly * PLANS.month.value + yearly * PLANS.year.value;
}

export function variation(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;

async function readCount(label: string, query: CountQuery): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(`[admin-metrics] ${label}: ${error.message}`);
  return count ?? 0;
}

/**
 * Converte cada promise em sucesso/falha ANTES do Promise.all. Assim uma
 * consulta quebrada nunca rejeita o lote inteiro nem transforma a métrica em
 * zero. O log conserva a causa no servidor; a UI recebe apenas `ok: false`.
 */
async function independently<T>(label: string, promise: PromiseLike<T>): Promise<MetricResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    console.error(`[admin-metrics] falha isolada em ${label}`, error);
    return { ok: false };
  }
}

function combine<A, B, R>(
  first: MetricResult<A>,
  second: MetricResult<B>,
  build: (first: A, second: B) => R,
): MetricResult<R> {
  if (!first.ok || !second.ok) return { ok: false };
  return { ok: true, value: build(first.value, second.value) };
}

function renewalResult(
  monthly: MetricResult<number>,
  yearly: MetricResult<number>,
  undated: MetricResult<number>,
): MetricResult<RenewalWindow> {
  if (!monthly.ok || !yearly.ok || !undated.ok) return { ok: false };
  return {
    ok: true,
    value: {
      monthly: monthly.value,
      yearly: yearly.value,
      count: monthly.value + yearly.value,
      amount: renewalAmount(monthly.value, yearly.value),
      undated: undated.value,
    },
  };
}

/**
 * Agrega no Postgres e devolve resultados independentes por métrica.
 *
 * Só chame com o client service_role e somente depois de requireAdmin passar.
 * O módulo não autoriza: a página/route handler autoriza antes de criá-lo.
 */
export async function loadAdminOverview(
  admin: SupabaseClient,
  period: ResolvedPeriod,
  now: Date = new Date(),
): Promise<AdminOverview> {
  const nowIso = now.toISOString();
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString();

  const activeSubs = () =>
    admin.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', [...ACTIVE_STATUSES]);

  const renewalsIn = (until: string, interval: 'month' | 'year') =>
    activeSubs()
      .eq('cancel_at_period_end', false)
      .eq('plan_interval', interval)
      .gte('current_period_end', nowIso)
      .lt('current_period_end', until);

  const undatedRenewals = () =>
    activeSubs().eq('cancel_at_period_end', false).is('current_period_end', null);

  const [
    authTotal,
    profilesTotal,
    profilesInPeriod,
    profilesInPrevious,
    onboardingCompleted,
    onboardingIncomplete,
    active,
    withAccount,
    withoutAccount,
    monthly,
    yearly,
    scheduledCancellation,
    renew7Monthly,
    renew7Yearly,
    renew30Monthly,
    renew30Yearly,
    renewalsUndated,
    leads,
    leadsPrevious,
    checkoutAttempts,
    checkoutLeadRows,
    zeroBalance,
  ] = await Promise.all([
    independently(
      'contas do Auth',
      admin.auth.admin.listUsers({ page: 1, perPage: 1 }).then(({ data, error }) => {
        if (error) throw new Error(`[admin-metrics] auth.listUsers: ${error.message}`);
        return (data as { total?: number }).total ?? 0;
      }),
    ),
    independently('perfis', readCount('profiles', admin.from('profiles').select('id', { count: 'exact', head: true }))),
    independently(
      'perfis no período',
      readCount(
        'profiles no período',
        admin.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', period.from).lt('created_at', period.to),
      ),
    ),
    independently(
      'perfis no período anterior',
      readCount(
        'profiles no período anterior',
        admin.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', period.previous.from).lt('created_at', period.previous.to),
      ),
    ),
    independently(
      'onboarding concluído',
      readCount('onboarding concluído', admin.from('profiles').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true)),
    ),
    independently(
      'onboarding incompleto',
      readCount('onboarding incompleto', admin.from('profiles').select('id', { count: 'exact', head: true }).eq('onboarding_completed', false)),
    ),
    independently('assinaturas ativas', readCount('assinaturas ativas', activeSubs())),
    independently('assinantes com conta', readCount('assinantes com conta', activeSubs().not('user_id', 'is', null))),
    independently('pagou sem conta', readCount('pagou sem conta', activeSubs().is('user_id', null))),
    independently('ativas mensais', readCount('ativas mensais', activeSubs().eq('plan_interval', 'month'))),
    independently('ativas anuais', readCount('ativas anuais', activeSubs().eq('plan_interval', 'year'))),
    independently('cancelamento agendado', readCount('cancelamento agendado', activeSubs().eq('cancel_at_period_end', true))),
    independently('renovações 7d mensais', readCount('renovações 7d mensais', renewalsIn(in7, 'month'))),
    independently('renovações 7d anuais', readCount('renovações 7d anuais', renewalsIn(in7, 'year'))),
    independently('renovações 30d mensais', readCount('renovações 30d mensais', renewalsIn(in30, 'month'))),
    independently('renovações 30d anuais', readCount('renovações 30d anuais', renewalsIn(in30, 'year'))),
    independently('renovações sem data', readCount('renovações sem data', undatedRenewals())),
    independently(
      'leads no período',
      readCount('leads no período', admin.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', period.from).lt('created_at', period.to)),
    ),
    independently(
      'leads no período anterior',
      readCount(
        'leads no período anterior',
        admin.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', period.previous.from).lt('created_at', period.previous.to),
      ),
    ),
    independently(
      'checkouts iniciados',
      readCount(
        'checkouts iniciados',
        admin.from('payment_checkout_refs').select('checkout_session_id', { count: 'exact', head: true }).gte('created_at', period.from).lt('created_at', period.to),
      ),
    ),
    independently(
      'leads em checkout',
      admin
        .from('payment_checkout_refs')
        .select('lead_id')
        .gte('created_at', period.from)
        .lt('created_at', period.to)
        .limit(CHECKOUT_LEADS_CAP + 1)
        .then(({ data, error }) => {
          if (error) throw new Error(`[admin-metrics] leads em checkout: ${error.message}`);
          return (data ?? []) as { lead_id: string }[];
        }),
    ),
    independently(
      'clientes sem crédito',
      readCount('clientes sem crédito', admin.from('user_credits').select('user_id', { count: 'exact', head: true }).eq('balance', 0)),
    ),
  ]);

  const recurring = combine(monthly, yearly, (monthlyValue, yearlyValue) => {
    const mrr = normalizedMrr(monthlyValue, yearlyValue);
    return { mrr, arr: estimatedArr(mrr), monthly: monthlyValue, yearly: yearlyValue };
  });

  const checkoutLeads: MetricResult<{ count: number; capped: boolean }> = checkoutLeadRows.ok
    ? {
        ok: true,
        value: {
          count: new Set(checkoutLeadRows.value.slice(0, CHECKOUT_LEADS_CAP).map((row) => row.lead_id)).size,
          capped: checkoutLeadRows.value.length > CHECKOUT_LEADS_CAP,
        },
      }
    : { ok: false };

  return {
    generatedAt: nowIso,
    accounts: { total: authTotal },
    profiles: {
      total: profilesTotal,
      createdInPeriod: profilesInPeriod,
      createdInPreviousPeriod: profilesInPrevious,
      onboardingCompleted,
      onboardingIncomplete,
    },
    subscriptions: { active, withAccount, withoutAccount, monthly, yearly, scheduledCancellation },
    recurring,
    renewals: {
      next7: renewalResult(renew7Monthly, renew7Yearly, renewalsUndated),
      next30: renewalResult(renew30Monthly, renew30Yearly, renewalsUndated),
    },
    funnel: { leads, leadsPrevious, checkoutAttempts, checkoutLeads },
    credits: { zeroBalance },
  };
}
