import type { SupabaseClient } from '@supabase/supabase-js';

export const ADMIN_CUSTOMERS_PAGE_SIZE = 25;

export const ADMIN_CUSTOMER_FILTERS = [
  'month',
  'year',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'cancellation_scheduled',
  'onboarding_incomplete',
  'no_content',
  'zero_credits',
  'paid_without_account',
] as const;

export type AdminCustomerFilter = (typeof ADMIN_CUSTOMER_FILTERS)[number];

export interface AdminCustomerQuery {
  search: string;
  filters: AdminCustomerFilter[];
  page: number;
}

export interface AdminCustomerRow {
  customerKey: string;
  userId: string | null;
  subscriptionId: string | null;
  name: string;
  email: string;
  accountCreatedAt: string | null;
  emailConfirmedAt: string | null;
  onboardingCompleted: boolean | null;
  planInterval: string | null;
  subscriptionStatus: string | null;
  subscriptionValue: number | null;
  accessUntil: string | null;
  cancelAtPeriodEnd: boolean;
  creditBalance: number | null;
  creditLimit: number | null;
  carouselCount: number;
  newsCount: number;
  scheduledCount: number;
  leadCreatedAt: string | null;
  checkoutCreatedAt: string | null;
  subscriptionCreatedAt: string | null;
  onboardingAt: string | null;
  firstContentAt: string | null;
}

export interface AdminCustomersPageData {
  rows: AdminCustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type RawRow = Record<string, unknown>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function parseAdminCustomerQuery(
  searchParams: Record<string, string | string[] | undefined> = {},
): AdminCustomerQuery {
  const allowed = new Set<string>(ADMIN_CUSTOMER_FILTERS);
  const rawFilters = Array.isArray(searchParams.f)
    ? searchParams.f
    : searchParams.f?.split(',') ?? [];
  const filters = [...new Set(rawFilters.filter((filter): filter is AdminCustomerFilter => allowed.has(filter)))];
  const rawPage = Number.parseInt(first(searchParams.page), 10);

  return {
    search: first(searchParams.q).trim().slice(0, 160),
    filters,
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapRow(row: RawRow): AdminCustomerRow {
  return {
    customerKey: String(row.customer_key ?? ''),
    userId: nullableString(row.user_id),
    subscriptionId: nullableString(row.subscription_id),
    name: String(row.name || 'Sem nome'),
    email: String(row.email || 'E-mail indisponível'),
    accountCreatedAt: nullableString(row.account_created_at),
    emailConfirmedAt: nullableString(row.email_confirmed_at),
    onboardingCompleted: typeof row.onboarding_completed === 'boolean' ? row.onboarding_completed : null,
    planInterval: nullableString(row.plan_interval),
    subscriptionStatus: nullableString(row.subscription_status),
    subscriptionValue: nullableNumber(row.subscription_value),
    accessUntil: nullableString(row.access_until),
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    creditBalance: nullableNumber(row.credit_balance),
    creditLimit: nullableNumber(row.credit_limit),
    carouselCount: nullableNumber(row.carousel_count) ?? 0,
    newsCount: nullableNumber(row.news_count) ?? 0,
    scheduledCount: nullableNumber(row.scheduled_count) ?? 0,
    leadCreatedAt: nullableString(row.lead_created_at),
    checkoutCreatedAt: nullableString(row.checkout_created_at),
    subscriptionCreatedAt: nullableString(row.subscription_created_at),
    onboardingAt: nullableString(row.onboarding_at),
    firstContentAt: nullableString(row.first_content_at),
  };
}

/**
 * A RPC faz o cruzamento com auth.users, os filtros e a paginação dentro do
 * Postgres. Nunca liste usuários do Auth aqui: isso tornaria a tela O(n) em
 * memória e impediria busca por assinantes que ainda não criaram conta.
 */
export async function loadAdminCustomers(
  admin: SupabaseClient,
  query: AdminCustomerQuery,
): Promise<AdminCustomersPageData> {
  const { data, error } = await admin.rpc('admin_list_customers', {
    p_search: query.search || null,
    p_filters: query.filters,
    p_page: query.page,
    p_page_size: ADMIN_CUSTOMERS_PAGE_SIZE,
  });

  if (error) throw new Error(`[admin-customers] ${error.message}`);
  const payload = (data ?? {}) as { total?: unknown; rows?: unknown };
  const total = nullableNumber(payload.total) ?? 0;
  const rows = Array.isArray(payload.rows) ? payload.rows.map((row) => mapRow(row as RawRow)) : [];

  return {
    rows,
    total,
    page: query.page,
    pageSize: ADMIN_CUSTOMERS_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_CUSTOMERS_PAGE_SIZE)),
  };
}
