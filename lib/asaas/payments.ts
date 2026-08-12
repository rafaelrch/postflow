/**
 * Cobranças do Asaas. SERVIDOR APENAS (ver aviso em ./client).
 * Invólucro fino: nenhuma tradução de status acontece aqui.
 */

import { asaasRequest } from './client';
import type { AsaasPayment } from './types';

/** GET /v3/payments/{id} */
export async function getPayment(id: string): Promise<AsaasPayment> {
  return asaasRequest<AsaasPayment>(`/payments/${encodeURIComponent(id)}`);
}
