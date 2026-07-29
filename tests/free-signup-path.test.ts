import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260725_free_signup_path.sql');
const migration22 = read('supabase/migrations/20260722_replace_marker_with_paid_precondition.sql');
const migration26 = read('supabase/migrations/20260726_free_entitlement_on_signup.sql');
const cadastro = read('app/(auth)/cadastro/page.tsx');
const definirSenha = read('app/(auth)/definir-senha/page.tsx');
const freeForm = read('components/auth/FreeSignupForm.tsx');
const route = read('app/api/auth/free-signup/route.ts');
const landing = read('app/(marketing)/page.tsx');
const precos = read('app/(marketing)/precos/page.tsx');

function preconditionBody(sql: string): string {
  return sql.match(/create or replace function public\.enforce_paid_signup_precondition\(\)[\s\S]*?\$\$;/i)?.[0] ?? '';
}

describe('migration free-signup: separa caminhos sem enfraquecer o pago', () => {
  const body = preconditionBody(migration);

  it('é ARQUIVO NOVO e transacional (Rafael precisa rodar)', () => {
    expect(migration).toMatch(/^begin;/im);
    expect(migration).toMatch(/commit;/i);
  });

  it('tem ramo FREE explícito, gated no marcador signup_kind=free', () => {
    expect(body).toMatch(/raw_user_meta_data->>'signup_kind'\s*=\s*'free'/i);
    // O ramo free retorna cedo, ANTES do check pago.
    const freeIdx = body.search(/signup_kind'\s*=\s*'free'/i);
    const paidIdx = body.search(/paid_subscription_required/i);
    expect(freeIdx).toBeGreaterThan(-1);
    expect(paidIdx).toBeGreaterThan(freeIdx);
  });

  it('mantém o ramo PAGO IDÊNTICO ao de 20260722 (precondição não afrouxada)', () => {
    const paidCheck = /if not exists\s*\(\s*select 1 from public\.subscriptions\s*where provider='abacatepay' and status='active' and user_id is null\s*and lower\(email\)=lower\(new\.email\)\s*\)\s*then\s*raise exception 'paid_subscription_required'/i;
    expect(body).toMatch(paidCheck);
    expect(migration22).toMatch(paidCheck);
  });

  it('o ramo free NÃO toca subscriptions nem concede pro', () => {
    // Entre o gate free e o return, não há nenhuma escrita/leitura de assinatura.
    const freeBranch = body.match(/signup_kind'\s*=\s*'free' then[\s\S]*?return new;/i)?.[0] ?? '';
    expect(freeBranch).not.toMatch(/subscriptions|update|insert|pro/i);
  });
});

describe('página de cadastro: caminho free explícito, pago intacto', () => {
  it('só entra no free com ?plan=free E sem ref', () => {
    expect(cadastro).toMatch(/plan\s*===\s*'free'\s*&&\s*!ref/);
    expect(cadastro).toMatch(/<FreeSignupForm\s*\/>/);
  });
  it('mantém o gating do ref pago inalterado', () => {
    expect(cadastro).toMatch(/\/\^\[A-Za-z0-9_-\]\{8,160\}\$\/\.test\(ref\)/);
    expect(cadastro).toMatch(/<AuthForm mode="signup" checkoutRef=\{ref\}/);
  });
});

describe('CTAs do card Free apontam para o cadastro grátis', () => {
  it('landing e /precos usam /cadastro?plan=free', () => {
    expect(landing).toMatch(/href="\/cadastro\?plan=free"/);
    expect(precos).toMatch(/href="\/cadastro\?plan=free"/);
  });
});

describe('fluxo free: senha no cadastro, confirma e entra pelo login', () => {
  it('o formulário coleta senha e envia email+password para a rota', () => {
    expect(freeForm).toMatch(/type=\{showPassword \? 'text' : 'password'\}/);
    expect(freeForm).toMatch(/minLength=\{PASSWORD_MIN\}/);
    expect(freeForm).toMatch(/JSON\.stringify\(\{ email: email\.trim\(\), password \}\)/);
  });

  it('a rota cria conta não confirmada com senha e redireciona confirmação para /login', () => {
    expect(route).toMatch(/password,/);
    expect(route).toMatch(/email_confirm:\s*false/);
    expect(route).toMatch(/emailRedirectTo:\s*appUrl\('\/login'\)/);
    expect(route).not.toMatch(/emailRedirectTo:\s*appUrl\('\/definir-senha'\)/);
  });
});

describe('migration 20260726: entitlement free garantido na criação da conta', () => {
  // Remove comentários (-- …) para checar só o SQL executável — a doc menciona 'pro'.
  const code = migration26.replace(/--[^\n]*/g, '');

  it('é ARQUIVO NOVO e transacional; não altera 20260724/20260725', () => {
    expect(migration26).toMatch(/^begin;/im);
    expect(migration26).toMatch(/commit;/i);
  });

  it('trigger AFTER INSERT em auth.users insere plan=free (nunca pro), idempotente', () => {
    expect(code).toMatch(/create trigger ensure_user_entitlement_trg\s+after insert on auth\.users/i);
    const fn = code.match(/create or replace function public\.ensure_user_entitlement\(\)[\s\S]*?\$\$;/i)?.[0] ?? '';
    expect(fn).toMatch(/insert into public\.user_entitlements \(user_id, plan\)\s*values \(new\.id, 'free'\)/i);
    expect(fn).toMatch(/on conflict \(user_id\) do nothing/i);
    // Blindado: falha aqui não quebra a criação do usuário (free nem pago).
    expect(fn).toMatch(/exception when others then/i);
  });

  it('nenhum statement executável concede pro (só free)', () => {
    expect(code).not.toMatch(/'pro'/);
  });

  it('faz backfill das contas existentes sem entitlement, sem sobrescrever', () => {
    expect(code).toMatch(/insert into public\.user_entitlements[\s\S]*?from\s+auth\.users u\s*where not exists/i);
    expect(code).toMatch(/on conflict \(user_id\) do nothing/i);
  });
});

describe('definir-senha volta a ser SÓ do fluxo pago (intocado)', () => {
  it('não referencia nada do cadastro free', () => {
    expect(definirSenha).not.toMatch(/isFreeSignupSession/);
    expect(definirSenha).not.toMatch(/isSignupSessionEligible/);
    expect(definirSenha).not.toMatch(/free_signup/);
    // Invariantes do fluxo pago seguem intactos (também cobertos em create-password.test.ts):
    expect(definirSenha).toMatch(/establishPaidSignupSession/);
    expect(definirSenha).toMatch(/client\.auth\.updateUser\(\{ password \}\)/);
    expect(definirSenha).toMatch(/router\.replace\(['"]\/onboarding['"]\)/);
  });
});
