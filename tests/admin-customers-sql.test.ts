import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/20260815b_admin_customers_rpc.sql', import.meta.url), 'utf8');
let db: PGlite;

type RpcRow = { customer_key: string; email: string; user_id: string | null; subscription_id: string | null };

async function list(search: string | null = null, filters: string[] = [], page = 1, pageSize = 25) {
  const { rows } = await db.query<{ result: { total: number; rows: RpcRow[] } }>(
    'select public.admin_list_customers($1,$2,$3,$4) result',
    [search, filters, page, pageSize],
  );
  return rows[0].result;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz not null, deleted_at timestamptz);
    create table public.profiles(id uuid primary key, name text, onboarding_completed boolean not null default false, created_at timestamptz, updated_at timestamptz);
    create table public.subscriptions(id text primary key, user_id uuid, email text, status text, plan_interval text, value numeric, next_due_date date, cancel_at_period_end boolean not null default false, current_period_end timestamptz, external_reference text, created_at timestamptz, updated_at timestamptz);
    create table public.user_credits(user_id uuid primary key, balance integer, monthly_allowance integer);
    create table public.carousels(id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz);
    create table public.news_entries(id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz);
    create table public.scheduled_posts(id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz);
    create table public.leads(id uuid primary key, name text, email text, created_at timestamptz);
    create table public.payment_checkout_refs(lead_id uuid, created_at timestamptz);
  `);
  await db.exec(migration);
  await db.exec(`
    insert into auth.users values
      ('00000000-0000-0000-0000-000000000001','ana@example.com',now(),'2026-08-10',null),
      ('00000000-0000-0000-0000-000000000002','bia@example.com',now(),'2026-08-10',null),
      ('00000000-0000-0000-0000-000000000003','caio@example.com',now(),'2026-08-09',null),
      ('00000000-0000-0000-0000-000000000004','dani@example.com',now(),'2026-08-08',null),
      ('00000000-0000-0000-0000-000000000005','eli@example.com',now(),'2026-08-07',null);
    insert into public.profiles values
      ('00000000-0000-0000-0000-000000000001','Ana',true,'2026-08-10','2026-08-11'),
      ('00000000-0000-0000-0000-000000000002','Bia',false,'2026-08-10','2026-08-10'),
      ('00000000-0000-0000-0000-000000000003','Caio',true,'2026-08-09','2026-08-09'),
      ('00000000-0000-0000-0000-000000000004','Dani',true,'2026-08-08','2026-08-08'),
      ('00000000-0000-0000-0000-000000000005','Eli',true,'2026-08-07','2026-08-07');
    insert into public.subscriptions values
      ('sub-a','00000000-0000-0000-0000-000000000001','ana@example.com','active','month',59.5,null,false,'2026-09-01',null,'2026-08-10','2026-08-10'),
      ('sub-b','00000000-0000-0000-0000-000000000002','bia@example.com','past_due','year',499,null,true,'2026-09-01',null,'2026-08-10','2026-08-10'),
      ('sub-c','00000000-0000-0000-0000-000000000003','caio@example.com','unpaid','month',59.5,null,false,'2026-09-01',null,'2026-08-09','2026-08-09'),
      ('sub-d','00000000-0000-0000-0000-000000000004','dani@example.com','canceled','year',499,null,false,'2026-08-08',null,'2026-08-08','2026-08-08');
    insert into public.leads values ('10000000-0000-0000-0000-000000000001','Orfa urgente','orfa@example.com','2026-08-11');
    insert into public.payment_checkout_refs values ('10000000-0000-0000-0000-000000000001','2026-08-11 01:00Z');
    insert into public.subscriptions values ('sub-orfa',null,'orfa@example.com','active','month',59.5,null,false,null,'10000000-0000-0000-0000-000000000001','2026-08-11','2026-08-11');
    insert into public.user_credits values
      ('00000000-0000-0000-0000-000000000001',0,200),
      ('00000000-0000-0000-0000-000000000002',20,1000);
    insert into public.carousels(user_id,created_at) values ('00000000-0000-0000-0000-000000000001','2026-08-12');
  `);
});

afterAll(async () => db?.close?.());

describe('admin_list_customers — SQL real', () => {
  it('busca o e-mail de quem pagou e ainda não tem conta', async () => {
    const result = await list('orfa@example.com');
    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({ email: 'orfa@example.com', user_id: null, subscription_id: 'sub-orfa' });
  });

  it('busca também por fragmento do meio e domínio', async () => {
    expect((await list('fa@exam')).rows.map((row) => row.email)).toContain('orfa@example.com');
    expect((await list('@example.com')).total).toBe(6);
  });

  it.each([
    ['month', 3], ['year', 2], ['active', 2], ['past_due', 1], ['unpaid', 1], ['canceled', 1],
    ['cancellation_scheduled', 1], ['onboarding_incomplete', 1], ['no_content', 5], ['zero_credits', 1], ['paid_without_account', 1],
  ])('aplica o filtro %s no Postgres', async (filter, total) => {
    expect((await list(null, [filter])).total).toBe(total);
  });

  it('pagina sem repetir ou pular e desempata de forma estável', async () => {
    const all = await list(null, [], 1, 25);
    const first = await list(null, [], 1, 2);
    const second = await list(null, [], 2, 2);
    expect(new Set([...first.rows, ...second.rows].map((row) => row.customer_key)).size).toBe(4);
    expect([...first.rows, ...second.rows].map((row) => row.customer_key)).toEqual(all.rows.slice(0, 4).map((row) => row.customer_key));
    const tied = all.rows.slice(1, 3).map((row) => row.customer_key);
    expect(tied).toEqual([...tied].sort());
  });

  it('preserva conta sem assinatura e assinatura sem conta', async () => {
    const result = await list();
    expect(result.rows.find((row) => row.email === 'eli@example.com')).toMatchObject({ subscription_id: null });
    expect(result.rows.find((row) => row.email === 'orfa@example.com')).toMatchObject({ user_id: null });
  });

  it('não concede execução da função a anon nem authenticated', async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
      select
        has_function_privilege('anon', 'public.admin_list_customers(text,text[],integer,integer)', 'execute') anon,
        has_function_privilege('authenticated', 'public.admin_list_customers(text,text[],integer,integer)', 'execute') authenticated,
        has_function_privilege('service_role', 'public.admin_list_customers(text,text[],integer,integer)', 'execute') service
    `);
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
});
