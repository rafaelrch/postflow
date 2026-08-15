import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20260815214500_product_events_credit_ledger.sql', import.meta.url),
  'utf8',
);
const USER = '11111111-1111-4111-8111-111111111111';
const CHARGE = '22222222-2222-4222-8222-222222222222';
const REFUND = '33333333-3333-4333-8333-333333333333';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select ''${USER}''::uuid';
    create table public.user_credits(
      user_id uuid primary key, balance int not null, monthly_allowance int not null,
      period_start timestamptz not null, period_end timestamptz not null
    );
    create table public.subscriptions(
      user_id uuid, payment_provider text, status text, plan_interval text,
      current_period_end timestamptz, updated_at timestamptz
    );
    create function public.plan_allowance(text) returns int language sql immutable as 'select 200';
    insert into auth.users values ('${USER}');
    insert into public.user_credits values ('${USER}',10,200,now(),now()+interval '1 month');
  `);
  await db.exec(migration);
});

afterAll(async () => db?.close?.());

describe('ledger atômico de créditos', () => {
  it('instala sem alterar o saldo existente', async () => {
    const result = await db.query<{ balance: number }>('select balance from public.user_credits');
    expect(result.rows[0].balance).toBe(10);
  });

  it('não duplica débito nem estorno repetidos com a mesma chave', async () => {
    await db.query('select public.consume_credits_tracked($1,5,$2,$3)', [USER, 'image', CHARGE]);
    await db.query('select public.consume_credits_tracked($1,5,$2,$3)', [USER, 'image', CHARGE]);
    let state = await db.query<{ balance: number; movements: number }>(`
      select balance, (select count(*)::int from public.credit_ledger) movements
      from public.user_credits where user_id=$1`, [USER]);
    expect(state.rows[0]).toEqual({ balance: 5, movements: 1 });

    await db.query('select public.refund_credits_tracked($1,5,$2,$3)', [USER, 'image', REFUND]);
    await db.query('select public.refund_credits_tracked($1,5,$2,$3)', [USER, 'image', REFUND]);
    state = await db.query<{ balance: number; movements: number }>(`
      select balance, (select count(*)::int from public.credit_ledger) movements
      from public.user_credits where user_id=$1`, [USER]);
    expect(state.rows[0]).toEqual({ balance: 10, movements: 2 });
  });
});
