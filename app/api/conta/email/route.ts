import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  decideEmailChange,
  isEmailTakenError,
  isSendRateLimitError,
} from '@/lib/account-email-change';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Pede a troca do e-mail da conta logada.
 *
 * ── QUEM TROCA É O SUPABASE, NÃO ESTA ROTA ──────────────────────────────────
 * A rota chama `updateUser({ email })` COM A SESSÃO DO PRÓPRIO USUÁRIO. Isso
 * não altera `auth.users.email`: guarda o pedido em `new_email` e dispara a
 * confirmação. O e-mail só muda depois que o link é aberto.
 *
 * O client de service_role NÃO aparece aqui, e não é esquecimento: com ele
 * daria para escrever `auth.users.email` direto, o que trocaria a identidade
 * de uma conta sem nenhuma prova de que a pessoa controla a caixa nova. É
 * literalmente a tomada de conta que este fluxo existe para impedir.
 *
 * ── NÃO VIRAR ORÁCULO DE CADASTRO ───────────────────────────────────────────
 * "Este e-mail já tem conta" é informação sobre TERCEIROS. A resposta de
 * endereço indisponível é genérica e não afirma que a outra conta existe —
 * pode ser endereço bloqueado, recusado pelo provedor ou já em uso. O motivo
 * real fica no log do servidor.
 *
 * ── O QUE ESTA ROTA NÃO FAZ ─────────────────────────────────────────────────
 * Não escreve em `subscriptions` nem em lugar nenhum além do Auth. O vínculo
 * assinatura↔conta é por `user_id` depois do claim; o e-mail gravado em
 * subscriptions é o de quem PAGOU e continua sendo o do pagamento.
 */

/** Por SESSÃO, não por IP: o alvo do abuso é a conta, e o IP de quem já está
 *  logado muda (celular, VPN) sem que isso signifique outra pessoa. */
const LIMITE = { limit: 5, windowMs: 60 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const limite = rateLimit(`conta-email:${user.id}`, LIMITE);
  if (!limite.ok) {
    return NextResponse.json(
      {
        error: 'Muitas tentativas de troca de e-mail. Tente novamente mais tarde.',
        code: 'rate_limited',
      },
      { status: 429, headers: { 'Retry-After': String(limite.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const decision = decideEmailChange({
    currentEmail: user.email,
    // `new_email` é onde o Supabase guarda a troca pendente enquanto ela não é
    // confirmada. Repetir o mesmo endereço é "não recebi", não erro.
    pendingEmail: (user as { new_email?: string | null }).new_email,
    requested: (body as { email?: unknown } | null)?.email,
  });

  if (decision.kind === 'invalid') {
    return NextResponse.json(
      { error: 'Informe um e-mail válido.', code: 'invalid_email' },
      { status: 400 },
    );
  }

  if (decision.kind === 'same_as_current') {
    return NextResponse.json(
      { error: 'Este já é o e-mail da sua conta.', code: 'same_as_current' },
      { status: 400 },
    );
  }

  const { error } = await supabase.auth.updateUser({ email: decision.email });

  if (error) {
    if (isEmailTakenError(error)) {
      // Sem PII no log e sem confirmar a existência da outra conta na resposta.
      console.warn(`[conta/email] endereco_indisponivel user=${user.id}`);
      return NextResponse.json(
        {
          error:
            'Não foi possível usar este endereço. Escolha outro e-mail ou fale com o suporte.',
          code: 'email_unavailable',
        },
        { status: 409 },
      );
    }

    if (isSendRateLimitError(error)) {
      return NextResponse.json(
        {
          error: 'Muitos e-mails enviados em pouco tempo. Tente novamente mais tarde.',
          code: 'rate_limited',
        },
        { status: 429 },
      );
    }

    console.error(`[conta/email] update_user_failed user=${user.id} status=${error.status ?? '?'}`);
    return NextResponse.json(
      { error: 'Não foi possível iniciar a troca agora. Tente novamente.', code: 'update_failed' },
      { status: 502 },
    );
  }

  // 202, não 200: o pedido foi ACEITO, a troca ainda não aconteceu. O e-mail
  // atual continua valendo até a confirmação.
  return NextResponse.json(
    { pendingEmail: decision.email, resent: decision.kind === 'resend' },
    { status: 202 },
  );
}
