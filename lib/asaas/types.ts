/**
 * Tipos da API do Asaas (v3).
 *
 * Nomes de campo EXATAMENTE como a doc oficial os escreve (camelCase, em
 * inglês) — nada de tradução ou normalização aqui. Quem normaliza para o
 * vocabulário do nosso banco é a Fase 3.
 *
 * TIPAGEM TOLERANTE de propósito: o Asaas acrescenta atributos ao payload sem
 * aviso prévio (a própria doc pede que a integração não quebre com campo
 * novo). Por isso:
 *   • todos os objetos de RESPOSTA carregam um index signature;
 *   • enums de resposta são `Enum | (string & {})`, que dá autocomplete sem
 *     rejeitar um valor que ainda não conhecemos;
 *   • quase tudo é opcional, porque o Asaas omite campo nulo em várias rotas.
 * Os tipos de REQUISIÇÃO são estritos — ali o erro é nosso, e queremos que o
 * compilador pegue.
 */

/** Enum conhecido, mas sem fechar a porta para valor novo vindo do Asaas. */
type Open<T extends string> = T | (string & {});

/** Objeto de resposta que aceita atributos que ainda não modelamos. */
interface Unknowns {
  [key: string]: unknown;
}

// ─── Enums ──────────────────────────────────────────────────

/** Formas de pagamento. O checkout do Creatools só oferece CREDIT_CARD e PIX. */
export type AsaasBillingType =
  | 'UNDEFINED'
  | 'BOLETO'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'TRANSFER'
  | 'DEPOSIT'
  | 'PIX';

/** Formas aceitas em POST /v3/checkouts (subconjunto do acima). */
/**
 * Formas de pagamento aceitas em POST /v3/checkouts.
 *
 * PIX consta na doc, mas o Asaas o RECUSA quando chargeTypes inclui RECURRENT
 * ("CREDIT_CARD é o único método permitido para operações RECURRENT" —
 * verificado no sandbox em 12/08). Como o Creatools só vende assinatura, na
 * prática é sempre cartão. PIX fica no tipo porque é válido em checkout
 * DETACHED, que não usamos hoje.
 */
export type AsaasCheckoutBillingType = 'CREDIT_CARD' | 'PIX';

export type AsaasChargeType = 'DETACHED' | 'RECURRENT' | 'INSTALLMENT';

export type AsaasCycle =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'BIMONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUALLY'
  | 'YEARLY';

/** Status de uma cobrança (payment). */
export type AsaasPaymentStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'RECEIVED_IN_CASH'
  | 'REFUND_REQUESTED'
  | 'REFUND_IN_PROGRESS'
  | 'CHARGEBACK_REQUESTED'
  | 'CHARGEBACK_DISPUTE'
  | 'AWAITING_CHARGEBACK_REVERSAL'
  | 'DUNNING_REQUESTED'
  | 'DUNNING_RECEIVED'
  | 'AWAITING_RISK_ANALYSIS';

/**
 * Status de uma assinatura. São só três — bem mais pobre que o do Stripe.
 * Não existe `past_due` aqui: assinatura com fatura vencida continua ACTIVE e
 * quem fica OVERDUE é a cobrança. A tradução para o nosso vocabulário é
 * problema da Fase 3.
 */
export type AsaasSubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'INACTIVE';

export type AsaasCheckoutStatus = 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAID';

export type AsaasPersonType = 'FISICA' | 'JURIDICA';

// ─── Eventos de webhook ─────────────────────────────────────

/** Eventos de cobrança. Lista completa da doc (webhook para cobranças). */
export type AsaasPaymentEvent =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_AWAITING_RISK_ANALYSIS'
  | 'PAYMENT_APPROVED_BY_RISK_ANALYSIS'
  | 'PAYMENT_REPROVED_BY_RISK_ANALYSIS'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_UPDATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'
  | 'PAYMENT_ANTICIPATED'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_DELETED'
  | 'PAYMENT_RESTORED'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_PARTIALLY_REFUNDED'
  | 'PAYMENT_REFUND_IN_PROGRESS'
  | 'PAYMENT_REFUND_DENIED'
  | 'PAYMENT_RECEIVED_IN_CASH_UNDONE'
  | 'PAYMENT_CHARGEBACK_REQUESTED'
  | 'PAYMENT_CHARGEBACK_DISPUTE'
  | 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
  | 'PAYMENT_DUNNING_RECEIVED'
  | 'PAYMENT_DUNNING_REQUESTED'
  | 'PAYMENT_BANK_SLIP_CANCELLED'
  | 'PAYMENT_BANK_SLIP_VIEWED'
  | 'PAYMENT_CHECKOUT_VIEWED'
  | 'PAYMENT_SPLIT_CANCELLED'
  | 'PAYMENT_SPLIT_DIVERGENCE_BLOCK'
  | 'PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED';

/** Eventos de assinatura. Lista completa da doc (eventos para assinaturas). */
export type AsaasSubscriptionEvent =
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_UPDATED'
  | 'SUBSCRIPTION_INACTIVATED'
  | 'SUBSCRIPTION_DELETED'
  | 'SUBSCRIPTION_SPLIT_DISABLED'
  | 'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK'
  | 'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED';

export type AsaasWebhookEvent = AsaasPaymentEvent | AsaasSubscriptionEvent;

/** Conta que originou o evento. */
export interface AsaasWebhookAccount extends Unknowns {
  id?: string;
  ownerId?: string | null;
}

/**
 * Envelope do webhook. `payment` e `subscription` são mutuamente exclusivos na
 * prática (o evento é de um ou de outro), mas ambos ficam opcionais aqui em vez
 * de virar união discriminada: quem processa precisa conseguir ler `event` e
 * `id` de um payload que ainda não classificou.
 */
export interface AsaasWebhookPayload extends Unknowns {
  /** PK da idempotência: vai direto para payment_webhook_events.event_id. */
  id?: string;
  event?: Open<AsaasWebhookEvent>;
  dateCreated?: string;
  account?: AsaasWebhookAccount;
  payment?: AsaasPayment;
  subscription?: AsaasSubscription;
}

// ─── Customer ───────────────────────────────────────────────

/** Body de POST /v3/customers. `name` e `cpfCnpj` são os únicos obrigatórios. */
export interface AsaasCreateCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  postalCode?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
  /** Lista separada por vírgula, não array — é assim que a doc define. */
  additionalEmails?: string;
  municipalInscription?: string;
  stateInscription?: string;
  observations?: string;
  groupName?: string;
  company?: string;
  foreignCustomer?: boolean;
}

export interface AsaasCustomer extends Unknowns {
  object?: string;
  id: string;
  dateCreated?: string;
  name?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  /** Código numérico da cidade no Asaas, não o nome. */
  city?: number;
  cityName?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  cpfCnpj?: string;
  personType?: Open<AsaasPersonType>;
  deleted?: boolean;
  additionalEmails?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
  observations?: string;
  foreignCustomer?: boolean;
}

// ─── Estruturas compartilhadas ──────────────────────────────

export interface AsaasDiscount extends Unknowns {
  value?: number;
  dueDateLimitDays?: number;
  type?: Open<'FIXED' | 'PERCENTAGE'>;
}

export interface AsaasFine extends Unknowns {
  value?: number;
}

export interface AsaasInterest extends Unknowns {
  value?: number;
}

export interface AsaasSplit extends Unknowns {
  id?: string;
  walletId?: string;
  fixedValue?: number;
  /** Sim, "percentual" com U — é o nome da doc nas respostas. */
  percentualValue?: number;
  totalValue?: number;
  externalReference?: string;
  description?: string;
  status?: Open<'ACTIVE' | 'DISABLED'>;
  disabledReason?: Open<'WALLET_UNABLE_TO_RECEIVE' | 'VALUE_DIVERGENCE'>;
}

/** Envelope de listagem paginada, comum a todas as rotas de lista. */
export interface AsaasList<T> extends Unknowns {
  object?: string;
  hasMore?: boolean;
  totalCount?: number;
  limit?: number;
  offset?: number;
  data: T[];
}

// ─── Payment ────────────────────────────────────────────────

export interface AsaasCreditCardInfo extends Unknowns {
  creditCardNumber?: string;
  creditCardBrand?: string;
  creditCardToken?: string;
}

export interface AsaasPayment extends Unknowns {
  object?: string;
  id: string;
  dateCreated?: string;
  /** Id do cliente (cus_xxx), não o objeto — vem como string. */
  customer?: string;
  /** Id da assinatura (sub_xxx) quando a cobrança é recorrente. */
  subscription?: string | null;
  installment?: string | null;
  /** Id da sessão de checkout que originou a cobrança. */
  checkoutSession?: string | null;
  paymentLink?: string | null;
  value?: number;
  netValue?: number;
  originalValue?: number | null;
  interestValue?: number | null;
  description?: string | null;
  billingType?: Open<AsaasBillingType>;
  creditCard?: AsaasCreditCardInfo;
  status?: Open<AsaasPaymentStatus>;
  dueDate?: string;
  originalDueDate?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  creditDate?: string | null;
  estimatedCreditDate?: string | null;
  invoiceUrl?: string;
  invoiceNumber?: string;
  externalReference?: string | null;
  discount?: AsaasDiscount;
  fine?: AsaasFine;
  interest?: AsaasInterest;
  split?: AsaasSplit[];
  refunds?: unknown[] | null;
  chargeback?: Unknowns | null;
  escrow?: Unknowns | null;
  deleted?: boolean;
  anticipated?: boolean;
}

// ─── Subscription ───────────────────────────────────────────

export interface AsaasSubscription extends Unknowns {
  object?: string;
  id: string;
  dateCreated?: string;
  customer?: string;
  paymentLink?: string | null;
  billingType?: Open<AsaasBillingType>;
  cycle?: Open<AsaasCycle>;
  value?: number;
  nextDueDate?: string;
  endDate?: string | null;
  description?: string | null;
  status?: Open<AsaasSubscriptionStatus>;
  discount?: AsaasDiscount;
  fine?: AsaasFine;
  interest?: AsaasInterest;
  deleted?: boolean;
  maxPayments?: number | null;
  externalReference?: string | null;
  checkoutSession?: string | null;
  split?: AsaasSplit[];
}

/** Resposta de DELETE /v3/subscriptions/{id}. */
export interface AsaasDeletedSubscription extends Unknowns {
  deleted?: boolean;
  id?: string;
}

// ─── Checkout ───────────────────────────────────────────────

export interface AsaasCheckoutCallback {
  successUrl: string;
  cancelUrl: string;
  expiredUrl?: string;
}

export interface AsaasCheckoutItem {
  /**
   * OPCIONAL, apesar de a referência do Asaas listar como obrigatório.
   *
   * Testado contra o sandbox em 12/08, com e sem o campo: os dois casos
   * devolveram 200. A doc está errada aqui. Deixamos de fora — mandar um PNG
   * 1x1 transparente só para satisfazer o schema publicado deixaria um
   * quadrado vazio na página de pagamento.
   */
  imageBase64?: string;
  /** Máx. 30 caracteres. */
  name: string;
  quantity: number;
  value: number;
  /** Máx. 150 caracteres. */
  description?: string;
  externalReference?: string;
}

export interface AsaasCheckoutSubscriptionInput {
  cycle?: AsaasCycle;
  /** YYYY-MM-DD */
  endDate?: string;
  /** YYYY-MM-DD */
  nextDueDate?: string;
  /**
   * Descrição da cobrança gerada — o texto que o cliente lê na fatura. Sem ela
   * o Asaas mostra "Descrição não informada".
   *
   * ⚠️ SUPORTE NÃO CONFIRMADO NESTE ENDPOINT. Medido no sandbox em 14/08/2026:
   * o POST /v3/checkouts aceita (200) mas não devolve o campo no eco de
   * `subscription` — e faz exatamente o mesmo com um campo inventado, então
   * aceitação não prova nada. Não existe GET /v3/checkouts (404) para
   * inspecionar o que ficou gravado. O que ESTÁ provado é o campo em si: POST
   * /v3/subscriptions com `description` gera a cobrança já com a descrição.
   *
   * Confirmar exige pagar um checkout no sandbox e ler a assinatura que nascer.
   */
  description?: string;
}

export interface AsaasCheckoutInstallmentInput {
  /** 1 a 21. */
  maxInstallmentCount?: number;
}

export interface AsaasCheckoutSplitInput {
  walletId: string;
  fixedValue?: number;
  percentageValue?: number;
  totalFixedValue?: number;
}

/** Body de POST /v3/checkouts. */
export interface AsaasCreateCheckoutInput {
  billingTypes: AsaasCheckoutBillingType[];
  chargeTypes: AsaasChargeType[];
  callback: AsaasCheckoutCallback;
  items: AsaasCheckoutItem[];
  /** 10 a 1440. */
  minutesToExpire?: number;
  /** Máx. 200 caracteres. No nosso fluxo carrega o id do lead. */
  externalReference?: string;
  /**
   * Inteiramente opcional: o checkout hospedado coleta o que faltar, inclusive
   * o CPF. É por isso que o caminho feliz não cria customer via API.
   */
  customerData?: Partial<{
    name: string;
    cpfCnpj: string;
    email: string;
    phone: string;
    address: string;
    addressNumber: number;
    complement: string;
    province: string;
    postalCode: string;
    city: number;
  }>;
  /** Obrigatório quando chargeTypes inclui RECURRENT. */
  subscription?: AsaasCheckoutSubscriptionInput;
  /** Obrigatório quando chargeTypes inclui INSTALLMENT. */
  installment?: AsaasCheckoutInstallmentInput;
  /**
   * No BODY o campo é plural (`splits`); na RESPOSTA volta como `split`.
   * Assimetria da API, não erro de digitação.
   */
  splits?: AsaasCheckoutSplitInput[];
}

export interface AsaasCheckout extends Unknowns {
  id: string;
  /** URL para onde o usuário deve ser redirecionado. */
  link?: string;
  status?: Open<AsaasCheckoutStatus>;
  billingTypes?: Open<AsaasCheckoutBillingType>[];
  chargeTypes?: Open<AsaasChargeType>[];
  minutesToExpire?: number;
  externalReference?: string | null;
  callback?: AsaasCheckoutCallback;
  items?: AsaasCheckoutItem[];
  customerData?: Unknowns;
  subscription?: Unknowns;
  installment?: Unknowns;
  split?: AsaasSplit[];
}

/** Item de erro do Asaas: { errors: [{ code, description }] }. */
export interface AsaasErrorItem extends Unknowns {
  code?: string;
  description?: string;
}
