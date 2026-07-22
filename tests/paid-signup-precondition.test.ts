import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integração NÃO-mockada do gate BEFORE INSERT em auth.users.
 *
 * O bug que motivou este fix ficou escondido justamente porque o teste antigo
 * mockava `admin.createUser`. Aqui o gate roda de verdade: um Postgres embarcado
 * (PGlite) executa o MESMO SQL que vai pra produção — extraído dos arquivos
 * versionados, não recopiado — e a asserção é sobre o INSERT real em auth.users.
 *
 * O marcador antigo (raw_app_meta_data->>'origin') era inaplicável no BEFORE
 * INSERT porque o GoTrue só materializa app_metadata custom num UPDATE pós-insert
 * — daí 100% das criações falharem. A precondição correta é assinatura AbacatePay
 * ativa e ainda não reivindicada para o e-mail.
 */

const credits = readFileSync(new URL('../supabase/credits-and-flow.sql', import.meta.url), 'utf8');
const gate = readFileSync(
  new URL('../supabase/migrations/20260722_replace_marker_with_paid_precondition.sql', import.meta.url),
  'utf8',
);

/** Fatia o SQL REAL dos arquivos versionados (o teste executa o que enviamos). */
function slice(re: RegExp): string {
  const m = credits.match(re);
  if (!m) throw new Error(`falha ao extrair SQL real: ${re}`);
  return m[0];
}
const planAllowance = slice(/create or replace function public\.plan_allowance\(p_price_id text, p_interval text\)[\s\S]*?\$\$;/i);
const claimForUser = slice(/create or replace function public\.claim_paid_signup_for_user\(p_uid uuid\)[\s\S]*?end; \$\$;/i);
const claimOnConfirm = slice(/create or replace function public\.claim_on_email_confirmation\(\)[\s\S]*?end; \$\$;/i);
const claimTrigger = slice(/drop trigger if exists claim_on_email_confirmation_trg on auth\.users;[\s\S]*?execute function public\.claim_on_email_confirmation\(\);/i);

let db: PGlite;

/** Insere uma assinatura e devolve nada; helper de legibilidade. */
async function insertSub(row: {
  id: string;
  provider?: string;
  status?: string;
  user_id?: string | null;
  email: string;
}): Promise<void> {
  await db.query(
    `insert into public.subscriptions(id,provider,status,user_id,email,price_id,plan_interval)
     values($1,$2,$3,$4,$5,'price_month','month')`,
    [row.id, row.provider ?? 'abacatepay', row.status ?? 'active', row.user_id ?? null, row.email],
  );
}

/** Tenta criar o usuário; retorna null em sucesso ou a mensagem de erro do gate. */
async function tryCreateUser(email: string): Promise<string | null> {
  try {
    await db.query(
      `insert into auth.users(email, raw_app_meta_data)
       values($1, jsonb_build_object('origin','paid_passwordless')) returning id`,
      [email],
    );
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

beforeAll(async () => {
  db = new PGlite();
  // Roles que os revoke/grant reais referenciam (supabase_auth_admin presente
  // para exercitar o grant do-block; anon/authenticated para o revoke).
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
    create schema if not exists auth;
    create table auth.users(
      id uuid primary key default gen_random_uuid(),
      email text not null,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      email_confirmed_at timestamptz
    );
    create table public.subscriptions(
      id text primary key, provider text not null default 'stripe', status text not null,
      user_id uuid, email text, price_id text, plan_interval text, abacatepay_customer_id text
    );
    create table public.paid_signup_intents(
      id uuid primary key default gen_random_uuid(), subscription_id text, user_id uuid,
      consumed_at timestamptz, consumed_by uuid, expires_at timestamptz, created_at timestamptz default now()
    );
    create table public.abacatepay_checkout_refs(checkout_id text, consumed_at timestamptz);
    create table public.profiles(id uuid primary key, name text, handle text, phone text);
    create table public.user_credits(user_id uuid primary key, balance int, monthly_allowance int, period_start timestamptz, period_end timestamptz);
    create table public.abacatepay_customers(user_id uuid primary key, abacatepay_customer_id text);
  `);
  // Roda a migration REAL (remove o marcador antigo + instala a precondição) e
  // carrega as funções reais de claim para a regressão E2E.
  await db.exec(gate);
  await db.exec(planAllowance);
  await db.exec(claimForUser);
  await db.exec(claimOnConfirm);
  await db.exec(claimTrigger);
});

afterAll(async () => {
  await db?.close?.();
});

describe('gate paid_signup_precondition (integração real, sem mock)', () => {
  it('BLOQUEIA a criação quando não há assinatura para o e-mail', async () => {
    const err = await tryCreateUser('sem-sub@x.com');
    expect(err).toMatch(/paid_subscription_required/);
  });

  it('PERMITE quando existe assinatura ativa/não-reivindicada (casing insensível)', async () => {
    // Assinatura gravada com casing diferente do e-mail do insert.
    await insertSub({ id: 'sub_ok', email: 'Buyer@X.com' });
    const err = await tryCreateUser('buyer@x.com');
    expect(err).toBeNull();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int n from auth.users where email='buyer@x.com'",
    );
    expect(rows[0].n).toBe(1);
  });
});

describe('abuso / bypass do gate', () => {
  it('assinatura já reivindicada (user_id não-null) → bloqueado', async () => {
    await insertSub({ id: 'sub_claimed', email: 'claimed@x.com', user_id: '00000000-0000-0000-0000-000000000009' });
    expect(await tryCreateUser('claimed@x.com')).toMatch(/paid_subscription_required/);
  });

  it('provider ≠ abacatepay → bloqueado', async () => {
    await insertSub({ id: 'sub_stripe', provider: 'stripe', email: 'stripe@x.com' });
    expect(await tryCreateUser('stripe@x.com')).toMatch(/paid_subscription_required/);
  });

  it('status ≠ active → bloqueado', async () => {
    await insertSub({ id: 'sub_pastdue', status: 'past_due', email: 'pastdue@x.com' });
    expect(await tryCreateUser('pastdue@x.com')).toMatch(/paid_subscription_required/);
  });

  it('e-mail diferente da assinatura → bloqueado', async () => {
    await insertSub({ id: 'sub_other', email: 'owner@x.com' });
    expect(await tryCreateUser('intruder@x.com')).toMatch(/paid_subscription_required/);
  });
});

describe('regressão E2E: assinatura ativa → insert → confirmação vincula + créditos 1x', () => {
  it('vincula a assinatura ao usuário e credita a mensalidade uma única vez', async () => {
    await insertSub({ id: 'sub_e2e', email: 'e2e@x.com' });

    // 1) createUser passa pelo gate.
    const created = await db.query<{ id: string }>(
      `insert into auth.users(email, raw_app_meta_data)
       values('e2e@x.com', jsonb_build_object('origin','paid_passwordless')) returning id`,
    );
    const uid = created.rows[0].id;

    // 2) intent preparado para o usuário (como prepare_paid_signup_intent faria).
    await db.query(
      "insert into public.paid_signup_intents(subscription_id,user_id,expires_at) values('sub_e2e',$1, now()+interval '15 minutes')",
      [uid],
    );

    // 3) confirmação de e-mail dispara claim_on_email_confirmation_trg.
    await db.query('update auth.users set email_confirmed_at=now() where id=$1', [uid]);

    const sub = await db.query<{ user_id: string | null }>(
      "select user_id from public.subscriptions where id='sub_e2e'",
    );
    expect(sub.rows[0].user_id).toBe(uid);

    const credits1 = await db.query<{ n: number; balance: number; monthly_allowance: number }>(
      'select count(*)::int n, max(balance) balance, max(monthly_allowance) monthly_allowance from public.user_credits where user_id=$1',
      [uid],
    );
    expect(credits1.rows[0].n).toBe(1);
    expect(credits1.rows[0].balance).toBe(200); // plan_allowance('month') = 200
    expect(credits1.rows[0].monthly_allowance).toBe(200);

    // 4) reconfirmação não duplica créditos (gatilho só na transição + on conflict do nothing).
    await db.query('update auth.users set email_confirmed_at=now() where id=$1', [uid]);
    const credits2 = await db.query<{ n: number }>(
      'select count(*)::int n from public.user_credits where user_id=$1',
      [uid],
    );
    expect(credits2.rows[0].n).toBe(1);
  });
});
