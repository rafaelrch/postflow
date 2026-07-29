import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../supabase/migrations/20260724_free_plan_entitlement.sql',
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';

function fnBody(name: string): string {
  const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i');
  return sql.match(re)?.[0] ?? '';
}

describe('migration free-plan: entitlement explícito', () => {
  it('existe e é transacional', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(/^begin;/im);
    expect(sql).toMatch(/commit;/i);
  });

  it('cria user_entitlements com plan free|pro e default free', () => {
    expect(sql).toMatch(/create table if not exists public\.user_entitlements/i);
    expect(sql).toMatch(/plan\s+text\s+not\s+null\s+default\s+'free'/i);
    expect(sql).toMatch(/check\s*\(\s*plan\s+in\s*\(\s*'free'\s*,\s*'pro'\s*\)\s*\)/i);
  });

  it('RLS só permite SELECT do próprio — sem policy de INSERT/UPDATE para o usuário', () => {
    expect(sql).toMatch(/alter table public\.user_entitlements enable row level security/i);
    // Cada statement de policy vai até o `;`; ficamos dentro dele com [^;]*.
    const policyStmts = sql.match(/create policy[^;]*on public\.user_entitlements[^;]*;/gi) ?? [];
    expect(policyStmts).toHaveLength(1);
    expect(policyStmts[0]).toMatch(/for select using \(auth\.uid\(\) = user_id\)/i);
    // O usuário não pode escrever o próprio plano: nenhuma policy de escrita.
    expect(policyStmts[0]).not.toMatch(/for (insert|update|all)/i);
  });

  it('mantém o plano em sync com subscriptions (ativação, claim, cancelamento)', () => {
    expect(sql).toMatch(/create trigger subscriptions_entitlement_sync_trg[\s\S]*?after insert or update or delete on public\.subscriptions/i);
    const sync = fnBody('sync_user_entitlement');
    // pro sse existe assinatura active|trialing; senão free (downgrade).
    expect(sync).toMatch(/status in \('active', 'trialing'\)/i);
    expect(sync).toMatch(/case when v_pro then 'pro' else 'free' end/i);
  });

  it('conta nova nasce free explícito via trigger em profiles', () => {
    expect(sql).toMatch(/create trigger profiles_entitlement_default_trg[\s\S]*?after insert on public\.profiles/i);
    expect(fnBody('profiles_entitlement_default')).toMatch(/values \(new\.id, 'free'\)[\s\S]*?on conflict \(user_id\) do nothing/i);
  });

  it('faz backfill sem destruir dado (free para todos, pro para assinantes)', () => {
    expect(sql).toMatch(/insert into public\.user_entitlements[\s\S]*?select id, 'free' from auth\.users/i);
    expect(sql).toMatch(/update public\.user_entitlements[\s\S]*?set plan = 'pro'/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\./i);
  });

  it('limite de 5 projetos free é server-side (trigger BEFORE INSERT em carousels)', () => {
    expect(sql).toMatch(/create trigger enforce_free_carousel_limit_trg[\s\S]*?before insert on public\.carousels/i);
    const limit = fnBody('enforce_free_carousel_limit');
    // pro não tem limite
    expect(limit).toMatch(/if v_plan = 'pro' then\s*return new;/i);
    // falha fechada: sem entitlement => free
    expect(limit).toMatch(/if v_plan is null then\s*v_plan := 'free';/i);
    // recusa o 6º com código próprio, sem apagar nada
    expect(limit).toMatch(/v_count >= 5/i);
    expect(limit).toMatch(/raise exception 'free_project_limit'/i);
  });

  it('é aditiva: não redefine consume_credits nem RLS de tabelas existentes', () => {
    expect(sql).not.toMatch(/create or replace function public\.consume_credits/i);
    expect(sql).not.toMatch(/alter table public\.subscriptions enable row level security/i);
  });
});
