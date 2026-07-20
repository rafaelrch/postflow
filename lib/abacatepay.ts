/**
 * Cliente HTTP da AbacatePay (API v2).
 *
 * A AbacatePay não tem SDK oficial em uso aqui — são chamadas REST diretas.
 * O ambiente (dev/produção) é definido pela PRÓPRIA CHAVE, não por base URL
 * separada: a mesma URL com uma chave dev devolve objetos com devMode: true.
 *
 * Todas as respostas vêm no envelope { data, success, error }. Erros chegam
 * como HTTP 4xx COM success:false — daí a checagem dupla em `abacateFetch`.
 */

export const ABACATEPAY_BASE_URL = 'https://api.abacatepay.com/v2';

export type AbacateEnvelope<T> = {
  data: T | null;
  success: boolean;
  error: string | null;
};

export class AbacatePayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'AbacatePayError';
  }
}

function apiKey(): string {
  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) throw new Error('Missing ABACATEPAY_API_KEY env var');
  return key;
}

/**
 * Chamada crua à API. Desembrulha o envelope e lança AbacatePayError em
 * qualquer falha — a mensagem da API vai junto pra facilitar diagnóstico,
 * mas NUNCA a chave.
 */
export async function abacateFetch<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${ABACATEPAY_BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  let envelope: AbacateEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as AbacateEnvelope<T>;
  } catch {
    throw new AbacatePayError(`Resposta não-JSON (HTTP ${res.status})`, res.status, path);
  }

  if (!res.ok || !envelope.success || envelope.data === null) {
    throw new AbacatePayError(envelope.error ?? `HTTP ${res.status}`, res.status, path);
  }

  return envelope.data;
}

/* ─── Configuração de planos ──────────────────────────────────── */

export type PlanInterval = 'month' | 'year';

/**
 * IDs dos produtos de assinatura. Diferente da Stripe (onde dava pra criar
 * price on-the-fly), na AbacatePay o produto precisa PRÉ-EXISTIR com um
 * `cycle` definido — criados uma vez e referenciados por env var.
 */
export const ABACATEPAY_PRODUCT_MONTHLY = process.env.ABACATEPAY_PRODUCT_MONTHLY ?? '';
export const ABACATEPAY_PRODUCT_ANNUALLY = process.env.ABACATEPAY_PRODUCT_ANNUALLY ?? '';

/** Secret conferido no query param `?webhookSecret=` das entregas de webhook. */
export const ABACATEPAY_WEBHOOK_SECRET = process.env.ABACATEPAY_WEBHOOK_SECRET ?? '';

/**
 * Chave pública da AbacatePay usada como segredo do HMAC-SHA256 que assina o
 * corpo do webhook. É pública (documentada), mas fica em env pra poder rotacionar
 * sem deploy.
 */
export const ABACATEPAY_PUBLIC_KEY = process.env.ABACATEPAY_PUBLIC_KEY ?? '';

export function productIdForInterval(interval: PlanInterval): string {
  return interval === 'year' ? ABACATEPAY_PRODUCT_ANNUALLY : ABACATEPAY_PRODUCT_MONTHLY;
}

/* ─── Tipos dos objetos da API ────────────────────────────────── */

/**
 * Status de um checkout/cobrança. Confirmado empiricamente contra a API dev
 * e na doc: PENDING, PAID, EXPIRED, CANCELLED, REFUNDED.
 *
 * ATENÇÃO — não existe equivalente a `past_due`/`unpaid` da Stripe. Falha de
 * cobrança recorrente é tratada pela `retryPolicy` da assinatura e, esgotadas
 * as tentativas, ela vira CANCELLED com `cancelledDueTo`. Ou seja: o estado
 * "deve, mas ainda não cancelou" não é observável por status. Ver nota no
 * guard B1 em lib/abacatepay-subscription.ts.
 */
export type AbacateCheckoutStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';

export type AbacateCustomer = {
  id: string;
  email: string;
  name: string | null;
  taxId: string | null;
  cellphone: string | null;
  metadata: Record<string, string> | null;
  devMode?: boolean;
};

export type AbacateCheckout = {
  id: string;
  externalId: string | null;
  url: string;
  amount: number;
  paidAmount: number | null;
  items: { id: string; quantity: number }[];
  status: AbacateCheckoutStatus;
  methods: string[];
  frequency: 'ONE_TIME' | 'SUBSCRIPTION';
  customerId: string | null;
  returnUrl: string | null;
  completionUrl: string | null;
  metadata: Record<string, string> | null;
  trialDays: number | null;
  trialEndsAt: string | null;
  nextChargeAt: string | null;
  createdAt: string;
  updatedAt: string;
  devMode?: boolean;
};

/* ─── Endpoints ───────────────────────────────────────────────── */

/**
 * Cria (ou reaproveita) um cliente. O e-mail é o único campo obrigatório —
 * `taxId` é opcional, confirmado na doc e na API, então NÃO precisamos passar
 * a coletar CPF/CNPJ para assinar.
 */
export function createCustomer(input: {
  email: string;
  name?: string;
  taxId?: string;
  cellphone?: string;
  metadata?: Record<string, string>;
}): Promise<AbacateCustomer> {
  return abacateFetch<AbacateCustomer>('/customers/create', { method: 'POST', body: input });
}

export function getCustomer(id: string): Promise<AbacateCustomer> {
  return abacateFetch<AbacateCustomer>(`/customers/get?id=${encodeURIComponent(id)}`);
}

/**
 * Cria o checkout de assinatura. `items` aceita EXATAMENTE um produto, e esse
 * produto precisa ter `cycle` definido. Devolve `url` — é pra lá que o
 * usuário é redirecionado pra pagar.
 *
 * Sem `trialDays`: os produtos foram criados sem trial (decisão do Rafael,
 * 20/07/2026), então não há nada a desativar aqui.
 */
export function createSubscriptionCheckout(input: {
  productId: string;
  customerId?: string;
  externalId?: string;
  returnUrl?: string;
  completionUrl?: string;
  metadata?: Record<string, string>;
}): Promise<AbacateCheckout> {
  return abacateFetch<AbacateCheckout>('/subscriptions/create', {
    method: 'POST',
    body: {
      items: [{ id: input.productId, quantity: 1 }],
      customerId: input.customerId,
      externalId: input.externalId,
      returnUrl: input.returnUrl,
      completionUrl: input.completionUrl,
      metadata: input.metadata,
      methods: ['CARD'],
    },
  });
}

/**
 * Busca um checkout pelo id.
 *
 * ATENÇÃO: o caminho certo é `/checkouts/get`, NÃO `/checkouts/one` como
 * consta no índice de endpoints da doc — `/checkouts/one` responde
 * 400 "Not found" para o mesmo id que `/checkouts/get` resolve com 200.
 * Verificado contra a API dev em 20/07/2026.
 */
export function getCheckout(id: string): Promise<AbacateCheckout> {
  return abacateFetch<AbacateCheckout>(`/checkouts/get?id=${encodeURIComponent(id)}`);
}

export function cancelSubscription(id: string): Promise<AbacateCheckout> {
  return abacateFetch<AbacateCheckout>('/subscriptions/cancel', {
    method: 'POST',
    body: { id },
  });
}
