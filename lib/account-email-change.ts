/**
 * Regra da TROCA DE E-MAIL DA CONTA — módulo PURO.
 *
 * ── POR QUE ISTO É TRATADO COMO VETOR DE TOMADA DE CONTA ────────────────────
 * O e-mail É a identidade da conta: é com ele que se recupera senha e se entra
 * por magic link. Quem consegue trocá-lo sem prova de posse da caixa nova
 * levou a conta inteira — assinatura, carrosséis e tudo mais. Por isso:
 *
 *   • quem executa a troca é o Supabase Auth (`updateUser({ email })`), que só
 *     efetiva DEPOIS da confirmação por e-mail;
 *   • NUNCA se escreve em `auth.users.email` com service_role. Um write
 *     privilegiado trocaria a identidade sem prova nenhuma, e é exatamente o
 *     que este fluxo existe para NÃO fazer;
 *   • até a confirmação, o e-mail ATUAL continua valendo — sessão, login e
 *     recuperação de senha seguem no endereço antigo.
 *
 * ── O QUE NÃO MUDA JUNTO ────────────────────────────────────────────────────
 * `subscriptions.email` NÃO é tocado. Ele é o e-mail de quem PAGOU, escrito
 * pelo webhook a partir de GET /v3/customers do Asaas, e serve à conciliação
 * lead↔pagamento e ao claim (que casa por lower(email)) — ANTES de a conta
 * existir. Depois do claim o vínculo é por `user_id` (ver a view
 * user_active_subscription, que projeta por user_id e nunca por e-mail), então
 * trocar o e-mail do Auth não mexe em acesso, crédito nem renovação.
 *
 * Aqui só mora a DECISÃO. O I/O fica na rota.
 */

/**
 * Validação deliberadamente frouxa e sem regex heroica: quem valida de verdade
 * é o Supabase, e depois dele a própria caixa postal — o link de confirmação só
 * chega se o endereço existir. O papel deste teste é recusar lixo óbvio antes
 * de gastar uma chamada, não replicar a RFC 5322.
 */
const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Endereços mais longos que isto não são endereços. */
const TAMANHO_MAXIMO = 254;

export type EmailChangeDecision =
  /** Formato impossível — nem chega ao Supabase. */
  | { kind: 'invalid' }
  /** É o e-mail que a conta já tem. Não há troca a fazer. */
  | { kind: 'same_as_current' }
  /** Já existe um pedido pendente para ESTE endereço: reenvia a confirmação. */
  | { kind: 'resend'; email: string }
  /** Pedido novo. */
  | { kind: 'change'; email: string };

/** trim + lowercase. O Auth trata e-mail como case-insensitive, e o claim do
 *  pagamento casa por `lower(email)`: comparar sem normalizar criaria um
 *  "pendente" que nunca bate com o que o usuário digitou de novo. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!value || value.length > TAMANHO_MAXIMO || !FORMATO.test(value)) return null;
  return value;
}

/**
 * O que fazer com o pedido, dado o estado atual da conta.
 *
 * `pendingEmail` é o `new_email` que o Supabase guarda enquanto a troca não é
 * confirmada. Repetir o MESMO endereço não é erro: é o caso "não recebi",
 * e ele vira reenvio em vez de recusa.
 */
export function decideEmailChange(input: {
  currentEmail: string | null | undefined;
  pendingEmail: string | null | undefined;
  requested: unknown;
}): EmailChangeDecision {
  const email = normalizeEmail(input.requested);
  if (!email) return { kind: 'invalid' };

  const current = normalizeEmail(input.currentEmail);
  if (current && email === current) return { kind: 'same_as_current' };

  const pending = normalizeEmail(input.pendingEmail);
  if (pending && email === pending) return { kind: 'resend', email };

  return { kind: 'change', email };
}

/**
 * O erro do Supabase indica "este endereço já pertence a outra conta"?
 *
 * A resposta ao usuário NÃO diz isso (ver a rota): a função existe para o
 * servidor escolher o status certo e logar, não para vazar o motivo.
 */
export function isEmailTakenError(error: { code?: string; status?: number; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true;
  // Projetos mais antigos devolvem só a mensagem, sem `code`.
  return /already (registered|been registered|exists)|email_exists/i.test(error.message ?? '');
}

/** O provedor recusou por excesso de envios (limite do próprio Supabase). */
export function isSendRateLimitError(error: { code?: string; status?: number } | null): boolean {
  if (!error) return false;
  return error.code === 'over_email_send_rate_limit' || error.status === 429;
}
