import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260815d_access_requires_confirmed_payment.sql',
    import.meta.url,
  ),
  'utf8',
);

let db: PGlite;

async function tryCreateUser(email: string): Promise<string | null> {
  try {
    await db.query('insert into auth.users(email) values($1)', [email]);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
    create schema auth;
    create table auth.users(
      id uuid primary key default gen_random_uuid(), email text not null,
      email_confirmed_at timestamptz, raw_app_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.subscriptions(
      id text primary key, user_id uuid, email text, payment_provider text not null default 'asaas',
      provider_customer_id text, status text not null, plan_interval text not null default 'month',
      created_at timestamptz not null default now()
    );
    create table public.paid_signup_intents(
      id uuid primary key default gen_random_uuid(), subscription_id text, user_id uuid,
      expires_at timestamptz not null, consumed_at timestamptz, consumed_by uuid,
      created_at timestamptz not null default now()
    );
    create table public.profiles(id uuid primary key, name text, handle text, phone text);
    create table public.leads(email text, name text, phone text, created_at timestamptz default now());
    create table public.user_credits(
      user_id uuid primary key, balance int, monthly_allowance int,
      period_start timestamptz, period_end timestamptz
    );
    create table public.payment_customers(user_id uuid primary key, provider_customer_id text);
    create table public.payment_webhook_events(
      event_id text primary key, event_type text, payload jsonb,
      received_at timestamptz not null default now(), processed_at timestamptz
    );
    create function public.plan_allowance(p_interval text) returns int language sql immutable
      as $$ select case when p_interval='year' then 300 else 200 end $$;

    insert into public.subscriptions(id,email,status)
      values('sub_legacy','legado@test.com','active');
  `);

  await db.exec(migration);
  await db.exec(`
    insert into auth.users(email,raw_app_meta_data)
      values('direto@test.com',jsonb_build_object('origin','paid_passwordless'));
  `);
  // Em produção o trigger já existe e CREATE OR REPLACE troca sua função.
  await db.exec(`
    create trigger enforce_paid_signup_precondition_trg before insert on auth.users
      for each row execute function public.enforce_paid_signup_precondition();
  `);
});

afterAll(async () => {
  await db?.close?.();
});

describe('P1 SQL — confirmação obrigatória sem revogação retroativa', () => {
  it('preserva a assinatura anterior ao corte, sem preencher confirmação', async () => {
    const result = await db.query<{
      payment_confirmation_required: boolean;
      payment_confirmed_at: string | null;
    }>(
      "select payment_confirmation_required,payment_confirmed_at from public.subscriptions where id='sub_legacy'",
    );

    expect(result.rows[0]).toEqual({
      payment_confirmation_required: false,
      payment_confirmed_at: null,
    });
    expect(await tryCreateUser('legado@test.com')).toBeNull();
  });

  it('nova SUBSCRIPTION_CREATED ativa, sem confirmação, não libera auth.users', async () => {
    await db.query(
      "insert into public.subscriptions(id,email,status) values('sub_pending','pendente@test.com','active')",
    );

    const row = await db.query<{ payment_confirmation_required: boolean }>(
      "select payment_confirmation_required from public.subscriptions where id='sub_pending'",
    );
    expect(row.rows[0].payment_confirmation_required).toBe(true);
    expect(await tryCreateUser('pendente@test.com')).toMatch(/paid_subscription_required/);
  });

  it('chamada direta à RPC não cria nem consome intent sem confirmação', async () => {
    await db.query(
      "insert into public.subscriptions(id,email,status) values('sub_direct','direto@test.com','active')",
    );

    await expect(
      db.query("select public.prepare_paid_signup_intent('sub_direct','direto@test.com')"),
    ).rejects.toThrow(/subscription_claim_unavailable/);
    const intents = await db.query<{ count: number }>(
      "select count(*)::int count from public.paid_signup_intents where subscription_id='sub_direct'",
    );
    expect(intents.rows[0].count).toBe(0);
  });

  it('PAYMENT_CONFIRMED posterior libera a mesma assinatura sem recriá-la', async () => {
    // Ordem real da rota: evento bruto primeiro, upsert da assinatura depois.
    // O UPDATE sem preencher payment_confirmed_at simula o binário anterior à
    // mudança e prova que não há janela inversa entre migration e deploy.
    await db.query(`
      insert into public.payment_webhook_events(event_id,event_type,payload)
      values('evt_confirmed','PAYMENT_CONFIRMED',
        jsonb_build_object('payment',jsonb_build_object('subscription','sub_pending')))
    `);
    await db.query("update public.subscriptions set status='active' where id='sub_pending'");

    expect(await tryCreateUser('pendente@test.com')).toBeNull();
    const state = await db.query<{ count: number; payment_confirmed_at: string | null }>(
      "select count(*)::int count,max(payment_confirmed_at)::text payment_confirmed_at from public.subscriptions where id='sub_pending'",
    );
    expect(state.rows[0].count).toBe(1);
    expect(state.rows[0].payment_confirmed_at).not.toBeNull();
  });

  it('outro evento de cobrança não é confundido com PAYMENT_CONFIRMED', async () => {
    await db.query(`
      insert into public.payment_webhook_events(event_id,event_type,payload)
      values('evt_received','PAYMENT_RECEIVED',
        jsonb_build_object('payment',jsonb_build_object('subscription','sub_received')))
    `);
    await db.query(
      "insert into public.subscriptions(id,email,status) values('sub_received','received@test.com','active')",
    );

    const state = await db.query<{ payment_confirmed_at: string | null }>(
      "select payment_confirmed_at from public.subscriptions where id='sub_received'",
    );
    expect(state.rows[0].payment_confirmed_at).toBeNull();
  });
});
