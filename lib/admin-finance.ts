import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResolvedPeriod } from './admin-period';

export type FinanceBlockResult<T> = { ok: true; value: T } | { ok: false };

export interface MoneyCount { count: number; amount: number }
export interface RevenuePoint { bucket: string; count: number; amount: number }
export interface RevenueByPlan { plan: string; count: number; amount: number }

export interface FinanceRevenue {
  received: MoneyCount;
  confirmed: MoneyCount;
  refunded: MoneyCount;
  chargeback: MoneyCount;
  newSubscriptions: number;
  renewals: number;
  historyStartedAt: string | null;
  series: RevenuePoint[];
  byPlan: RevenueByPlan[];
  grain: 'day' | 'week' | 'month';
}

export interface FinanceCurrent {
  mrr: number;
  arr: number;
  missingValue: number;
  monthly: { count: number; value: number };
  yearly: { count: number; value: number };
}

export interface FinanceIssue {
  providerPaymentId: string;
  providerSubscriptionId: string | null;
  userId: string | null;
  email: string | null;
  issueType: 'overdue' | 'failed' | 'refunded' | 'chargeback';
  issueAt: string;
  grossValue: number | null;
  billingType: string | null;
  customerKey: string | null;
}

export interface FinanceSubscriptionRow {
  id: string;
  userId: string | null;
  email: string | null;
  planInterval: string | null;
  value: number | null;
  currentPeriodEnd: string | null;
}

export interface FinanceAttention {
  issues: FinanceIssue[];
  scheduledCancellations: { count: number; rows: FinanceSubscriptionRow[] };
  paidWithoutAccount: { count: number; rows: FinanceSubscriptionRow[] };
}

export interface FinanceForecastWindow extends MoneyCount {
  missingValue: number;
  rows: FinanceSubscriptionRow[];
}

export interface FinanceForecast {
  undated: number;
  next7: FinanceForecastWindow;
  next30: FinanceForecastWindow;
}

export interface AdminFinance {
  revenue: FinanceBlockResult<FinanceRevenue>;
  current: FinanceBlockResult<FinanceCurrent>;
  attention: FinanceBlockResult<FinanceAttention>;
  forecast: FinanceBlockResult<FinanceForecast>;
}

type Raw = Record<string, unknown>;

function object(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {};
}
function array(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
function moneyCount(value: unknown): MoneyCount {
  const raw = object(value);
  return { count: number(raw.count), amount: number(raw.amount) };
}

function subscriptionRow(value: unknown): FinanceSubscriptionRow {
  const row = object(value);
  return {
    id: String(row.id ?? ''),
    userId: nullableString(row.user_id),
    email: nullableString(row.email),
    planInterval: nullableString(row.plan_interval),
    value: nullableNumber(row.value),
    currentPeriodEnd: nullableString(row.current_period_end),
  };
}

function parseRevenue(value: unknown, grain: FinanceRevenue['grain']): FinanceRevenue {
  const raw = object(value);
  return {
    received: moneyCount(raw.received),
    confirmed: moneyCount(raw.confirmed),
    refunded: moneyCount(raw.refunded),
    chargeback: moneyCount(raw.chargeback),
    newSubscriptions: number(raw.new_subscriptions),
    renewals: number(raw.renewals),
    historyStartedAt: nullableString(raw.history_started_at),
    series: array(raw.series).map((row) => ({ bucket: String(row.bucket ?? ''), count: number(row.count), amount: number(row.amount) })),
    byPlan: array(raw.by_plan).map((row) => ({ plan: String(row.plan ?? 'unknown'), count: number(row.count), amount: number(row.amount) })),
    grain,
  };
}

function parseCurrent(value: unknown): FinanceCurrent {
  const raw = object(value);
  const monthly = object(raw.monthly);
  const yearly = object(raw.yearly);
  return {
    mrr: number(raw.mrr), arr: number(raw.arr), missingValue: number(raw.missing_value),
    monthly: { count: number(monthly.count), value: number(monthly.value) },
    yearly: { count: number(yearly.count), value: number(yearly.value) },
  };
}

function parseAttention(value: unknown): FinanceAttention {
  const raw = object(value);
  const scheduled = object(raw.scheduled_cancellations);
  const orphan = object(raw.paid_without_account);
  return {
    issues: array(raw.issues).map((row) => ({
      providerPaymentId: String(row.provider_payment_id ?? ''),
      providerSubscriptionId: nullableString(row.provider_subscription_id),
      userId: nullableString(row.user_id), email: nullableString(row.email),
      issueType: String(row.issue_type) as FinanceIssue['issueType'],
      issueAt: String(row.issue_at ?? ''), grossValue: nullableNumber(row.gross_value),
      billingType: nullableString(row.billing_type), customerKey: nullableString(row.customer_key),
    })),
    scheduledCancellations: { count: number(scheduled.count), rows: array(scheduled.rows).map(subscriptionRow) },
    paidWithoutAccount: { count: number(orphan.count), rows: array(orphan.rows).map(subscriptionRow) },
  };
}

function parseForecast(value: unknown): FinanceForecast {
  const raw = object(value);
  const window = (input: unknown): FinanceForecastWindow => {
    const item = object(input);
    return { ...moneyCount(item), missingValue: number(item.missing_value), rows: array(item.rows).map(subscriptionRow) };
  };
  return { undated: number(raw.undated), next7: window(raw.next7), next30: window(raw.next30) };
}

async function independently<T>(label: string, read: () => Promise<T>): Promise<FinanceBlockResult<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    console.error(`[admin-finance] falha isolada em ${label}`, error);
    return { ok: false };
  }
}

async function rpc(admin: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`[admin-finance] ${name}: ${error.message}`);
  return data;
}

export function financeGrain(period: ResolvedPeriod): FinanceRevenue['grain'] {
  const days = (Date.parse(period.to) - Date.parse(period.from)) / 86_400_000;
  return days <= 45 ? 'day' : days <= 180 ? 'week' : 'month';
}

/** Quatro RPCs independentes: uma falha nunca apaga os outros blocos. */
export async function loadAdminFinance(
  admin: SupabaseClient,
  period: ResolvedPeriod,
  now: Date = new Date(),
): Promise<AdminFinance> {
  const grain = financeGrain(period);
  const [revenue, current, attention, forecast] = await Promise.all([
    independently('receita', async () => parseRevenue(await rpc(admin, 'admin_financial_revenue', { p_from: period.from, p_to: period.to, p_grain: grain }), grain)),
    independently('MRR atual', async () => parseCurrent(await rpc(admin, 'admin_financial_current'))),
    independently('itens de atenção', async () => parseAttention(await rpc(admin, 'admin_financial_attention', { p_from: period.from, p_to: period.to }))),
    independently('previsão', async () => parseForecast(await rpc(admin, 'admin_financial_forecast', { p_now: now.toISOString() }))),
  ]);
  return { revenue, current, attention, forecast };
}
