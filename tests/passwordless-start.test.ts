import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appUrl } from '../lib/app-url';

const route = (() => { try { return readFileSync(new URL('../app/api/abacatepay/passwordless/start/route.ts', import.meta.url), 'utf8'); } catch { return ''; } })();
const sql = readFileSync(new URL('../supabase/credits-and-flow.sql', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../lib/abacatepay-sync.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/(auth)/cadastro/page.tsx', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../app/api/abacatepay/checkout/route.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260721_abacatepay_secure_rollout.sql', import.meta.url), 'utf8');
const runbook = readFileSync(new URL('../docs/abacatepay-db-rollout.md', import.meta.url), 'utf8');

describe('passwordless B2 start (failure-first)', () => {
  it('cria usuário marcado, prepara intent e reenvia confirmação sem invite/OTP público', () => {
    expect(route).toMatch(/\.createUser\(/);
    expect(route).toMatch(/app_metadata:\s*\{\s*origin:\s*['"]paid_passwordless['"]\s*\}/);
    expect(route).toMatch(/\.auth\.resend\(/);
    expect(route).toMatch(/type:\s*['"]signup['"]/);
    expect(route).not.toMatch(/inviteUserByEmail/);
    expect(route).not.toMatch(/signInWithOtp/);
    expect(route).toMatch(/emailRedirectTo\s*:\s*appUrl\(['"]\/definir-senha['"]\)/);
    expect(route).not.toMatch(/from\(['"]paid_signup_intents['"]\)[\s\S]*\.upsert/);
  });
  it('resolve ref por mapping e usa checkout_id', () => { expect(route).toMatch(/abacatepay_checkout_refs/); expect(route).toMatch(/getCheckout\(mapping\.checkout_id\)/); expect(route).not.toMatch(/getCheckout\(row\.id\)|\.eq\(['"]ref['"]/) });
  it('rate-limita antes da primeira chamada externa', () => { expect(route.indexOf('rateLimit')).toBeGreaterThanOrEqual(0); expect(route.indexOf('rateLimit')).toBeLessThan(route.indexOf('getCheckout(mapping.checkout_id)')); });
  it('intent não permite transferência no conflito', () => { expect(sql).toMatch(/where id=v_id and user_id=v_uid/); expect(sql).toMatch(/signup_intent_conflict/); expect(sql).not.toMatch(/on conflict \(subscription_id\)[\s\S]*set user_id\s*=/i); });
  it('mapping não persiste ref cru e claim ocorre na confirmação', () => { expect(route).toMatch(/ref_hash/); expect(route).not.toMatch(/ref,\s*checkout_id/); expect(sql).toMatch(/after update of email_confirmed_at/); });
  it('sincronização remove ref de metadata e permite linkUser false', () => { expect(sync).toMatch(/delete metadata\.ref/); expect(sync).toMatch(/linkUser\?\s*:\s*boolean/); expect(route).toMatch(/linkUser:\s*false/); });
  it('cadastro não consulta metadata.ref e checkout usa ref_hash', () => { expect(page).not.toMatch(/metadata->>ref/); expect(checkout).toMatch(/onConflict:\s*['"]ref_hash['"]/); });
  it('não expõe erros arbitrários', () => { expect(checkout).not.toMatch(/err\.message|error\.message/); expect(route).not.toMatch(/err\.message|error\.message/); });
  it('confirmed marked user is claimed during prepare before confirmation resend', () => { expect(sql).toMatch(/v_confirmed[\s\S]*claim_paid_signup_for_user\(v_uid\)/); expect(sql).toMatch(/after update of email_confirmed_at/); expect(route).toMatch(/state\?[^\n]*pending.*claimed|\['pending',\s*'claimed'\]/); });
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
  it('gate BEFORE INSERT exige assinatura paga (não o marcador materializável pós-insert)', () => {
    const standalone = readFileSync(new URL('../supabase/migrations/20260722_replace_marker_with_paid_precondition.sql', import.meta.url), 'utf8');
    for (const source of [sql, migration, standalone]) {
      const defs = source.match(/create or replace function public\.enforce_paid_signup_precondition\(\)[\s\S]*?create trigger enforce_paid_signup_precondition_trg[\s\S]*?execute function public\.enforce_paid_signup_precondition\(\)/gi) ?? [];
      expect(defs.length).toBeGreaterThan(0);
      const last = defs.at(-1)!;
      // A precondição é assinatura abacatepay ativa/não-reivindicada pelo e-mail…
      expect(last).toMatch(/from public\.subscriptions[\s\S]*provider='abacatepay'[\s\S]*status='active'[\s\S]*user_id is null[\s\S]*lower\(email\)=lower\(new\.email\)/i);
      expect(last).toMatch(/raise exception 'paid_subscription_required'/);
      // …e o gate NÃO depende mais do marcador de origin no BEFORE INSERT.
      expect(last).not.toMatch(/raw_app_meta_data->>'origin'/);
      expect(last).not.toMatch(/paid_passwordless_marker_required/);
    }
    // O marcador antigo foi removido de todo arquivo (função + trigger).
    for (const source of [sql, migration, standalone]) {
      expect(source).toMatch(/drop trigger if exists enforce_paid_passwordless_marker_trg/i);
      expect(source).toMatch(/drop function if exists public\.enforce_paid_passwordless_marker\(\)/i);
      expect(source).not.toMatch(/create trigger enforce_paid_passwordless_marker_trg/i);
      expect(source).not.toMatch(/raise exception 'paid_passwordless_marker_required'/i);
      // trigger novo é criado depois do drop do antigo (ordem idempotente).
      expect(source.lastIndexOf('drop trigger if exists enforce_paid_signup_precondition_trg')).toBeLessThan(source.lastIndexOf('create trigger enforce_paid_signup_precondition_trg'));
    }
    // O marcador de origin continua sendo GRAVADO/lido PÓS-insert (claim + intent),
    // só não é mais a condição do gate BEFORE INSERT.
    expect(sql).toMatch(/raw_app_meta_data->>'origin'='paid_passwordless'/);
  });
  it('runbook mantém Email provider ligado e documenta o novo gate', () => {
    expect(runbook).toMatch(/keep the\s+Supabase Email provider\s+enabled/i);
    expect(runbook).toMatch(/enforce_paid_signup_precondition_trg/);
    expect(runbook).not.toMatch(/disable public\s+email signup/i);
    expect(runbook).toMatch(/Allow new users to sign up[^\n]*disabled/i);
    expect(runbook).toMatch(/auth\.resend/);
    expect(runbook).toMatch(/Mandatory hosted smoke/i);
    expect(runbook).not.toMatch(/signInWithOtp\(\{ shouldCreateUser/);
  });
  it('definição FINAL do prepare é marker-only e equivalente no canônico/migration', () => {
    const finalPrepare = (source: string) => source.match(/create or replace function public\.prepare_paid_signup_intent\(p_subscription_id text\s*,\s*p_email text\)[\s\S]*?grant execute on function public\.prepare_paid_signup_intent\(text\s*,\s*text\) to service_role;/gi)?.at(-1) ?? '';
    const normalize = (definition: string) => definition
      .replace(/\s+/g, ' ')
      .replace(/\s*([(),=<>;+])\s*/g, '$1')
      .trim();
    const canonical = finalPrepare(sql);
    const migrated = finalPrepare(migration);
    for (const definition of [canonical, migrated]) {
      expect(definition).not.toBe('');
      expect(definition).toMatch(/raw_app_meta_data->>'origin'='paid_passwordless'/);
      expect(definition).not.toMatch(/email_confirmed_at is not null\s+or/i);
    }
    expect(normalize(canonical)).toBe(normalize(migrated));
  });
});

// Regressão do 403 determinístico: a rota rejeita quando `origin !== appUrl()`
// (route.ts). Antes do fix, appUrl() sem path devolvia a base COM barra final,
// então nunca casava com o header Origin do navegador (RFC 6454, sem barra) e
// a confirmação jamais saía. Exercita o appUrl() real, sem mockar Supabase/AbacatePay.
describe('passwordless start — checagem de origin (regressão do 403)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Réplica fiel do gate em route.ts:17.
  const originRejeitado = (origin: string | null) => !origin || origin !== appUrl();

  it('libera quando o Origin do navegador bate com appUrl() (sem barra final)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://creatools.com.br');

    // Origin real de navegador: nunca traz barra final.
    expect(originRejeitado('https://creatools.com.br')).toBe(false);
  });

  it('libera mesmo se a env tiver barra final (normalizada por appUrl())', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://creatools.com.br/');

    expect(originRejeitado('https://creatools.com.br')).toBe(false);
  });

  it('bloqueia (403) quando o Origin difere ou está ausente', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://creatools.com.br');

    expect(originRejeitado('https://evil.example.com')).toBe(true);
    expect(originRejeitado('https://creatools.com.br/')).toBe(true); // barra final ≠ Origin
    expect(originRejeitado(null)).toBe(true);
  });
});
