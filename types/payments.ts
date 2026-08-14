/**
 * Tipos das tabelas de pagamento criadas em
 * supabase/migrations/20260812_asaas_migration.sql.
 *
 * O projeto não usa gerador de tipos do Supabase — as formas de linha são
 * escritas à mão, normalmente junto de quem as consome (ActiveSubscription em
 * lib/subscription.ts, Plan em lib/entitlements.ts). Estas ficam num arquivo
 * próprio porque descrevem o schema de pagamento inteiro, que ainda não tem um
 * único módulo consumidor: o webhook e as rotas de checkout chegam na Fase 3.
 *
 * NÃO confunda com lib/asaas/types.ts. Lá são os tipos da API do Asaas, com os
 * nomes de campo do provedor (camelCase, enums em CAIXA ALTA). Aqui são os
 * tipos do NOSSO banco, com o nosso vocabulário. A tradução entre os dois é
 * regra de negócio e mora na Fase 3.
 */

/**
 * Só 'asaas' hoje. É um union de um elemento de propósito: o check constraint
 * no banco também só aceita esse valor, e o dia que entrar outro provedor os
 * dois mudam juntos.
 */
export type PaymentProvider = 'asaas';

/**
 * Vocabulário INTERNO de status — não é o do Asaas. É o mesmo conjunto que o
 * app já consumia, preservado porque o gating de assinatura filtra por
 * 'active' | 'trialing' em vários pontos (view user_active_subscription,
 * lib/subscription.ts, o gate enforce_paid_signup_precondition).
 *
 * O status cru do provedor vive em `subscription_status`, separado.
 */
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled';

/** Os status que contam como "pagante" para o gating. */
export type ActiveSubscriptionStatus = Extract<SubscriptionStatus, 'active' | 'trialing'>;

export type PlanInterval = 'month' | 'year';

/** public.payment_customers — substituiu abacatepay_customers. */
export interface PaymentCustomerRow {
  user_id: string;
  payment_provider: PaymentProvider;
  provider_customer_id: string;
  /** Null até o Asaas devolver o cliente no webhook: o checkout hospedado é quem coleta o documento. */
  cpf_cnpj: string | null;
  created_at: string;
  updated_at: string;
}

/** public.subscriptions. */
export interface SubscriptionRow {
  /** Id da assinatura no Asaas. */
  id: string;
  /** Null enquanto o pagamento existe mas a conta ainda não foi criada — é o pagamento-primeiro. */
  user_id: string | null;
  email: string | null;
  payment_provider: PaymentProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  /** Última cobrança conhecida. */
  provider_payment_id: string | null;
  /** externalReference do Asaas: o id do lead que originou a compra. */
  external_reference: string | null;
  status: SubscriptionStatus;
  /** Status cru do Asaas (ACTIVE, EXPIRED, INACTIVE...), sem tradução, para debug. */
  subscription_status: string | null;
  plan_interval: PlanInterval;
  /** CREDIT_CARD | PIX, como o Asaas devolve. */
  billing_type: string | null;
  /** MONTHLY | YEARLY, como o Asaas devolve. */
  cycle: string | null;
  value: number | null;
  /**
   * ECO CRU do vencimento que o Asaas mandou ('YYYY-MM-DD', coluna `date`).
   * Está para current_period_end como subscription_status está para status:
   * serve para conciliação e debug, NÃO para decidir acesso. Ver o bloco
   * "QUAL COLUNA MANDA" em lib/asaas-webhook.ts.
   */
  next_due_date: string | null;
  cancel_at_period_end: boolean;
  /** Sem equivalente no Asaas; ninguém lê. */
  current_period_start: string | null;
  /** FONTE ÚNICA de até quando o acesso vale. Derivada em periodEndFor(). */
  current_period_end: string | null;
  canceled_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** public.payment_webhook_events — substituiu abacatepay_webhook_events. */
export interface PaymentWebhookEventRow {
  /** Campo `id` do payload do Asaas. É o PK, e é ele que dá a idempotência. */
  event_id: string;
  event_type: string | null;
  payload: Record<string, unknown> | null;
  /** Preenchido no INSERT, que acontece ANTES de processar. */
  received_at: string;
  /** Null até o processamento terminar com sucesso. */
  processed_at: string | null;
}

/**
 * public.user_active_subscription.
 *
 * A lista de colunas é a mesma de antes da migração, para não quebrar quem já
 * lê (lib/subscription.ts seleciona por nome). Duas são só compatibilidade:
 *   • price_id — não existe no Asaas; a view expõe plan_interval aqui.
 *   • trial_end — não há trial no produto; a view expõe NULL fixo.
 * As duas saem na Fase 5.
 */
export interface ActiveSubscriptionView {
  subscription_id: string;
  status: ActiveSubscriptionStatus;
  /** @deprecated Compat: hoje vem igual a plan_interval. */
  price_id: string;
  plan_interval: PlanInterval;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  /** @deprecated Compat: sempre null. */
  trial_end: string | null;
}

/**
 * public.paid_signup_intents. A tabela NÃO mudou na migração — a máquina de
 * cadastro passwordless foi preservada de propósito. Está tipada aqui porque
 * é o elo entre a assinatura paga e a conta criada depois.
 */
export interface PaidSignupIntentRow {
  id: string;
  /** FK para subscriptions(id), recriada na migração contra a tabela nova. */
  subscription_id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_by: string | null;
  created_at: string;
}
