/**
 * Regra do webhook do Asaas — módulo PURO.
 *
 * Nada de fetch, nada de Supabase: só tradução de payload em intenção. A rota
 * (app/api/asaas/webhook/route.ts) faz o I/O. Mesmo desenho do webhook
 * anterior, pelo mesmo motivo: a decisão de "este evento
 * libera ou revoga acesso" é a parte que precisa de teste denso, e ela não
 * deve depender de mock de banco para ser exercitada.
 *
 * ⚠️ Parsing TOLERANTE por contrato: o Asaas acrescenta atributos ao payload
 * sem aviso prévio. Nenhuma função aqui rejeita chave desconhecida; campo que
 * não reconhecemos é simplesmente ignorado. Um payload com campo novo NUNCA
 * pode virar erro — erro vira reentrega, e reentrega repetida pausa a fila.
 */

import { timingSafeEqual } from 'node:crypto';
import type { SubscriptionStatus } from '@/types/payments';
import { PLANS, type PlanInterval } from '@/lib/plans';

// ─── Autenticação ───────────────────────────────────────────

export type TokenCheck = 'ok' | 'unauthorized' | 'not_configured';

/** Comparação de tamanho constante que tolera tamanhos diferentes. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Confere o header `asaas-access-token` contra ASAAS_WEBHOOK_TOKEN.
 *
 * O Asaas NÃO assina o corpo (não há HMAC como na AbacatePay ou na Stripe):
 * este token compartilhado é a ÚNICA barreira entre a internet e a rota que
 * marca assinatura como paga. Por isso a comparação é em tempo constante —
 * com `===`, o tempo de resposta vaza quantos bytes iniciais o atacante
 * acertou, e o token pode ser descoberto byte a byte.
 *
 * Sem a env configurada devolve 'not_configured', e a rota recusa TUDO. O
 * contrário — aceitar qualquer chamada quando falta configuração — deixaria
 * um ambiente mal provisionado com o webhook escancarado.
 */
export function verifyAccessToken(header: string | null | undefined): TokenCheck {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected) return 'not_configured';
  if (!header) return 'unauthorized';
  return safeEqual(expected, header) ? 'ok' : 'unauthorized';
}

// ─── Mapeamento evento → ação ───────────────────────────────

export type WebhookAction =
  /** Libera/renova o acesso. */
  | 'grant'
  /** Dinheiro caiu na conta. NÃO mexe em acesso. */
  | 'confirm_receipt'
  /** Cobrança vencida: tolerância, o usuário precisa ser avisado. */
  | 'past_due'
  /** Cartão recusado: precisa de um cartão novo. */
  | 'payment_failed'
  /** Tira o acesso agora. */
  | 'revoke'
  /** Só reflete o estado da assinatura no banco. */
  | 'sync'
  /** Encerra ao fim do ciclo já pago. */
  | 'end_of_cycle'
  /** Não tratado: registra e segue. */
  | 'ignore';

/**
 * ⚠️⚠️ A LINHA MAIS IMPORTANTE DESTE ARQUIVO ⚠️⚠️
 *
 * O gatilho de LIBERAÇÃO é PAYMENT_CONFIRMED, **NUNCA** PAYMENT_RECEIVED.
 *
 * No cartão de crédito os dois eventos são separados por ~32 dias:
 * CONFIRMED é quando a operadora aprova a transação (o cliente já pagou, o
 * acesso deve começar AGORA); RECEIVED é quando o dinheiro efetivamente cai na
 * conta Asaas. Trocar um pelo outro deixaria TODO assinante de cartão um mês
 * sem acesso depois de pagar. É o erro mais fácil de cometer aqui, e ele só
 * apareceria em produção, um mês depois, com o cliente reclamando.
 *
 * PAYMENT_RECEIVED continua sendo tratado — mas como conciliação financeira
 * ('confirm_receipt'), sem tocar em acesso.
 */
export const EVENT_ACTIONS: Record<string, WebhookAction> = {
  // ── Cobrança ──
  PAYMENT_CONFIRMED: 'grant',
  PAYMENT_RECEIVED: 'confirm_receipt',
  PAYMENT_OVERDUE: 'past_due',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'payment_failed',
  PAYMENT_REFUNDED: 'revoke',
  PAYMENT_CHARGEBACK_REQUESTED: 'revoke',
  // ── Assinatura ──
  SUBSCRIPTION_CREATED: 'sync',
  SUBSCRIPTION_UPDATED: 'sync',
  SUBSCRIPTION_INACTIVATED: 'end_of_cycle',
  SUBSCRIPTION_DELETED: 'end_of_cycle',
};

/**
 * Ação do evento. A lista do Asaas tem ~30 eventos e tratamos 10; o resto cai
 * em 'ignore' de propósito — responder 2xx e não fazer nada é o comportamento
 * correto para evento que não nos interessa.
 */
export function actionFor(event: string | null | undefined): WebhookAction {
  if (!event) return 'ignore';
  return EVENT_ACTIONS[event] ?? 'ignore';
}

/**
 * Status interno resultante da ação, ou null quando a ação não mexe em status.
 *
 * Vocabulário INTERNO ('active'|'trialing'|'past_due'|'unpaid'|'canceled'), que
 * tem CHECK no banco. O status cru do Asaas vai para `subscription_status`, sem
 * tradução.
 *
 * `past_due` merece nota: o Asaas NÃO tem esse estado para assinatura — os
 * status dele são ACTIVE|EXPIRED|INACTIVE, e quem fica OVERDUE é a COBRANÇA.
 * Por isso past_due nasce de PAYMENT_OVERDUE, nunca do status da subscription.
 */
export function statusForAction(action: WebhookAction): SubscriptionStatus | null {
  switch (action) {
    case 'grant':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'payment_failed':
      // Cartão recusado é diferente de fatura vencida: não há o que esperar,
      // a cobrança falhou. 'unpaid' já é o vocabulário do app para isso.
      return 'unpaid';
    case 'revoke':
      return 'canceled';
    case 'confirm_receipt':
    case 'sync':
    case 'end_of_cycle':
    case 'ignore':
      // 'sync' e 'end_of_cycle' decidem o status por outro caminho (o status
      // cru da assinatura / o fim do ciclo pago), e 'confirm_receipt' não mexe
      // em acesso. Ver buildSubscriptionPatch.
      return null;
  }
}

/**
 * Traduz o status CRU da assinatura no Asaas para o nosso vocabulário.
 * Usado só na ação 'sync'. Desconhecido nunca vira acesso ativo.
 */
export function statusFromAsaasSubscription(raw: string | null | undefined): SubscriptionStatus {
  switch (raw) {
    case 'ACTIVE':
      return 'active';
    case 'EXPIRED':
    case 'INACTIVE':
      return 'canceled';
    default:
      return 'canceled';
  }
}

// ─── Extração do payload ────────────────────────────────────

/** Leitura defensiva: o payload é JSON arbitrário vindo da rede. */
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface WebhookContext {
  eventId: string | null;
  event: string | null;
  action: WebhookAction;
  /** Id da assinatura no Asaas — é a PK da nossa tabela subscriptions. */
  subscriptionId: string | null;
  /** Última cobrança conhecida (pay_xxx), quando o evento é de cobrança. */
  paymentId: string | null;
  customerId: string | null;
  /**
   * externalReference = id do lead. NA PRÁTICA VEM SEMPRE NULL: mandamos na
   * criação do checkout e o Asaas não propaga para payment nem para
   * subscription (medido em sandbox, 12/08/2026). Continua sendo lido porque é
   * a fonte mais direta SE um dia passar a vir. Ver `checkoutSession`.
   */
  externalReference: string | null;
  /**
   * `checkoutSession` — o id do checkout que o POST /v3/checkouts nos devolveu.
   * É o que o Asaas DE FATO devolve no webhook, e a chave de
   * payment_checkout_refs, que traduz de volta para o lead. Sem isto a
   * atribuição lead↔pagamento se perde.
   */
  checkoutSession: string | null;
  value: number | null;
  cycle: string | null;
  billingType: string | null;
  nextDueDate: string | null;
  /** Status cru do Asaas, do objeto que veio no evento. */
  rawStatus: string | null;
}

/**
 * Achata o envelope do webhook num contexto único.
 *
 * O envelope traz `payment` OU `subscription` conforme o evento. Nos eventos de
 * cobrança o id da assinatura vem em `payment.subscription` — é ele, e não o
 * `payment.id`, que casa com a PK da nossa tabela.
 */
export function extractContext(payload: unknown): WebhookContext {
  const root = obj(payload);
  const payment = obj(root.payment);
  const subscription = obj(root.subscription);
  const event = str(root.event);

  const isPaymentEvent = Object.keys(payment).length > 0;

  return {
    eventId: str(root.id),
    event,
    action: actionFor(event),
    subscriptionId: isPaymentEvent ? str(payment.subscription) : str(subscription.id),
    paymentId: isPaymentEvent ? str(payment.id) : null,
    customerId: str(payment.customer) ?? str(subscription.customer),
    externalReference:
      str(payment.externalReference) ?? str(subscription.externalReference),
    // Ordem payment → subscription: nos eventos de cobrança os dois trazem o
    // MESMO id de checkout, e nos de assinatura só o segundo existe.
    checkoutSession: str(payment.checkoutSession) ?? str(subscription.checkoutSession),
    value: num(payment.value) ?? num(subscription.value),
    cycle: str(subscription.cycle),
    billingType: str(payment.billingType) ?? str(subscription.billingType),
    nextDueDate: str(subscription.nextDueDate) ?? str(payment.dueDate),
    rawStatus: isPaymentEvent ? str(payment.status) : str(subscription.status),
  };
}

/**
 * Intervalo do plano. NOT NULL no banco, então sempre sai um valor.
 *
 * Ordem: o `cycle` da assinatura é a fonte melhor; sem ele, o VALOR identifica
 * o plano sem ambiguidade (59,50 vs 499); sem os dois, o que já está gravado.
 * O último recurso é 'month' com log de erro — mascarar isso significaria
 * renovar um plano anual como mensal, então não pode passar calado.
 */
export function intervalFor(input: {
  cycle?: string | null;
  value?: number | null;
  current?: string | null;
  subscriptionId?: string | null;
}): PlanInterval {
  if (input.cycle === 'YEARLY') return 'year';
  if (input.cycle === 'MONTHLY') return 'month';

  if (input.value === PLANS.year.value) return 'year';
  if (input.value === PLANS.month.value) return 'month';

  if (input.current === 'year' || input.current === 'month') return input.current;

  console.error(
    '[asaas-webhook] interval_undetermined: sem cycle, sem valor conhecido e sem ' +
      `linha anterior. Assinatura ${input.subscriptionId ?? '(sem id)'} gravada como 'month'.`,
  );
  return 'month';
}

/**
 * Aplica o lead resolvido pela `payment_checkout_refs` ao contexto.
 *
 * PRECEDÊNCIA, e a ordem importa:
 *   1. `externalReference` do evento — a fonte direta. Hoje nunca vem, mas se o
 *      Asaas passar a mandar, ele ganha: veio do próprio objeto do pagamento.
 *   2. lead resolvido pelo `checkoutSession` — o caminho que funciona hoje.
 *
 * Separado de buildSubscriptionPatch porque a resolução exige banco (fica na
 * rota) enquanto a REGRA de precedência é pura e precisa de teste próprio.
 * Devolve o mesmo ctx quando não há nada a mudar.
 */
export function withResolvedLead(
  ctx: WebhookContext,
  resolvedLeadId: string | null,
): WebhookContext {
  if (ctx.externalReference) return ctx;
  if (!resolvedLeadId) return ctx;
  return { ...ctx, externalReference: resolvedLeadId };
}

/** Linha existente, no que interessa para decidir o patch. */
export interface CurrentSubscription {
  status?: string | null;
  plan_interval?: string | null;
  external_reference?: string | null;
  current_period_end?: string | null;
  user_id?: string | null;
}

export type SubscriptionPatch = Record<string, unknown>;

/**
 * Monta o patch a gravar em public.subscriptions.
 *
 * Regras que valem a pena ler antes de mexer:
 *
 * • NUNCA sobrescreve external_reference com null. Ele é o id do lead, e o Asaas
 *   comprovadamente NÃO propaga o externalReference do checkout para os objetos
 *   de payment/subscription (por isso existe withResolvedLead + a
 *   payment_checkout_refs). Se nem o evento nem a ponte resolverem, o que já
 *   está gravado vale — perder essa chave quebra a conciliação lead↔pagamento.
 *
 * • 'confirm_receipt' NÃO mexe em status. Só registra a cobrança e o status cru,
 *   para conciliação. Ver o aviso em EVENT_ACTIONS.
 *
 * • 'end_of_cycle' marca cancel_at_period_end, e só derruba o status para
 *   'canceled' quando NÃO há ciclo pago restante. Quem já pagou o mês fica com
 *   o mês.
 */
export function buildSubscriptionPatch(
  ctx: WebhookContext,
  current: CurrentSubscription | null,
  now: Date = new Date(),
): SubscriptionPatch {
  const nowIso = now.toISOString();

  const patch: SubscriptionPatch = {
    id: ctx.subscriptionId,
    payment_provider: 'asaas',
    provider_subscription_id: ctx.subscriptionId,
    // Status CRU do Asaas, sem tradução — é o campo de debug do webhook.
    subscription_status: ctx.rawStatus,
    plan_interval: intervalFor({
      cycle: ctx.cycle,
      value: ctx.value,
      current: current?.plan_interval,
      subscriptionId: ctx.subscriptionId,
    }),
    updated_at: nowIso,
  };

  if (ctx.customerId) patch.provider_customer_id = ctx.customerId;
  if (ctx.paymentId) patch.provider_payment_id = ctx.paymentId;
  if (ctx.value !== null) patch.value = ctx.value;
  if (ctx.billingType) patch.billing_type = ctx.billingType;
  if (ctx.cycle) patch.cycle = ctx.cycle;
  if (ctx.nextDueDate) patch.next_due_date = ctx.nextDueDate;

  // Só grava se veio algo; jamais apaga o que já existe.
  const externalReference = ctx.externalReference ?? current?.external_reference ?? null;
  if (externalReference) patch.external_reference = externalReference;

  const mapped = statusForAction(ctx.action);
  if (mapped) {
    patch.status = mapped;
    patch.canceled_at = mapped === 'canceled' ? nowIso : null;
    if (mapped === 'active') patch.cancel_at_period_end = false;
    return patch;
  }

  if (ctx.action === 'sync') {
    patch.status = statusFromAsaasSubscription(ctx.rawStatus);
    if (patch.status === 'canceled') patch.canceled_at = nowIso;
    return patch;
  }

  if (ctx.action === 'end_of_cycle') {
    patch.cancel_at_period_end = true;
    patch.canceled_at = nowIso;
    // Só corta o acesso agora se não sobrou ciclo pago.
    const periodEnd = current?.current_period_end
      ? Date.parse(current.current_period_end)
      : NaN;
    const hasPaidRemainder = Number.isFinite(periodEnd) && periodEnd > now.getTime();
    if (!hasPaidRemainder) patch.status = 'canceled';
    return patch;
  }

  // 'confirm_receipt' e 'ignore': status intocado.
  return patch;
}

/**
 * Créditos a provisionar por ciclo. O NÚMERO AUTORITATIVO é a função
 * plan_allowance(p_interval) no banco — refresh_credits recusa qualquer valor
 * que não bata com ela (invalid_credit_allowance). Este espelho existe só para
 * a chamada saber o que pedir; se um dia divergirem, a RPC falha alto em vez de
 * conceder crédito errado.
 */
export function allowanceFor(interval: PlanInterval): number {
  return interval === 'year' ? 300 : 200;
}
