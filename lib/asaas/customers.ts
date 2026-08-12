/**
 * Clientes do Asaas. SERVIDOR APENAS (ver aviso em ./client).
 *
 * No caminho feliz NÃO criamos customer: o checkout hospedado coleta os dados
 * do pagador, inclusive o CPF, e cria o cliente sozinho. Este módulo existe
 * principalmente por causa do getCustomer — o webhook recebe só o id
 * (cus_xxx) e precisa buscar o e-mail real de quem pagou para casar com o
 * cadastro depois.
 *
 * Sem regra de negócio aqui: são invólucros finos sobre asaasRequest.
 */

import { asaasRequest } from './client';
import type { AsaasCreateCustomerInput, AsaasCustomer } from './types';

/** GET /v3/customers/{id} */
export async function getCustomer(id: string): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>(`/customers/${encodeURIComponent(id)}`);
}

/**
 * POST /v3/customers
 *
 * Exige cpfCnpj — diferente do checkout, onde customerData é opcional inteiro.
 * Por isso esta rota não serve para o fluxo de compra: no clique do plano ainda
 * não temos o documento do visitante.
 */
export async function createCustomer(
  input: AsaasCreateCustomerInput,
): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>('/customers', {
    method: 'POST',
    body: input,
  });
}
