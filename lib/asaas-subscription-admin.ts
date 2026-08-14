/**
 * Operações de assinatura que mexem no Asaas E no nosso banco.
 *
 * ⚠️ SERVIDOR APENAS. Usa o service role e a API key do Asaas.
 *
 * Fica fora de lib/asaas/ de propósito: aquele diretório é a camada fina sobre
 * a API (nenhuma regra de negócio, nenhum Supabase). Aqui é a cola entre os
 * dois mundos — cancelar no gateway E refletir no banco é regra nossa, não do
 * provedor.
 */

import { cancelSubscription, getSubscription } from '@/lib/asaas/subscriptions';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { AsaasError } from '@/lib/asaas/client';
import { planFor, type PlanInterval } from '@/lib/plans';

export type CancelResult =
  | { ok: true; alreadyCanceled: boolean }
  | { ok: false; reason: 'not_found' | 'provider_error' };

/**
 * Cancela a assinatura no Asaas e marca 'canceled' no banco.
 *
 * ORDEM IMPORTA: primeiro o gateway, depois o banco. Se invertêssemos e o
 * DELETE falhasse, o usuário veria "cancelado" enquanto o cartão continuaria
 * sendo cobrado todo mês — o pior erro possível deste fluxo. Do jeito certo, a
 * falha aparece como erro e nada mente para o usuário.
 *
 * 404 do Asaas é tratado como sucesso: assinatura que não existe lá já está
 * cancelada para todos os efeitos, e travar o cancelamento local por causa
 * disso deixaria uma linha 'active' eterna no nosso banco.
 */
export async function cancelUserSubscription(
  subscriptionId: string,
): Promise<CancelResult> {
  const admin = createAdminSupabaseClient();

  const { data: row } = await admin
    .from('subscriptions')
    .select('id, status')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!row?.id) return { ok: false, reason: 'not_found' };
  if (row.status === 'canceled') return { ok: true, alreadyCanceled: true };

  try {
    await cancelSubscription(subscriptionId);
  } catch (err) {
    if (!(err instanceof AsaasError) || err.status !== 404) {
      console.error('[asaas] cancel_failed');
      return { ok: false, reason: 'provider_error' };
    }
  }

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('id', subscriptionId);

  if (error) {
    // O gateway já parou de cobrar; só o nosso reflexo falhou. É recuperável
    // pelo webhook (SUBSCRIPTION_DELETED), então não é erro fatal — mas
    // precisa aparecer no log, senão fica uma linha 'active' fantasma.
    console.error('[asaas] cancel_local_sync_failed');
  }

  return { ok: true, alreadyCanceled: false };
}

export type ChangePlanResult =
  | { ok: true; canceledId: string; nextInterval: PlanInterval }
  | { ok: false; reason: 'not_found' | 'same_plan' | 'provider_error' };

/**
 * Troca de plano (upgrade/downgrade).
 *
 * ⚠️ ISTO É O FALLBACK DOCUMENTADO, NÃO O CAMINHO IDEAL.
 *
 * O caminho ideal seria PUT /v3/subscriptions/{id} alterando value e cycle.
 * Mas alterar valor/vencimento de assinatura de CARTÃO no Asaas exige
 * TOKENIZAÇÃO DE CARTÃO habilitada na conta. Em sandbox ela já vem ligada; em
 * produção precisa ser liberada pelo gerente de contas. Enquanto isso não
 * estiver liberado, a única forma correta é cancelar a assinatura atual e
 * criar uma nova — que é o que esta função prepara.
 *
 * Ela NÃO cria a assinatura nova sozinha: a nova passa pelo checkout
 * hospedado, porque não guardamos cartão (é justamente o que nos mantém fora
 * do escopo PCI). O caller cancela aqui e manda o usuário para o checkout do
 * novo plano.
 *
 * QUANDO A TOKENIZAÇÃO FOR LIBERADA: troque isto por um PUT com
 * updatePendingPayments: true e apague o cancelamento. Deixe o comentário.
 */
export async function preparePlanChange(
  subscriptionId: string,
  nextInterval: PlanInterval,
): Promise<ChangePlanResult> {
  const admin = createAdminSupabaseClient();

  const { data: row } = await admin
    .from('subscriptions')
    .select('id, plan_interval, status')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!row?.id) return { ok: false, reason: 'not_found' };
  if (row.plan_interval === nextInterval) return { ok: false, reason: 'same_plan' };

  // Garante que o plano de destino existe antes de cancelar o atual: cancelar
  // primeiro e descobrir depois que o destino é inválido deixaria a pessoa sem
  // assinatura nenhuma.
  planFor(nextInterval);

  const canceled = await cancelUserSubscription(subscriptionId);
  if (!canceled.ok) return { ok: false, reason: 'provider_error' };

  return { ok: true, canceledId: subscriptionId, nextInterval };
}

/** Reexport de conveniência para quem só precisa ler a assinatura no gateway. */
export { getSubscription };
