import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS } from './plans';
import type { ResolvedPeriod } from './admin-period';

/**
 * Agregação da aba "Visão geral" do painel administrativo.
 *
 * ── REGRAS QUE ESTE ARQUIVO EXISTE PARA NÃO QUEBRAR ─────────────────────────
 *
 * 1. AGREGA NO POSTGRES. Todo número aqui sai de um `count: 'exact', head:
 *    true` — o Postgres conta e devolve um inteiro no header. Em nenhum
 *    momento uma lista de usuários viaja para o Node só para ter `.length`
 *    tirado, muito menos para o navegador.
 *
 * 2. NADA DE RECEITA. `subscriptions.value` é valor CONTRATADO, não dinheiro
 *    recebido. Somar isso e chamar de faturamento é errado por definição, e
 *    receita de verdade depende da tabela normalizada de transações que ainda
 *    não existe. Aqui só existe MRR/ARR, que são compromisso recorrente.
 *
 * 3. PREÇO VEM DE lib/plans.ts. Se o Rafael mudar o preço lá, o MRR muda
 *    junto. Um 59,5 digitado aqui viraria um painel que mente devagar.
 *
 * 4. SEM PROXY DE ATIVIDADE. Não há instrumentação de sessão/evento no
 *    produto (ver docs/admin-dashboard-analise.md), então não existe DAU,
 *    "online agora" nem uso de feature nesta fatia — nem aproximado.
 */

/** Status que dão acesso pago hoje. */
export const ACTIVE_STATUSES = ['active', 'trialing'] as const;

/**
 * Teto de linhas lidas de payment_checkout_refs para deduplicar lead.
 *
 * O PostgREST não tem `count(distinct)`. Como a pergunta é "quantas PESSOAS
 * abriram checkout" e não "quantas tentativas", a dedupe acontece no servidor
 * lendo UMA coluna (lead_id) da tabela mais magra do schema. O teto existe
 * para que o custo continue previsível se um dia a tabela crescer — e, quando
 * bater nele, o painel AVISA em vez de mostrar um número truncado como se
 * fosse o total.
 */
export const CHECKOUT_LEADS_CAP = 5000;

export interface AdminOverview {
  /** Instante em que os números foram lidos. */
  generatedAt: string;
  accounts: {
    /** Contas em Supabase Auth. */
    total: number;
  };
  profiles: {
    total: number;
    createdInPeriod: number;
    createdInPreviousPeriod: number;
    onboardingCompleted: number;
    onboardingIncomplete: number;
  };
  subscriptions: {
    active: number;
    withAccount: number;
    withoutAccount: number;
    monthly: number;
    yearly: number;
    scheduledCancellation: number;
  };
  recurring: {
    mrr: number;
    arr: number;
  };
  renewals: {
    next7: RenewalWindow;
    next30: RenewalWindow;
  };
  funnel: {
    leads: number;
    leadsPrevious: number;
    checkoutAttempts: number;
    checkoutLeads: number;
    /** True se batemos em CHECKOUT_LEADS_CAP — o número é um piso, não o total. */
    checkoutLeadsCapped: boolean;
  };
  credits: {
    zeroBalance: number;
  };
}

export interface RenewalWindow {
  monthly: number;
  yearly: number;
  count: number;
  /** Soma do que será cobrado na renovação (mensal cobra 1 mês, anual 1 ano). */
  amount: number;
}

/**
 * MRR normalizado: mensal entra pelo valor cheio, anual entra dividido por 12.
 * A anual NÃO vira "499 de receita no mês em que foi paga" — isso inflaria o
 * mês da venda e zeraria os onze seguintes.
 */
export function normalizedMrr(monthly: number, yearly: number): number {
  return monthly * PLANS.month.value + (yearly * PLANS.year.value) / 12;
}

/** ARR = MRR normalizado × 12. É projeção do contratado, não histórico. */
export function estimatedArr(mrr: number): number {
  return mrr * 12;
}

/**
 * Dinheiro que a renovação de fato cobra na janela: a mensal cobra um mês, a
 * anual cobra o ano inteiro. Aqui NÃO se divide por 12 — o assinante anual que
 * renova amanhã paga 499 amanhã, e é caixa, não MRR.
 */
export function renewalAmount(monthly: number, yearly: number): number {
  return monthly * PLANS.month.value + yearly * PLANS.year.value;
}

/**
 * Variação percentual honesta entre dois períodos de mesma duração.
 * Devolve null quando o período anterior é zero: "+∞%" ou "+100%" saindo de
 * zero não informa nada, e um traço é mais verdadeiro que um número inventado.
 */
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
 * Lê tudo o que a Visão geral mostra.
 *
 * ⚠️ Só chame com o client service_role e SÓ depois de requireAdmin() ter
 * devolvido ok. Este módulo não confere permissão — quem chama confere.
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
    leads,
    leadsPrevious,
    checkoutAttempts,
    checkoutLeadRows,
    zeroBalance,
  ] = await Promise.all([
    // listUsers com perPage: 1 devolve o `total` do GoTrue sem trazer a lista.
    // É a contagem exata de contas sem paginar o banco inteiro para o Node.
    admin.auth.admin.listUsers({ page: 1, perPage: 1 }).then(({ data, error }) => {
      if (error) throw new Error(`[admin-metrics] auth.listUsers: ${error.message}`);
      return (data as { total?: number }).total ?? 0;
    }),
    readCount('profiles', admin.from('profiles').select('id', { count: 'exact', head: true })),
    readCount(
      'profiles no período',
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', period.from)
        .lt('created_at', period.to),
    ),
    readCount(
      'profiles no período anterior',
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', period.previous.from)
        .lt('created_at', period.previous.to),
    ),
    readCount(
      'onboarding concluído',
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    ),
    readCount(
      'onboarding incompleto',
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('onboarding_completed', false),
    ),
    readCount('assinaturas ativas', activeSubs()),
    readCount('assinantes com conta', activeSubs().not('user_id', 'is', null)),
    readCount('pagou sem conta', activeSubs().is('user_id', null)),
    readCount('ativas mensais', activeSubs().eq('plan_interval', 'month')),
    readCount('ativas anuais', activeSubs().eq('plan_interval', 'year')),
    readCount('cancelamento agendado', activeSubs().eq('cancel_at_period_end', true)),
    readCount('renovações 7d mensais', renewalsIn(in7, 'month')),
    readCount('renovações 7d anuais', renewalsIn(in7, 'year')),
    readCount('renovações 30d mensais', renewalsIn(in30, 'month')),
    readCount('renovações 30d anuais', renewalsIn(in30, 'year')),
    readCount(
      'leads no período',
      admin.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', period.from).lt('created_at', period.to),
    ),
    readCount(
      'leads no período anterior',
      admin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', period.previous.from)
        .lt('created_at', period.previous.to),
    ),
    readCount(
      'checkouts iniciados',
      admin
        .from('payment_checkout_refs')
        .select('checkout_session_id', { count: 'exact', head: true })
        .gte('created_at', period.from)
        .lt('created_at', period.to),
    ),
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
    readCount('clientes sem crédito', admin.from('user_credits').select('user_id', { count: 'exact', head: true }).eq('balance', 0)),
  ]);

  const checkoutLeadsCapped = checkoutLeadRows.length > CHECKOUT_LEADS_CAP;
  const checkoutLeads = new Set(checkoutLeadRows.slice(0, CHECKOUT_LEADS_CAP).map((row) => row.lead_id)).size;

  const mrr = normalizedMrr(monthly, yearly);

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
    recurring: { mrr, arr: estimatedArr(mrr) },
    renewals: {
      next7: {
        monthly: renew7Monthly,
        yearly: renew7Yearly,
        count: renew7Monthly + renew7Yearly,
        amount: renewalAmount(renew7Monthly, renew7Yearly),
      },
      next30: {
        monthly: renew30Monthly,
        yearly: renew30Yearly,
        count: renew30Monthly + renew30Yearly,
        amount: renewalAmount(renew30Monthly, renew30Yearly),
      },
    },
    funnel: {
      leads,
      leadsPrevious,
      checkoutAttempts,
      checkoutLeads,
      checkoutLeadsCapped,
    },
    credits: { zeroBalance },
  };
}
