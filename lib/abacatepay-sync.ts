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
      return 'canceled';
    case 'REFUNDED':
      return 'refunded';
    default:
      // Status desconhecido NUNCA vira acesso ativo.
      return 'incomplete';
  }
}

/**
 * Eventos que retiram acesso. Para eles o status vem do EVENTO, nunca do
 * `checkout.status` relido.
 *
 * Motivo (A1) — apurado contra a API dev em 20/07/2026, não deduzido da doc:
 * o checkout (`bill_...`) e a assinatura (`subs_...`) são objetos DIFERENTES.
 * `POST /subscriptions/cancel` só aceita id com prefixo `subs_` (com `bill_`
 * responde "Subscription not found"), ou seja, o ciclo de vida da assinatura
 * acontece num objeto que o `getCheckout()` não observa. Reler o checkout num
 * `checkout.disputed` pode devolver PAID e reafirmar acesso justamente durante
 * um chargeback. O tipo do evento é a fonte de verdade sobre o que aconteceu;
 * o checkout serve só para dados acessórios (valor, produto, cliente).
 *
 * Não foi possível observar um checkout PAGO em dev: não existe endpoint de
 * simulação de pagamento para assinatura (`/checkouts/simulate-payment`,
 * `/subscriptions/simulate-payment` e `/billing/simulate-payment` respondem
 * "Not found"), e `/subscriptions/list` fica vazia enquanto nada é pago. Daí a
 * escolha por falhar fechado em vez de confiar no status relido.
 */
const REVOKING_EVENT_STATUS: Record<string, string> = {
  'checkout.disputed': 'disputed',
  'checkout.refunded': 'refunded',
  'subscription.cancelled': 'canceled',
};

/**
 * Status final a gravar. Se o evento retira acesso, ele vence — o
 * `checkout.status` não tem poder de promover de volta para 'active'.
 */
export function statusForEvent(
  event: string | null | undefined,
  checkoutStatus: AbacateCheckoutStatus,
): string {
  if (event && event in REVOKING_EVENT_STATUS) return REVOKING_EVENT_STATUS[event];
  return mapStatus(checkoutStatus);
}

/** Um status que retira acesso nunca deve ser sobrescrito por um re-read. */
export function isRevokingEvent(event: string | null | undefined): boolean {
  return !!event && event in REVOKING_EVENT_STATUS;
}

/**
 * O produto contratado define o intervalo — não há campo de intervalo no
 * checkout.
 *
 * A7: sem ABACATEPAY_PRODUCT_ANNUALLY configurada, toda compra cairia
 * silenciosamente em 'month' — inclusive uma anual, que passaria a renovar
 * como mensal. Loga em vez de mascarar.
 */
export function intervalOf(checkout: AbacateCheckout): 'month' | 'year' {
  const productId = checkout.items?.[0]?.id;
  if (!ABACATEPAY_PRODUCT_ANNUALLY) {
    console.error(
      '[abacatepay-sync] ABACATEPAY_PRODUCT_ANNUALLY ausente: não dá para ' +
        `distinguir plano anual de mensal. Checkout ${checkout.id} gravado como 'month'.`,
    );
    return 'month';
  }
  return productId === ABACATEPAY_PRODUCT_ANNUALLY ? 'year' : 'month';
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
 *
 * `event`, quando presente, é o tipo do evento de webhook que originou a
 * chamada. Eventos que retiram acesso (disputa, estorno, cancelamento) vencem
 * o `checkout.status` — ver REVOKING_EVENT_STATUS.
 */
export async function upsertSubscription(
  checkout: AbacateCheckout,
  emailOverride?: string | null,
  event?: string | null,
): Promise<UpsertResult> {
  const admin = createAdminSupabaseClient();
  const userId = await resolveUserId(admin, checkout);
  const email = emailOverride ?? (await resolveEmail(checkout));
  const status = statusForEvent(event, checkout.status);
  const interval = intervalOf(checkout);
  const revoking = isRevokingEvent(event);

  const row = {
    id: checkout.id,
    provider: 'abacatepay',
    user_id: userId,
    email,
    abacatepay_customer_id: checkout.customerId,
    status,
    price_id: checkout.items?.[0]?.id ?? '',
    plan_interval: interval,
    // A3: a AbacatePay cancela na hora (`cancelPolicy: NOW`, sem carência),
    // então não existe o estado "cancelada mas ativa até o fim do período"
    // que esse campo representa na Stripe. Fica sempre false porque o
    // provedor não oferece essa modalidade — não é default esquecido.
    cancel_at_period_end: false,
    current_period_start: checkout.createdAt ?? null,
    // Numa revogação não há próxima cobrança: não propagar nextChargeAt
    // evita deixar um período futuro aberto num registro sem acesso.
    current_period_end: revoking ? null : (checkout.nextChargeAt ?? null),
    canceled_at: revoking ? (checkout.updatedAt ?? new Date().toISOString()) : null,
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
