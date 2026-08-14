/**
 * Checkout hospedado do Asaas. SERVIDOR APENAS (ver aviso em ./client).
 *
 * É o único POST daqui que cria intenção de cobrança — e por isso o único onde
 * um retry indevido custaria caro. A proteção está no client: erro de rede em
 * método diferente de GET não é repetido.
 *
 * Invólucro fino. Montar os items, o callback e o cycle a partir do plano
 * escolhido é regra de negócio, e isso é Fase 3.
 */

import { asaasRequest, type AsaasRequestOptions } from './client';
import type { AsaasCheckout, AsaasCreateCheckoutInput } from './types';

/** Subconjunto das opções do client que faz sentido o caller controlar aqui. */
export type CreateCheckoutOptions = Pick<AsaasRequestOptions, 'maxRetries' | 'timeoutMs'>;

/**
 * POST /v3/checkouts
 *
 * A resposta traz `link`: é essa a URL para onde o visitante deve ser
 * redirecionado (não `invoiceUrl`, que é de cobrança avulsa).
 *
 * `options` existe por causa do maxRetries: o client repete 5xx/429 mesmo em
 * POST, e para ESTA rota isso é errado — repetir um checkout que o Asaas já
 * criou dá dois links pagáveis para o mesmo comprador. Quem chama decide.
 */
export async function createCheckout(
  input: AsaasCreateCheckoutInput,
  options: CreateCheckoutOptions = {},
): Promise<AsaasCheckout> {
  return asaasRequest<AsaasCheckout>('/checkouts', {
    method: 'POST',
    body: input,
    ...options,
  });
}
