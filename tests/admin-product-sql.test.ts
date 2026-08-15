import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const base = readFileSync(new URL('../supabase/migrations/20260815214500_product_events_credit_ledger.sql', import.meta.url), 'utf8');
const metrics = readFileSync(new URL('../supabase/migrations/20260815223000_admin_product_metrics.sql', import.meta.url), 'utf8');
const USER = '11111111-1111-4111-8111-111111111111';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select ''${USER}''::uuid';
    create table public.user_credits(user_id uuid primary key,balance int,monthly_allowance int,period_start timestamptz,period_end timestamptz);
    create table public.subscriptions(user_id uuid,payment_provider text,status text,plan_interval text,current_period_end timestamptz,updated_at timestamptz);
    create function public.plan_allowance(text) returns int language sql immutable as 'select 200';
    create table public.carousels(id uuid primary key default gen_random_uuid());
    create table public.news_entries(id uuid primary key default gen_random_uuid());
    insert into auth.users values ('${USER}');
    insert into public.user_credits values ('${USER}',0,200,now(),now()+interval '1 month');
    insert into public.subscriptions values ('${USER}','asaas','active','month',now()+interval '1 month',now());
    insert into public.carousels default values; insert into public.news_entries default values;
  `);
  await db.exec(base);
  await db.exec(metrics);
  await db.exec(`
    insert into public.product_events(user_id,event_name,feature,properties,created_at) values
      ('${USER}','session_started','session','{}','2026-08-15T09:00:00Z'),
      ('${USER}','carousel_created','carousel','{"source":"ai","style":"template01","slide_count":5}','2026-08-15T10:00:00Z'),
      ('${USER}','carousel_exported_all','carousel','{"export_format":"zip"}','2026-08-15T11:00:00Z');
    insert into public.credit_ledger(user_id,movement_type,feature,quantity,balance_before,balance_after,idempotency_key,created_at)
      values ('${USER}','consume','carousel',5,10,5,'22222222-2222-4222-8222-222222222222','2026-08-15T10:00:00Z');
    insert into public.ai_generation_events(operation_id,user_id,feature,status,model,credits,duration_ms,input_tokens,output_tokens,created_at)
      values ('33333333-3333-4333-8333-333333333333','${USER}','carousel','succeeded','gpt-5.4-nano',5,500,100,50,'2026-08-15T10:00:00Z');
  `);
});

afterAll(async () => db?.close?.());

async function block(name: string) {
  const result = await db.query<{ value: Record<string, unknown> }>(
    "select public.admin_product_metrics($1,'2026-08-15T00:00:00Z','2026-08-16T00:00:00Z') value", [name]);
  return result.rows[0].value;
}

describe('admin_product_metrics SQL', () => {
  it('conta usuários distintos e separa foto atual de eventos históricos', async () => {
    expect(await block('activity')).toMatchObject({ dau: 1, wau: 1, mau: 1, existing_carousels: 1, existing_news: 1 });
  });

  it('mede origem, exportação, créditos e insumos brutos sem conteúdo', async () => {
    expect(await block('creation')).toMatchObject({ exports_all: 1, average_slides: 5, carousel_modes: [{ mode: 'ai', count: 1 }] });
    expect(await block('credits_ai')).toMatchObject({ ai_succeeded: 1, ai_failed: 0, zero_credits: 1, credits_by_feature: [{ feature: 'carousel', credits: 5 }] });
    expect(metrics).not.toMatch(/prompt|caption|slide_text|response_text/i);
  });

  it('não mistura reels desativado com features vivas', async () => {
    const value = await block('features');
    expect(value.reels_disabled).toBe(true);
    expect(JSON.stringify(value.features)).not.toContain('reels');
  });
});
