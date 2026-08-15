import type { SupabaseClient } from '@supabase/supabase-js';

export type HealthSeverity = 'critical' | 'high' | 'medium' | 'low';
export type HealthCheckResult = { ok: true; value: HealthAlert } | { ok: false };

export interface HealthAlertRow {
  recordKey: string;
  email: string | null;
  occurredAt: string | null;
  detail: string;
  linkKind: 'customers' | 'finance';
}

export interface HealthAlert {
  key: HealthCheckKey;
  title: string;
  description: string;
  suggestedAction: string;
  severity: HealthSeverity;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  rows: HealthAlertRow[];
}

export const HEALTH_CHECKS = [
  { key: 'unconfirmed_subscription', title: 'Assinatura ativa sem pagamento confirmado', severity: 'high', description: 'Ativa há mais de 10 minutos, sem PAYMENT_CONFIRMED e sem transação confirmada.', suggestedAction: 'Conferir a cobrança e o histórico do webhook antes de decidir qualquer acesso.' },
  { key: 'confirmed_unprocessed', title: 'Pagamento confirmado não processado', severity: 'critical', description: 'PAYMENT_CONFIRMED chegou, mas processed_at continua vazio.', suggestedAction: 'Investigar o erro do webhook e reconciliar manualmente o evento.' },
  { key: 'stale_webhook', title: 'Webhook parado há mais de 5 minutos', severity: 'high', description: 'Evento recebido e ainda não concluído após a janela operacional.', suggestedAction: 'Verificar logs, dependências e a fila do Asaas.' },
  { key: 'paid_without_account', title: 'Pagamento sem conta vinculada', severity: 'high', description: 'Pagamento confirmado há mais de 30 minutos e assinatura ainda sem user_id.', suggestedAction: 'Confirmar se o aviso de cadastro foi entregue e contatar o cliente se necessário.' },
  { key: 'missing_period_end', title: 'Assinatura ativa sem fim do período', severity: 'medium', description: 'A renovação não entra na previsão de caixa porque current_period_end está vazio.', suggestedAction: 'Conferir a assinatura no Asaas e reconciliar a data.' },
  { key: 'payment_problem', title: 'Pagamento exige atenção', severity: 'high', description: 'Inadimplência, falha, reembolso ou chargeback registrado.', suggestedAction: 'Revisar a cobrança e decidir o contato ou tratamento adequado.' },
  { key: 'account_without_subscription', title: 'Conta sem assinatura válida', severity: 'high', description: 'Existe perfil de cliente, mas nenhuma assinatura ativa ou trialing vinculada.', suggestedAction: 'Conferir o histórico da conta; o painel não altera nem revoga acesso.' },
  { key: 'onboarding_stale', title: 'Onboarding incompleto após 24 horas', severity: 'medium', description: 'Perfil criado há mais de um dia ainda não concluiu o onboarding.', suggestedAction: 'Avaliar contato de suporte ou fricção no fluxo.' },
  { key: 'checkout_abandoned', title: 'Checkout iniciado sem pagamento', severity: 'low', description: 'Checkout com mais de 24 horas sem assinatura ou transação associada.', suggestedAction: 'Acompanhar como abandono; não tratar como receita nem cliente pago.' },
  { key: 'zero_credits', title: 'Cliente com créditos zerados', severity: 'low', description: 'Saldo atual de créditos chegou a zero.', suggestedAction: 'Observar recorrência e necessidade de ajuste comercial; nenhuma recarga é feita aqui.' },
] as const;

export type HealthCheckKey = (typeof HEALTH_CHECKS)[number]['key'];

type Raw = Record<string, unknown>;

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function parseAlert(
  definition: (typeof HEALTH_CHECKS)[number],
  value: unknown,
): HealthAlert {
  const raw = value && typeof value === 'object' ? value as Raw : {};
  const severity = ['critical', 'high', 'medium', 'low'].includes(String(raw.severity))
    ? String(raw.severity) as HealthSeverity
    : definition.severity;
  const count = Number(raw.count);

  return {
    ...definition,
    severity,
    count: Number.isFinite(count) && count >= 0 ? count : 0,
    firstAt: nullableString(raw.first_at),
    lastAt: nullableString(raw.last_at),
    rows: Array.isArray(raw.rows) ? raw.rows.map((item) => {
      const row = item && typeof item === 'object' ? item as Raw : {};
      return {
        recordKey: String(row.record_key ?? ''),
        email: nullableString(row.email),
        occurredAt: nullableString(row.occurred_at),
        detail: String(row.detail ?? 'Registro afetado'),
        linkKind: row.link_kind === 'finance' ? 'finance' : 'customers',
      };
    }) : [],
  };
}

async function loadCheck(
  admin: SupabaseClient,
  definition: (typeof HEALTH_CHECKS)[number],
  now: Date,
): Promise<HealthCheckResult> {
  try {
    const { data, error } = await admin.rpc('admin_health_check', {
      p_check_key: definition.key,
      p_now: now.toISOString(),
      p_limit: 20,
    });
    if (error) throw new Error(error.message);
    return { ok: true, value: parseAlert(definition, data) };
  } catch (error) {
    console.error(`[admin-health] falha isolada em ${definition.key}`, error);
    return { ok: false };
  }
}

/** Uma RPC por regra: falha isolada nunca apaga os outros alertas nem vira zero. */
export async function loadAdminHealth(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<HealthCheckResult[]> {
  return Promise.all(HEALTH_CHECKS.map((definition) => loadCheck(admin, definition, now)));
}
