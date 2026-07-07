import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

type Admin = ReturnType<typeof createAdminSupabaseClient>;

function unixToIso(secs: number | null | undefined): string | null {
  return secs ? new Date(secs * 1000).toISOString() : null;
}

// Em versões recentes da API Stripe, current_period_* migrou para o subscription item.
function periodBounds(sub: Stripe.Subscription): { start: string | null; end: string | null } {
  const subAny = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const item = sub.items?.data?.[0] as unknown as { current_period_start?: number; current_period_end?: number } | undefined;
  return {
    start: unixToIso(subAny.current_period_start ?? item?.current_period_start),
    end: unixToIso(subAny.current_period_end ?? item?.current_period_end),
  };
}

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? '';
}

/** user_id pode ser NULL no fluxo pagamento-primeiro (conta ainda não existe). */
async function resolveUserId(admin: Admin, sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;

  const customerId = customerIdOf(sub);
  if (!customerId) return null;
  const { data } = await admin
    .from('stripe_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function resolveEmail(sub: Stripe.Subscription, override?: string | null): Promise<string | null> {
  if (override) return override;
  const customerId = customerIdOf(sub);
  if (!customerId) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return customer.email ?? null;
  } catch {
    return null;
  }
}

export type UpsertResult = { userId: string | null; interval: string; status: string };

/**
 * Grava/atualiza a assinatura no Supabase a partir do objeto da Stripe.
 * Idempotente (upsert por id) — seguro chamar do webhook e de fallbacks.
 */
export async function upsertSubscription(sub: Stripe.Subscription, emailOverride?: string | null): Promise<UpsertResult> {
  const admin = createAdminSupabaseClient();
  const userId = await resolveUserId(admin, sub);
  const email = await resolveEmail(sub, emailOverride);

  const item = sub.items?.data?.[0];
  const price = item?.price;
  const interval = price?.recurring?.interval ?? 'month';
  const { start, end } = periodBounds(sub);

  const row = {
    id: sub.id,
    user_id: userId,
    email,
    stripe_customer_id: customerIdOf(sub),
    status: sub.status,
    price_id: price?.id ?? '',
    plan_interval: interval,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    current_period_start: start,
    current_period_end: end,
    canceled_at: unixToIso(sub.canceled_at),
    trial_end: unixToIso(sub.trial_end),
    metadata: (sub.metadata ?? {}) as Record<string, string>,
  };

  const { error } = await admin.from('subscriptions').upsert(row, { onConflict: 'id' });
  if (error) {
    console.error('[stripe-sync] erro ao upsert subscription:', error);
    throw error;
  }

  return { userId, interval, status: sub.status };
}

/**
 * Fallback sem webhook: sincroniza a assinatura de um checkout já pago
 * direto da API da Stripe. Cobre dev local sem `stripe listen` e atrasos
 * de entrega do webhook em produção.
 */
export async function syncSubscriptionFromSession(
  session: Stripe.Checkout.Session,
): Promise<UpsertResult | null> {
  if (session.mode !== 'subscription' || !session.subscription) return null;
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    return await upsertSubscription(sub, email);
  } catch (err) {
    console.error('[stripe-sync] erro ao sincronizar checkout session:', err);
    return null;
  }
}
