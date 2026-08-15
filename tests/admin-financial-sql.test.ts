import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20260815c_admin_financial_transactions.sql', import.meta.url),
  'utf8',
);

let db: PGlite;

function paymentPayload(event: string, status: string, paymentId: string, value = 59.5) {
  return JSON.stringify({
    id: `evt-${event}-${paymentId}`,
    event,
    payment: {
      id: paymentId,
      subscription: 'sub-1',
      status,
      value,
      billingType: 'CREDIT_CARD',
      dueDate: '2026-08-10',
    },
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.leads(id uuid primary key);
    create table public.subscriptions(
      id text primary key, user_id uuid, external_reference text, plan_interval text,
      email text, value numeric, status text, cancel_at_period_end boolean,
      current_period_end timestamptz, created_at timestamptz
    );
    create table public.payment_webhook_events(
      event_id text primary key, event_type text, payload jsonb,
      received_at timestamptz not null, processed_at timestamptz
    );
    insert into auth.users values ('00000000-0000-0000-0000-000000000001');
    insert into public.leads values ('10000000-0000-0000-0000-000000000001');
    insert into public.subscriptions values (
      'sub-1','00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001','month','payer@example.com',
      59.5,'active',false,'2026-09-10','2026-08-01'
    );
  `);
  await db.query(
    `insert into public.payment_webhook_events(event_id,event_type,payload,received_at) values
      ('evt-confirmed','PAYMENT_CONFIRMED',$1,'2026-08-10T10:00:00Z'),
      ('evt-received','PAYMENT_RECEIVED',$2,'2026-08-12T10:00:00Z'),
      ('evt-refunded','PAYMENT_REFUNDED',$3,'2026-08-13T10:00:00Z'),
      ('evt-received-2','PAYMENT_RECEIVED',$4,'2026-08-12T12:00:00Z'),
      ('evt-chargeback-2','PAYMENT_CHARGEBACK_REQUESTED',$5,'2026-08-14T12:00:00Z'),
      ('evt-confirmed-4','PAYMENT_CONFIRMED',$6,'2026-08-15T12:00:00Z')`,
    [
      paymentPayload('PAYMENT_CONFIRMED', 'CONFIRMED', 'pay-1'),
      paymentPayload('PAYMENT_RECEIVED', 'RECEIVED', 'pay-1'),
      paymentPayload('PAYMENT_REFUNDED', 'REFUNDED', 'pay-1'),
      paymentPayload('PAYMENT_RECEIVED', 'RECEIVED', 'pay-2', 499),
      paymentPayload('PAYMENT_CHARGEBACK_REQUESTED', 'CHARGEBACK_REQUESTED', 'pay-2', 499),
      paymentPayload('PAYMENT_CONFIRMED', 'CONFIRMED', 'pay-4', 100),
    ],
  );
  await db.exec(migration);
});

afterAll(async () => db?.close?.());

describe('payment_transactions — SQL real', () => {
  it('deduplica confirmado → recebido → reembolsado por provider_payment_id', async () => {
    const { rows } = await db.query<{
      n: number; status: string; confirmed_at: string; received_at: string; refunded_at: string;
    }>(`select count(*)::int n, max(status) status, max(confirmed_at)::text confirmed_at,
        max(received_at)::text received_at, max(refunded_at)::text refunded_at
       from public.payment_transactions where provider_payment_id='pay-1'`);
    expect(rows[0].n).toBe(1);
    expect(rows[0].status).toBe('REFUNDED');
    expect(rows[0].confirmed_at).toBeTruthy();
    expect(rows[0].received_at).toBeTruthy();
    expect(rows[0].refunded_at).toBeTruthy();
  });

  it('backfill é idempotente quando a migration roda duas vezes', async () => {
    const before = await db.query<{ snapshot: string }>(
      `select jsonb_agg(to_jsonb(t) order by provider_payment_id)::text snapshot from public.payment_transactions t`,
    );
    await db.exec(migration);
    const after = await db.query<{ snapshot: string }>(
      `select jsonb_agg(to_jsonb(t) order by provider_payment_id)::text snapshot from public.payment_transactions t`,
    );
    expect(after.rows[0].snapshot).toBe(before.rows[0].snapshot);
  });

  it('confirmado e recebido são métricas separadas, sem somar eventos', async () => {
    const { rows } = await db.query<{ result: Record<string, { count: number; amount: number }> }>(
      `select public.admin_financial_revenue('2026-08-01','2026-09-01','day') result`,
    );
    // Duas foram recebidas e revertidas. A terceira foi só confirmada.
    expect(rows[0].result.received).toEqual({ count: 0, amount: 0 });
    expect(rows[0].result.confirmed).toEqual({ count: 1, amount: 100 });
    expect(rows[0].result.refunded).toEqual({ count: 1, amount: 59.5 });
    expect(rows[0].result.chargeback).toEqual({ count: 1, amount: 499 });
  });

  it('RPC incremental preserva datas anteriores e não duplica a cobrança', async () => {
    await db.query(`select public.record_asaas_payment_transaction($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['pay-3','sub-1','PAYMENT_CONFIRMED','CONFIRMED',59.5,'PIX','2026-08-15','2026-08-15T10:00:00Z']);
    await db.query(`select public.record_asaas_payment_transaction($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['pay-3','sub-1','PAYMENT_RECEIVED','RECEIVED',59.5,'PIX','2026-08-15','2026-08-15T10:05:00Z']);
    const { rows } = await db.query<{ n: number; confirmed: boolean; received: boolean }>(
      `select count(*)::int n, bool_and(confirmed_at is not null) confirmed,
       bool_and(received_at is not null) received from public.payment_transactions where provider_payment_id='pay-3'`,
    );
    expect(rows[0]).toEqual({ n: 1, confirmed: true, received: true });
  });

  it('tabela e funções não são acessíveis por anon/authenticated', async () => {
    const { rows } = await db.query<{ anon_table: boolean; anon_fn: boolean; service_fn: boolean }>(`
      select
        has_table_privilege('anon','public.payment_transactions','select') anon_table,
        has_function_privilege('anon','public.record_asaas_payment_transaction(text,text,text,text,numeric,text,date,timestamptz)','execute') anon_fn,
        has_function_privilege('service_role','public.record_asaas_payment_transaction(text,text,text,text,numeric,text,date,timestamptz)','execute') service_fn
    `);
    expect(rows[0]).toEqual({ anon_table: false, anon_fn: false, service_fn: true });
  });
});
