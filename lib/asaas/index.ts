/**
 * Ponto de entrada do módulo Asaas. SERVIDOR APENAS — ver o aviso em
 * ./client. Só reexporta; nenhuma lógica mora aqui.
 */

export {
  AsaasError,
  AsaasConfigError,
  asaasRequest,
  asaasBaseUrl,
  getAsaasConfig,
  ASAAS_TIMEOUT_MS,
  ASAAS_USER_AGENT,
  type AsaasEnv,
  type AsaasConfig,
  type AsaasRequestOptions,
} from './client';

export { getCustomer, createCustomer } from './customers';
export { getSubscription, cancelSubscription, listSubscriptionPayments } from './subscriptions';
export { createCheckout } from './checkouts';
export { getPayment } from './payments';

export type * from './types';
