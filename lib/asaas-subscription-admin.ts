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
 * DUAS funções de cancelamento, e o que as separa é o acesso do usuário:
 *
 *   • scheduleSubscriptionCancellation — o usuário pediu para cancelar. Para de
 *     cobrar, MAS o acesso vai até o fim do ciclo já pago.
 *   • cancelSubscriptionNow — corta na hora. É o que a troca de plano precisa,
 *     porque a assinatura nova entra no lugar da antiga imediatamente.
 *
 * São duas funções em vez de um parâmetro `immediate` de propósito: uma flag
 * booleana solta atravessando camadas é como "cancelou e perdeu o mês que já
 * tinha pago" nasce — basta alguém esquecer de passá-la num caller novo. Com
 * nomes distintos, escolher errado exige escrever o nome errado.
 */

/**
 * Cancela no Asaas. NÃO toca no nosso banco — quem chama decide o que gravar.
 *
 * ORDEM IMPORTA para os dois callers: primeiro o gateway, depois o banco. Se
 * invertêssemos e o DELETE falhasse, o usuário veria "cancelado" enquanto o
 * cartão continuaria sendo cobrado todo mês — o pior erro possível deste fluxo.
 * Do jeito certo, a falha aparece como erro e nada mente para o usuário.
 *
 * 404 do Asaas conta como sucesso: assinatura que não existe lá já está
 * cancelada para todos os efeitos, e travar o cancelamento local por causa
 * disso deixaria uma linha 'active' eterna no nosso banco.
 */
async function cancelAtGateway(subscriptionId: string): Promise<boolean> {
  try {
    await cancelSubscription(subscriptionId);
    return true;
  } catch (err) {
    if (err instanceof AsaasError && err.status === 404) return true;
    console.error('[asaas] cancel_failed');
    return false;
  }
}

async function applyCancelPatch(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  subscriptionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('subscriptions').update(patch).eq('id', subscriptionId);
  if (error) {
    // O gateway já parou de cobrar; só o nosso reflexo falhou. É recuperável
    // pelo webhook (SUBSCRIPTION_DELETED), então não é erro fatal — mas
    // precisa aparecer no log, senão fica uma linha 'active' fantasma.
    console.error('[asaas] cancel_local_sync_failed');
  }
}

/**
 * Cancelamento PEDIDO PELO USUÁRIO: para de cobrar, mantém o acesso.
 *
 * No banco marca cancel_at_period_end e NÃO mexe no status — é o status que dá
 * acesso, e quem pagou o mês fica com o mês. Quem derruba o status no fim é o
 * fluxo que já existe: o DELETE no Asaas volta como SUBSCRIPTION_DELETED, que
 * chega como 'end_of_cycle', e buildSubscriptionPatch (lib/asaas-webhook.ts)
 * decide ali, comparando com current_period_end. A regra de cortar acesso mora
 * em um lugar só.
 *
 * Isso vale INCLUSIVE quando current_period_end é nulo (assinatura antiga, ou
 * webhook que ainda não preencheu): inventar uma data aqui, ou cortar o acesso
 * "por precaução", tiraria do usuário um período que ele pagou. O webhook
 * resolve com o dado real quando chegar.
 */
export async function scheduleSubscriptionCancellation(
  subscriptionId: string,
): Promise<CancelResult> {
  const admin = createAdminSupabaseClient();

  const { data: row } = await admin
    .from('subscriptions')
    .select('id, status, cancel_at_period_end')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!row?.id) return { ok: false, reason: 'not_found' };
  // Já cancelada ou já agendada: nada a fazer. Isto protege o clique duplo do
  // lado do servidor também, não só pelo botão desabilitado na tela.
  if (row.status === 'canceled' || row.cancel_at_period_end) {
    return { ok: true, alreadyCanceled: true };
  }

  if (!(await cancelAtGateway(subscriptionId))) return { ok: false, reason: 'provider_error' };

  await applyCancelPatch(admin, subscriptionId, {
    cancel_at_period_end: true,
    canceled_at: new Date().toISOString(),
  });

  return { ok: true, alreadyCanceled: false };
}

/**
 * Cancelamento IMEDIATO: derruba o acesso agora.
 *
 * ⚠️ NÃO use no cancelamento pedido pelo usuário — cortaria um ciclo que ele já
 * pagou. Existe para a troca de plano (preparePlanChange), onde cancelar agora
 * é justamente o ponto: a assinatura nova assume no lugar da antiga.
 */
export async function cancelSubscriptionNow(subscriptionId: string): Promise<CancelResult> {
  const admin = createAdminSupabaseClient();

  const { data: row } = await admin
    .from('subscriptions')
    .select('id, status')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!row?.id) return { ok: false, reason: 'not_found' };
  if (row.status === 'canceled') return { ok: true, alreadyCanceled: true };

  if (!(await cancelAtGateway(subscriptionId))) return { ok: false, reason: 'provider_error' };

  await applyCancelPatch(admin, subscriptionId, {
    status: 'canceled',
    canceled_at: new Date().toISOString(),
  });

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

  // IMEDIATO de propósito: a assinatura nova entra no lugar desta. Deixar a
  // antiga viva até o fim do ciclo faria o usuário ter duas ao mesmo tempo.
  const canceled = await cancelSubscriptionNow(subscriptionId);
  if (!canceled.ok) return { ok: false, reason: 'provider_error' };

  return { ok: true, canceledId: subscriptionId, nextInterval };
}

/** Reexport de conveniência para quem só precisa ler a assinatura no gateway. */
export { getSubscription };
