import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
// Garante que o handler não seja pré-renderizado / cacheado.
export const dynamic = 'force-dynamic';

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

const PLAN_ALLOWANCE = (interval: string) => (interval === 'year' ? 300 : 200);

type UpsertResult = { userId: string | null; interval: string; status: string };

async function upsertSubscription(sub: Stripe.Subscription, emailOverride?: string | null): Promise<UpsertResult> {
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
    console.error('[stripe/webhook] erro ao upsert subscription:', error);
    throw error;
  }

  return { userId, interval, status: sub.status };
}

/** Sincroniza/recarrega créditos. reset=true zera o ciclo (renovação mensal). */
async function refreshCredits(admin: Admin, userId: string, interval: string, reset: boolean) {
  const { error } = await admin.rpc('refresh_credits', {
    p_user: userId,
    p_allowance: PLAN_ALLOWANCE(interval),
    p_reset: reset,
  });
  if (error) console.error('[stripe/webhook] refresh_credits:', error);
}

export async function POST(req: NextRequest) {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET ausente');
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Assinatura ausente' }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe/webhook] assinatura inválida:', err);
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Idempotência: se já processamos esse evento, sai com 200 sem reprocessar.
  const { data: already } = await admin
    .from('stripe_webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();
  if (already) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          // E-mail do checkout (lead ainda não tem conta).
          const email = session.customer_details?.email ?? session.customer_email ?? null;
          await upsertSubscription(sub, email);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case 'customer.subscription.updated': {
        const { userId, interval, status } = await upsertSubscription(event.data.object as Stripe.Subscription);
        // Upgrade/downgrade pelo portal: mantém allowance em dia e sobe o saldo
        // se aumentou (reset=false não derruba créditos por mudanças triviais).
        if (userId && (status === 'active' || status === 'trialing')) {
          await refreshCredits(admin, userId, interval, false);
        }
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } };
        // Recarga no início de cada ciclo de cobrança (não no primeiro pagamento,
        // quando o usuário ainda nem existe).
        if (invoice.billing_reason === 'subscription_cycle' && invoice.subscription) {
          const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
          const { data: row } = await admin
            .from('subscriptions')
            .select('user_id, plan_interval')
            .eq('id', subId)
            .maybeSingle();
          if (row?.user_id) {
            await refreshCredits(admin, row.user_id as string, (row.plan_interval as string) ?? 'month', true);
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn('[stripe/webhook] pagamento falhou para invoice:', invoice.id);
        break;
      }
      default:
        // Eventos não tratados são ignorados de propósito.
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] erro processando ${event.type}:`, err);
    // 500 ⇒ Stripe re-tenta. Como ainda não registramos o evento, ele será
    // reprocessado; os upserts (subscriptions por id) são idempotentes.
    return NextResponse.json({ error: 'Erro ao processar evento' }, { status: 500 });
  }

  // Só registra como processado depois do sucesso.
  await admin
    .from('stripe_webhook_events')
    .insert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });

  return NextResponse.json({ received: true });
}
