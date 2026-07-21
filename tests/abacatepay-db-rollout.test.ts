import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const migrationPath = new URL(
  '../supabase/migrations/20260721_abacatepay_secure_rollout.sql',
  import.meta.url,
);
const credits = read('supabase/credits-and-flow.sql');
const abacatepay = read('supabase/abacatepay-schema.sql');
const authForm = read('components/auth/AuthForm.tsx');

function b2Violations(sql: string): string[] {
  const violations: string[] = [];
  if (!/raw_user_meta_data\s*->>\s*'checkout_ref'/i.test(sql)) violations.push('missing_checkout_ref');
  if (!/provider\s*=\s*'abacatepay'/i.test(sql)) violations.push('missing_provider_filter');
  if (!/user_id\s+is\s+null/i.test(sql)) violations.push('missing_unclaimed_filter');
  if (!/update\s+public\.subscriptions[\s\S]*set\s+user_id\s*=\s*new\.id/i.test(sql)) {
    violations.push('missing_atomic_claim');
  }
  return violations;
}

function enforceFunction(sql: string): string {
  return sql.match(/create or replace function public\.enforce_paid_signup\(\)[\s\S]*?\$\$;/i)?.[0] ?? '';
}

describe('rollout SQL seguro AbacatePay', () => {
  it('possui migration one-shot transacional específica do snapshot', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
    expect(migration).toMatch(/^begin;/im);
    expect(migration).toMatch(/commit;/i);
    expect(migration).toMatch(/alter\s+column\s+stripe_customer_id\s+drop\s+not\s+null/i);
    expect(migration).toMatch(/add\s+column\s+if\s+not\s+exists\s+provider[^;]*default\s+'stripe'/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\./i);
  });

  it('fecha B2 no trigger com ref, provider e claim atômico one-shot', () => {
    const enforce = enforceFunction(credits);
    expect(enforce).not.toBe('');
    expect(b2Violations(enforce)).toEqual([]);
    expect(enforce).toMatch(/new\.raw_user_meta_data\s*:?=\s*coalesce[\s\S]*?-\s*'checkout_ref'/i);
    expect(credits).toMatch(/create\s+trigger\s+on_auth_user_created/i);
  });

  it('mutation-check detecta remoção dos guards B2 críticos', () => {
    const enforce = enforceFunction(credits);
    const withoutProvider = enforce.replace(/provider\s*=\s*'abacatepay'/i, 'true');
    const withoutClaim = enforce.replace(/user_id\s+is\s+null/i, 'true');

    expect(b2Violations(withoutProvider)).toContain('missing_provider_filter');
    expect(b2Violations(withoutClaim)).toContain('missing_unclaimed_filter');
  });

  it('endurece RPCs SECURITY DEFINER e separa débito de estorno', () => {
    expect(credits).toMatch(/if\s+p_cost\s*<=\s*0[\s\S]*raise\s+exception/i);
    expect(credits).toMatch(/auth\.uid\(\)\s+is\s+distinct\s+from\s+p_user/i);
    expect(credits).toMatch(/create\s+or\s+replace\s+function\s+public\.refund_credits/i);
    expect(credits).toMatch(/revoke\s+all\s+on\s+function\s+public\.consume_credits[^;]*from\s+public\s*,\s*anon/i);
    expect(credits).toMatch(/grant\s+execute\s+on\s+function\s+public\.consume_credits[^;]*to\s+authenticated/i);
    expect(credits).toMatch(/grant\s+execute\s+on\s+function\s+public\.refresh_credits[^;]*to\s+service_role/i);
    expect(credits).toMatch(/grant\s+execute\s+on\s+function\s+public\.enforce_paid_signup\(\)[\s\S]*?to\s+supabase_auth_admin/i);
    expect(credits).toMatch(/grant\s+execute\s+on\s+function\s+public\.handle_new_user\(\)[\s\S]*?to\s+supabase_auth_admin/i);
    expect(credits).toMatch(/revoke\s+all\s+on\s+function\s+public\.plan_allowance[^;]*from\s+public\s*,\s*anon/i);
  });

  it('não permite INSERT client-side em abacatepay_customers', () => {
    expect(abacatepay).not.toMatch(/create\s+policy\s+abacatepay_customers_insert_own/i);
    expect(abacatepay).toMatch(/drop\s+policy\s+if\s+exists\s+abacatepay_customers_insert_own/i);
  });

  it('UI de signup só envia a prova server-validated, nunca um ref lido do browser', () => {
    expect(authForm).toMatch(/const\s+ref\s*=\s*checkoutRef/);
    expect(authForm).not.toMatch(/const\s+ref\s*=\s*searchParams\.get\(['"]ref['"]\)/);
    expect(authForm).toMatch(/checkout_ref:\s*ref/);
  });
});
