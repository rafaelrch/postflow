import {
  getCheckout,
  getCustomer,
  ABACATEPAY_PRODUCT_ANNUALLY,
  type AbacateCheckout,
  type AbacateCheckoutStatus,
} from '@/lib/abacatepay';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

type Admin = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Traduz o status da AbacatePay para o vocabulário interno que a tabela
 * `subscriptions` e a view `user_active_subscription` já usam (herdado da
 * Stripe). Manter um vocabulário só é o que permite não tocar em
 * getActiveSubscription, no gating de créditos nem na view.
 *
 * GAP CONHECIDO: a AbacatePay não expõe um estado equivalente a
 * `past_due`/`unpaid`. Cobrança recorrente que falha é retentada conforme a
 * `retryPolicy` e, esgotadas as tentativas, a assinatura vira CANCELLED. Não
 * há status observável para "está devendo mas ainda não cancelou" — logo esse
 * intervalo não é representável aqui.
 */
export function mapStatus(status: AbacateCheckoutStatus): string {
  switch (status) {
    case 'PAID':
      return 'active';
    case 'PENDING':
      return 'incomplete';
    case 'EXPIRED':
      return 'incomplete_expired';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

/** O produto contratado define o intervalo — não há campo de intervalo no checkout. */
export function intervalOf(checkout: AbacateCheckout): 'month' | 'year' {
  const productId = checkout.items?.[0]?.id;
  return productId && productId === ABACATEPAY_PRODUCT_ANNUALLY ? 'year' : 'month';
}

/** user_id pode ser NULL no fluxo pagamento-primeiro (conta ainda não existe). */
async function resolveUserId(admin: Admin, checkout: AbacateCheckout): Promise<string | null> {
  const fromMeta = checkout.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;

  if (!checkout.customerId) return null;
  const { data } = await admin
    .from('abacatepay_customers')
    .select('user_id')
    .eq('abacatepay_customer_id', checkout.customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * E-mail do pagador. O objeto de checkout NÃO carrega e-mail — só
 * `customerId` — então é preciso uma segunda chamada. É exatamente por isso
 * que o checkout é criado com um customer já vinculado (ver
 * app/api/abacatepay/checkout/route.ts): sem `customerId` não há e-mail
 * verificável, e o fix B2 depende dele.
 */
export async function resolveEmail(checkout: AbacateCheckout): Promise<string | null> {
  if (!checkout.customerId) return null;
  try {
    const customer = await getCustomer(checkout.customerId);
    return customer.email ?? null;
  } catch {
    return null;
  }
}

export type UpsertResult = { userId: string | null; interval: string; status: string };

/**
 * Grava/atualiza a assinatura no Supabase a partir do checkout da AbacatePay.
 * Idempotente (upsert por id) — seguro chamar do webhook e de fallbacks.
 */
export async function upsertSubscription(
  checkout: AbacateCheckout,
  emailOverride?: string | null,
): Promise<UpsertResult> {
  const admin = createAdminSupabaseClient();
  const userId = await resolveUserId(admin, checkout);
  const email = emailOverride ?? (await resolveEmail(checkout));
  const status = mapStatus(checkout.status);
  const interval = intervalOf(checkout);

  const row = {
    id: checkout.id,
    provider: 'abacatepay',
    user_id: userId,
    email,
    abacatepay_customer_id: checkout.customerId,
    stripe_customer_id: null,
    status,
    price_id: checkout.items?.[0]?.id ?? '',
    plan_interval: interval,
    cancel_at_period_end: false,
    current_period_start: checkout.createdAt ?? null,
    current_period_end: checkout.nextChargeAt ?? null,
    canceled_at: checkout.status === 'CANCELLED' ? checkout.updatedAt : null,
    trial_end: checkout.trialEndsAt ?? null,
    metadata: checkout.metadata ?? {},
  };

  const { error } = await admin.from('subscriptions').upsert(row, { onConflict: 'id' });
  if (error) {
    console.error('[abacatepay-sync] erro ao upsert subscription:', error);
    throw error;
  }

  return { userId, interval, status };
}

/**
 * Fallback sem webhook: busca o checkout na API e sincroniza. Cobre dev local
 * sem webhook configurado e atraso de entrega em produção. Equivalente ao
 * syncSubscriptionFromSession() da Stripe.
 */
export async function syncSubscriptionFromCheckout(
  checkoutId: string,
): Promise<UpsertResult | null> {
  try {
    const checkout = await getCheckout(checkoutId);
    if (checkout.frequency !== 'SUBSCRIPTION') return null;
    return await upsertSubscription(checkout);
  } catch (err) {
    console.error('[abacatepay-sync] erro ao sincronizar checkout:', err);
    return null;
  }
}
