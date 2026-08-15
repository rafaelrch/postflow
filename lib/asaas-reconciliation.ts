/**
 * RECONCILIAÇÃO de eventos do Asaas que ficaram com `processed_at` nulo.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ─────────────────────────────────────────────
 * Um evento com `processed_at` nulo é um evento que chegou e NÃO concluiu. Hoje
 * existe um assim (`SUBSCRIPTION_DELETED` de 14/08) e ele é inofensivo: o
 * cancelamento tinha acabado de rodar pelo produto — 9,7s antes —, então o
 * estado local já estava certo quando o evento chegou.
 *
 * O caminho perigoso é o OUTRO: quando o cancelamento começa no PAINEL DO
 * ASAAS. Aí o webhook é o único canal. Se ele ficar pendente, a assinatura
 * continua `status='active'` depois do fim do período pago — a pessoa segue
 * com acesso que ninguém está pagando e o MRR do painel fica inflado. Nada
 * mais no sistema descobriria isso sozinho.
 *
 * ── AS DUAS REGRAS DURAS ────────────────────────────────────────────────────
 *
 * 1. CANCELAMENTO NÃO É REVOGAÇÃO. Cancelar encerra a RENOVAÇÃO; o acesso vai
 *    até o fim do período JÁ PAGO. Por isso o patch daqui nunca escreve
 *    `status` e nunca mexe em `current_period_end`: ele só marca
 *    `cancel_at_period_end` e `canceled_at`.
 *
 * 2. NADA REVOGA ACESSO AUTOMATICAMENTE. O que a reconciliação não souber
 *    resolver com segurança fica PENDENTE de propósito e vira alerta na aba
 *    Saúde. Quem corta cliente é o Rafael, olhando o caso. Um robô que corta
 *    acesso a partir de um evento atrasado erra em silêncio e do lado caro.
 *
 * ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────
 * Reprocessar o mesmo evento duas vezes não pode duplicar efeito. Aqui isso
 * não depende de sorte: todo campo escrito é ABSORVENTE (só vai de false para
 * true, só preenche o que está vazio). Não há incremento, não há crédito, não
 * há chamada externa. Rodar dez vezes tem o mesmo resultado de rodar uma.
 *
 * Módulo PURO na parte que decide. O I/O fica em `runReconciliation`, no fim.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractContext, statusFromAsaasSubscription, type WebhookContext } from './asaas-webhook';

/** Linha de subscriptions no que a reconciliação precisa enxergar. */
export interface ReconcilableSubscription {
  id: string;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: string | null;
  current_period_end?: string | null;
}

export type ReconcileSkipReason =
  /**
   * Evento que mexe em DINHEIRO ou em concessão de acesso (PAYMENT_CONFIRMED,
   * estorno, chargeback, inadimplência...). Reaplicar um desses fora de ordem,
   * dias depois, pode estender período pago, recarregar crédito ou derrubar
   * status a partir de um dado velho. Fica pendente e vira alerta — é
   * exatamente o caso do check `confirmed_unprocessed`, que já é crítico.
   */
  | 'unsafe_to_replay'
  /** Sem id de assinatura não há o que reconciliar (cobrança avulsa). */
  | 'no_subscription_id'
  /** O evento fala de uma assinatura que não existe no nosso banco. Criar a
   *  linha aqui seria inventar estado de pagamento. */
  | 'subscription_missing';

export type ReconcileDecision =
  /** Há o que gravar. O patch é absorvente e nunca toca em `status`. */
  | { kind: 'reconcile'; patch: Record<string, unknown> }
  /** O cancelamento já está registrado. Nada a escrever; o evento se conclui. */
  | { kind: 'already_reconciled' }
  /** Evento sem efeito nenhum (fora da nossa lista). Conclui e sai. */
  | { kind: 'noop' }
  /** A reconciliação não sabe resolver com segurança: FICA PENDENTE. */
  | { kind: 'skip'; reason: ReconcileSkipReason };

/**
 * O evento diz "esta assinatura foi cancelada no provedor"?
 *
 * `end_of_cycle` é o mapeamento direto (SUBSCRIPTION_DELETED / _INACTIVATED).
 * O `sync` entra quando o status CRU do Asaas já não é ACTIVE: um
 * SUBSCRIPTION_UPDATED com EXPIRED/INACTIVE carrega a mesma notícia.
 */
function announcesCancellation(ctx: WebhookContext): boolean {
  if (ctx.action === 'end_of_cycle') return true;
  return ctx.action === 'sync' && statusFromAsaasSubscription(ctx.rawStatus) === 'canceled';
}

/**
 * Decisão pura para UM evento pendente.
 *
 * Repare no que ela NÃO devolve em nenhum ramo: `status`, `current_period_end`,
 * `payment_confirmed_at`, crédito. Reconciliação registra cancelamento — ela
 * não concede nem tira acesso.
 */
export function decideReconciliation(
  ctx: WebhookContext,
  current: ReconcilableSubscription | null,
  now: Date = new Date(),
): ReconcileDecision {
  if (ctx.action === 'ignore') return { kind: 'noop' };

  if (!announcesCancellation(ctx)) {
    return { kind: 'skip', reason: 'unsafe_to_replay' };
  }

  if (!ctx.subscriptionId) return { kind: 'skip', reason: 'no_subscription_id' };
  if (!current) return { kind: 'skip', reason: 'subscription_missing' };

  // Cancelamento já registrado NÃO é revertido nem reescrito. Vale tanto para
  // `cancel_at_period_end` quanto para quem já está com status 'canceled' —
  // reescrever `canceled_at` moveria a data do cancelamento para a data da
  // reconciliação, que é uma mentira sobre quando o cliente cancelou.
  const jaCancelado =
    current.status === 'canceled' || (current.cancel_at_period_end === true && !!current.canceled_at);
  if (jaCancelado) return { kind: 'already_reconciled' };

  const nowIso = now.toISOString();
  const patch: Record<string, unknown> = {
    cancel_at_period_end: true,
    updated_at: nowIso,
  };

  // Só preenche se estiver vazio: se o cancelamento já tinha data, ela manda.
  if (!current.canceled_at) patch.canceled_at = nowIso;

  // Eco cru do provedor, para conciliação e debug — nunca para decidir acesso.
  if (ctx.rawStatus) patch.subscription_status = ctx.rawStatus;

  return { kind: 'reconcile', patch };
}

// ─── Execução ───────────────────────────────────────────────

export interface ReconciliationSummary {
  scanned: number;
  reconciled: number;
  alreadyReconciled: number;
  /** Continuam pendentes de propósito — cada um vira alerta na Saúde. */
  skipped: { eventId: string; reason: ReconcileSkipReason }[];
  /** Falha de I/O no meio. O evento fica pendente e será tentado de novo. */
  failed: number;
}

/** Teto por execução. Reconciliação é conserto de exceção, não varredura. */
const LIMITE_PADRAO = 50;

/**
 * Varre os eventos pendentes mais ANTIGOS primeiro e aplica a decisão.
 *
 * Nunca lança: a chamadora é uma rota administrativa (e, no futuro, poderia
 * ser outro gatilho). Erro de banco em um evento não pode interromper os
 * outros nem derrubar a resposta.
 */
export async function runReconciliation(
  admin: SupabaseClient,
  options: { limit?: number; now?: Date } = {},
): Promise<ReconciliationSummary> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? LIMITE_PADRAO, 1), 200);

  const summary: ReconciliationSummary = {
    scanned: 0,
    reconciled: 0,
    alreadyReconciled: 0,
    skipped: [],
    failed: 0,
  };

  const { data: events, error } = await admin
    .from('payment_webhook_events')
    .select('event_id, event_type, payload, received_at')
    .is('processed_at', null)
    .order('received_at', { ascending: true })
    .limit(limit);

  if (error || !events) {
    console.error('[asaas-reconciliation] pending_events_query_failed');
    summary.failed += 1;
    return summary;
  }

  for (const event of events as { event_id: string; payload: unknown }[]) {
    summary.scanned += 1;
    try {
      const ctx = extractContext(event.payload);

      let current: ReconcilableSubscription | null = null;
      if (ctx.subscriptionId) {
        const { data } = await admin
          .from('subscriptions')
          .select('id, status, cancel_at_period_end, canceled_at, current_period_end')
          .eq('id', ctx.subscriptionId)
          .maybeSingle();
        current = (data ?? null) as ReconcilableSubscription | null;
      }

      const decision = decideReconciliation(ctx, current, now);

      if (decision.kind === 'skip') {
        // Fica com processed_at nulo DE PROPÓSITO: é o que o alerta da Saúde lê.
        summary.skipped.push({ eventId: event.event_id, reason: decision.reason });
        continue;
      }

      if (decision.kind === 'reconcile') {
        // UPDATE por id, jamais upsert: um upsert criaria a assinatura caso ela
        // não existisse, inventando estado de pagamento a partir de um evento.
        const { error: updateError } = await admin
          .from('subscriptions')
          .update(decision.patch)
          .eq('id', ctx.subscriptionId as string);
        if (updateError) {
          console.error(`[asaas-reconciliation] subscription_update_failed event=${event.event_id}`);
          summary.failed += 1;
          continue;
        }
        summary.reconciled += 1;
      } else if (decision.kind === 'already_reconciled') {
        summary.alreadyReconciled += 1;
      }

      // `.is('processed_at', null)` é a trava contra corrida com o webhook: se
      // ele concluiu o mesmo evento no meio disto, o carimbo dele fica.
      const { error: markError } = await admin
        .from('payment_webhook_events')
        .update({ processed_at: now.toISOString() })
        .eq('event_id', event.event_id)
        .is('processed_at', null);
      if (markError) {
        console.error(`[asaas-reconciliation] mark_processed_failed event=${event.event_id}`);
        summary.failed += 1;
      }
    } catch {
      console.error(`[asaas-reconciliation] event_failed event=${event.event_id}`);
      summary.failed += 1;
    }
  }

  return summary;
}
