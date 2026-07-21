import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = (() => { try { return readFileSync(new URL('../app/api/abacatepay/passwordless/start/route.ts', import.meta.url), 'utf8'); } catch { return ''; } })();
const sql = readFileSync(new URL('../supabase/credits-and-flow.sql', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../lib/abacatepay-sync.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/(auth)/cadastro/page.tsx', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../app/api/abacatepay/checkout/route.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260721_abacatepay_secure_rollout.sql', import.meta.url), 'utf8');
const runbook = readFileSync(new URL('../docs/abacatepay-db-rollout.md', import.meta.url), 'utf8');

describe('passwordless B2 start (failure-first)', () => {
  it('envia OTP e não faz upsert direto de intent', () => {
    expect(route).toMatch(/signInWithOtp/);
    expect(route).toMatch(/shouldCreateUser\s*:\s*false/);
    expect(route).not.toMatch(/from\(['"]paid_signup_intents['"]\)[\s\S]*\.upsert/);
  });
  it('resolve ref por mapping e usa checkout_id', () => { expect(route).toMatch(/abacatepay_checkout_refs/); expect(route).toMatch(/getCheckout\(mapping\.checkout_id\)/); expect(route).not.toMatch(/getCheckout\(row\.id\)|\.eq\(['"]ref['"]/) });
  it('rate-limita antes da primeira chamada externa', () => { expect(route.indexOf('rateLimit')).toBeGreaterThanOrEqual(0); expect(route.indexOf('rateLimit')).toBeLessThan(route.indexOf('getCheckout(mapping.checkout_id)')); });
  it('intent não permite transferência no conflito', () => { expect(sql).toMatch(/where id=v_id and user_id=v_uid/); expect(sql).toMatch(/signup_intent_conflict/); expect(sql).not.toMatch(/on conflict \(subscription_id\)[\s\S]*set user_id\s*=/i); });
  it('mapping não persiste ref cru e claim ocorre na confirmação', () => { expect(route).toMatch(/ref_hash/); expect(route).not.toMatch(/ref,\s*checkout_id/); expect(sql).toMatch(/after update of email_confirmed_at/); });
  it('sincronização remove ref de metadata e permite linkUser false', () => { expect(sync).toMatch(/delete metadata\.ref/); expect(sync).toMatch(/linkUser\?\s*:\s*boolean/); expect(route).toMatch(/linkUser:\s*false/); });
  it('cadastro não consulta metadata.ref e checkout usa ref_hash', () => { expect(page).not.toMatch(/metadata->>ref/); expect(checkout).toMatch(/onConflict:\s*['"]ref_hash['"]/); });
  it('não expõe erros arbitrários', () => { expect(checkout).not.toMatch(/err\.message|error\.message/); expect(route).not.toMatch(/err\.message|error\.message/); });
  it('confirmed user must be claimed before OTP and new user only via confirmation trigger', () => { expect(sql).toMatch(/v_confirmed[\s\S]*claim_paid_signup_for_user\(v_uid\)/); expect(sql).toMatch(/after update of email_confirmed_at/); expect(route).toMatch(/state\?[^\n]*pending.*claimed|\['pending',\s*'claimed'\]/); });
  it('canonical e migration mantêm invariantes de expiração, lead e marcador', () => {
    for (const source of [sql, migration]) {
      expect(source).toMatch(/expires_at<=now\(\)/); expect(source).toMatch(/expires_at>now\(\)/);
      expect(source).toMatch(/raw_app_meta_data->>'origin'=.?paid_passwordless/); expect(source).toMatch(/public\.leads/);
      expect(source).toMatch(/lower\(email\)=lower\(v_email\)/); expect(source).toMatch(/coalesce\(v_name,''\)/); expect(source).toMatch(/coalesce\(v_phone,''\)/);
    }
  });
  it('definição FINAL de claim é equivalente nos dois arquivos', () => {
    const finalDef = (source: string) => source.match(/create or replace function public\.claim_paid_signup_for_user\(p_uid uuid\)[\s\S]*?end; \$\$;/gi)?.at(-1) ?? '';
    const canonical = finalDef(sql); const migrated = finalDef(migration);
    expect(canonical).not.toBe(''); expect(migrated).not.toBe('');
    for (const definition of [canonical, migrated]) {
      expect(definition).toMatch(/update public\.abacatepay_checkout_refs set consumed_at/);
      expect(definition).toMatch(/abacatepay_customers/);
      expect(definition).toMatch(/consumed_at is null/); expect(definition).toMatch(/for update/);
      expect(definition).toMatch(/on conflict\(user_id\) do update/);
    }
    expect(canonical.replace(/\s+/g,' ')).toBe(migrated.replace(/\s+/g,' '));
  });
  it('gate final bloqueia criação sem app_metadata marker e não é removido depois', () => {
    for (const source of [sql, migration]) {
      const defs = source.match(/create or replace function public\.enforce_paid_passwordless_marker\(\)[\s\S]*?create trigger enforce_paid_passwordless_marker_trg[\s\S]*?execute function public\.enforce_paid_passwordless_marker\(\)/gi) ?? [];
      expect(defs.length).toBeGreaterThan(0);
      const last = defs.at(-1)!;
      expect(last).toMatch(/raw_app_meta_data->>'origin'.*paid_passwordless/);
      expect(last).toMatch(/raise exception 'paid_passwordless_marker_required'/);
    }
    expect(migration.lastIndexOf('drop trigger if exists enforce_paid_passwordless_marker_trg')).toBeLessThan(migration.lastIndexOf('create trigger enforce_paid_passwordless_marker_trg'));
    expect(migration).not.toMatch(/raw_user_meta_data.*origin.*paid_passwordless/);
  });
  it('runbook mantém Email provider ligado e documenta o gate', () => {
    expect(runbook).toMatch(/keep the\s+Supabase Email provider enabled/i);
    expect(runbook).toMatch(/enforce_paid_passwordless_marker_trg/);
    expect(runbook).not.toMatch(/disable public\s+email signup/i);
  });
});
