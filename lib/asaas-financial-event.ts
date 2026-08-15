import type { SupabaseClient } from '@supabase/supabase-js';

type UnknownObject = Record<string, unknown>;

function object(value: unknown): UnknownObject {
  return value && typeof value === 'object' ? (value as UnknownObject) : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function civilDate(value: unknown): string | null {
  const parsed = text(value);
  return parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : null;
}

/**
 * O Asaas envia dateCreated sem offset (`YYYY-MM-DD HH:mm:ss`) no horário de
 * Brasília. Tornar o offset explícito evita que a timezone do runtime mude o
 * dia financeiro. Formatos novos/desconhecidos caem em null; a RPC usa now().
 */
function eventInstant(value: unknown): string | null {
  const parsed = text(value);
  if (!parsed) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(parsed)) {
    return `${parsed.replace(' ', 'T')}-03:00`;
  }
  const milliseconds = Date.parse(parsed);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export interface AsaasFinancialWrite {
  p_provider_payment_id: string;
  p_provider_subscription_id: string | null;
  p_event_type: string | null;
  p_status: string | null;
  p_gross_value: number | null;
  p_billing_type: string | null;
  p_due_date: string | null;
  p_event_at: string | null;
}

/**
 * Extrai somente os campos financeiros não sensíveis usados pela projeção.
 * Eventos de assinatura e cobranças avulsas sem `payment.id` não geram linha.
 */
export function financialWriteFromAsaas(payload: unknown): AsaasFinancialWrite | null {
  const root = object(payload);
  const payment = object(root.payment);
  const paymentId = text(payment.id);
  if (!paymentId) return null;

  return {
    p_provider_payment_id: paymentId,
    p_provider_subscription_id: text(payment.subscription),
    p_event_type: text(root.event),
    p_status: text(payment.status),
    p_gross_value: amount(payment.value),
    p_billing_type: text(payment.billingType),
    p_due_date: civilDate(payment.dueDate),
    p_event_at: eventInstant(root.dateCreated),
  };
}

/**
 * Escrita analítica separada do fluxo crítico. Quem chama DEVE fazê-lo depois
 * de processar o pagamento e dentro de try/catch próprio. A função lança para
 * tornar qualquer falha visível ao log, mas nunca decide acesso.
 */
export async function recordAsaasFinancialTransaction(
  admin: SupabaseClient,
  payload: unknown,
): Promise<void> {
  const write = financialWriteFromAsaas(payload);
  if (!write) return;
  const { error } = await admin.rpc('record_asaas_payment_transaction', write);
  if (error) throw new Error(`[asaas-financial] ${error.message}`);
}
