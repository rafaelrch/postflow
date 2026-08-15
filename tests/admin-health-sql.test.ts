import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/20260815193245_admin_health_alerts.sql', import.meta.url), 'utf8');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
    create table public.leads(id uuid primary key,email text);
    create table public.subscriptions(
      id text primary key,user_id uuid,email text,status text,created_at timestamptz,updated_at timestamptz,
      current_period_end timestamptz,external_reference text,payment_confirmed_at timestamptz
    );
    create table public.paid_signup_intents(subscription_id text,consumed_at timestamptz);
    create table public.payment_transactions(
      provider_payment_id text primary key,provider_subscription_id text,user_id uuid,lead_id uuid,
      confirmed_at timestamptz,refunded_at timestamptz,chargeback_at timestamptz,failed_at timestamptz,
      overdue_at timestamptz,last_event_at timestamptz
    );
    create table public.payment_webhook_events(
      event_id text primary key,event_type text,payload jsonb,received_at timestamptz,processed_at timestamptz
    );
    create table public.profiles(id uuid primary key,onboarding_completed boolean,created_at timestamptz);
    create table public.payment_checkout_refs(checkout_session_id text primary key,lead_id uuid,created_at timestamptz);
    create table public.user_credits(user_id uuid,balance int,updated_at timestamptz);

    insert into public.subscriptions values(
      'sub_bad',null,'bad@test.com','active','2026-08-15T10:00:00Z','2026-08-15T10:00:00Z',null,null,null
    );
    insert into public.payment_webhook_events values(
      'evt_bad','PAYMENT_CONFIRMED',jsonb_build_object('payment',jsonb_build_object('subscription','sub_bad')),
      '2026-08-15T11:00:00Z',null
    );
  `);
  await db.exec(migration);
});

afterAll(async () => db?.close?.());

async function check(key: string) {
  const result = await db.query<{ value: Record<string, unknown> }>(
    "select public.admin_health_check($1,'2026-08-15T12:00:00Z',20) value",
    [key],
  );
  return result.rows[0].value;
}

describe('admin_health_check SQL', () => {
  it('detecta assinatura ativa sem confirmação e PAYMENT_CONFIRMED não processado', async () => {
    expect(await check('unconfirmed_subscription')).toMatchObject({ count: 1, severity: 'high' });
    expect(await check('confirmed_unprocessed')).toMatchObject({ count: 1, severity: 'critical' });
  });

  it('mostra regra limpa com count zero e rows vazio', async () => {
    expect(await check('zero_credits')).toMatchObject({ count: 0, rows: [] });
  });

  it('é somente leitura: executar todas as regras não altera tabelas de negócio', async () => {
    const before = await db.query<{ snapshot: string }>(`select jsonb_build_object(
      'subscriptions',(select count(*) from public.subscriptions),
      'events',(select count(*) from public.payment_webhook_events),
      'credits',(select count(*) from public.user_credits))::text snapshot`);
    for (const key of ['unconfirmed_subscription','confirmed_unprocessed','stale_webhook','paid_without_account','missing_period_end','payment_problem','account_without_subscription','onboarding_stale','checkout_abandoned','zero_credits']) await check(key);
    const after = await db.query<{ snapshot: string }>(`select jsonb_build_object(
      'subscriptions',(select count(*) from public.subscriptions),
      'events',(select count(*) from public.payment_webhook_events),
      'credits',(select count(*) from public.user_credits))::text snapshot`);
    expect(after.rows[0].snapshot).toBe(before.rows[0].snapshot);
  });
});
