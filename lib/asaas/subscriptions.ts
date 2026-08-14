/**
 * Assinaturas do Asaas. SERVIDOR APENAS (ver aviso em ./client).
 * Invólucros finos: nenhuma tradução de status acontece aqui.
 */

import { asaasRequest } from './client';
import type {
  AsaasDeletedSubscription,
  AsaasList,
  AsaasPayment,
  AsaasPaymentStatus,
  AsaasSubscription,
} from './types';

/** GET /v3/subscriptions/{id} */
export async function getSubscription(id: string): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>(`/subscriptions/${encodeURIComponent(id)}`);
}

/**
 * DELETE /v3/subscriptions/{id}
 *
 * É o cancelamento: para de gerar cobranças novas e remove as pendentes/vencidas.
 * As já pagas continuam registradas, para preservar o histórico financeiro.
 * Não existe "cancelar ao fim do período" no Asaas — quem quiser esse
 * comportamento agenda o DELETE, e isso é decisão de negócio (Fase 3).
 */
export async function cancelSubscription(
  id: string,
): Promise<AsaasDeletedSubscription> {
  return asaasRequest<AsaasDeletedSubscription>(
    `/subscriptions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

/** GET /v3/subscriptions/{id}/payments */
export async function listSubscriptionPayments(
  id: string,
  params: { status?: AsaasPaymentStatus } = {},
): Promise<AsaasList<AsaasPayment>> {
  return asaasRequest<AsaasList<AsaasPayment>>(
    `/subscriptions/${encodeURIComponent(id)}/payments`,
    { query: { status: params.status } },
  );
}
