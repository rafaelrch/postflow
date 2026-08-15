import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './supabase-server';

/**
 * Porta de entrada do /admin. Um helper só, no SERVIDOR, para toda página e
 * toda rota administrativa.
 *
 * ── POR QUE ALLOWLIST DE E-MAIL E NÃO RBAC ──────────────────────────────────
 * O admin é UMA pessoa (o Rafael). Uma tabela `admin_users` com convite, papel
 * e policy é superfície de ataque e de manutenção para resolver um problema que
 * não existe. Quando existir um segundo admin, isto aqui vira o lugar certo
 * para trocar a fonte — nenhuma página sabe COMO a decisão é tomada.
 *
 * ── POR QUE `ADMIN_EMAILS` E NÃO `user_metadata` ────────────────────────────
 * `user_metadata` é EDITÁVEL PELO PRÓPRIO USUÁRIO via updateUser(). Qualquer
 * cliente com sessão poderia se declarar admin. `app_metadata` seria melhor,
 * mas continuaria dependendo de um write privilegiado que hoje não existe.
 * Uma env var de servidor não viaja para o browser e não tem write nenhum.
 *
 * ── FAIL CLOSED ─────────────────────────────────────────────────────────────
 * `ADMIN_EMAILS` ausente ou vazia NEGA TODO MUNDO. O erro caro aqui não é
 * trancar o Rafael para fora — é abrir o painel do negócio inteiro porque
 * alguém esqueceu de configurar a variável na Vercel.
 *
 * ⚠️ NUNCA prefixe esta variável com NEXT_PUBLIC_. Isso a embutiria no bundle
 * do cliente e publicaria o e-mail do dono junto.
 */

export type AdminDenialReason =
  /** Nenhuma sessão no cookie. */
  | 'no_session'
  /** ADMIN_EMAILS ausente/vazia — ninguém entra. */
  | 'allowlist_unset'
  /** Tem sessão, mas o e-mail não está na lista. */
  | 'not_allowlisted'
  /** Está na lista, mas o e-mail nunca foi confirmado. */
  | 'email_unconfirmed';

export type AdminAccess =
  | { ok: true; userId: string; email: string }
  | { ok: false; status: 401 | 403; reason: AdminDenialReason };

/**
 * Lê `ADMIN_EMAILS` (separada por vírgula) e normaliza: trim + lowercase,
 * descartando entradas vazias. Sem essa normalização, um espaço sobrando ao
 * colar a lista na Vercel — ou o e-mail digitado com maiúscula — trancaria o
 * dono para fora sem nenhuma pista do motivo.
 */
export function parseAdminEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Usuário como esta decisão precisa dele. Aceita `null` além de `undefined`
 * nos dois campos de propósito: o tipo do supabase-js diz `string |
 * undefined`, mas a coluna no banco é nullable e um `null` que chegasse aqui
 * não pode passar por "campo ausente" e sim ser negado explicitamente.
 */
export type AdminCandidate = Pick<User, 'id'> & {
  email?: string | null;
  email_confirmed_at?: string | null;
};

/** Decisão pura: dado o usuário da sessão e a env crua, entra ou não? */
export function decideAdminAccess(
  user: AdminCandidate | null | undefined,
  rawAllowlist: string | undefined | null,
): AdminAccess {
  if (!user) return { ok: false, status: 401, reason: 'no_session' };

  const allowlist = parseAdminEmails(rawAllowlist);
  if (allowlist.length === 0) {
    return { ok: false, status: 403, reason: 'allowlist_unset' };
  }

  const email = (user.email ?? '').trim().toLowerCase();
  if (!email || !allowlist.includes(email)) {
    return { ok: false, status: 403, reason: 'not_allowlisted' };
  }

  // E-mail não confirmado é 403 e não 401 de propósito: a sessão é válida, o
  // que falta é a prova de que quem está logado controla mesmo aquela caixa.
  if (!user.email_confirmed_at) {
    return { ok: false, status: 403, reason: 'email_unconfirmed' };
  }

  return { ok: true, userId: user.id, email };
}

/**
 * Guarda de servidor. Use em TODA página e TODO route handler sob /admin, e
 * só use o client service_role depois de `ok: true`.
 *
 * `getUser()` e não `getSession()`: aqui a decisão é de autorização, então o
 * token precisa ser validado contra o Supabase, não só lido do cookie.
 */
export async function requireAdmin(): Promise<AdminAccess> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return decideAdminAccess(user, process.env.ADMIN_EMAILS);
}

/**
 * Resposta padrão das rotas administrativas negadas.
 *
 * O corpo NÃO diz qual das condições falhou: para quem está do lado de fora,
 * "e-mail fora da allowlist" e "allowlist não configurada" são a mesma coisa —
 * e a diferença entre elas é informação sobre a configuração do servidor. O
 * motivo real fica no `reason`, que só o código do servidor lê.
 */
export function adminDenialResponse(denial: Extract<AdminAccess, { ok: false }>): NextResponse {
  return NextResponse.json(
    { error: denial.status === 401 ? 'Não autenticado' : 'Acesso negado' },
    { status: denial.status },
  );
}
