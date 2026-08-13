import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const authForm = readFileSync(new URL('../components/auth/AuthForm.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/(auth)/definir-senha/page.tsx', import.meta.url), 'utf8');
const cadastro = readFileSync(new URL('../app/(auth)/cadastro/page.tsx', import.meta.url), 'utf8');

describe('link-to-create-password signup flow', () => {
  it('removes OTP UI and verification from signup', () => {
    expect(authForm).not.toMatch(/verifyOtp/);
    expect(authForm).not.toMatch(/Código OTP/);
    expect(authForm).toMatch(/Enviamos um e-mail de confirmação/);
  });

  it('updates the password only through the SSR client returned by the paid callback bridge', () => {
    expect(page).toMatch(/establishPaidSignupSession/);
    expect(page).toMatch(/passwordClientRef/);
    expect(page).toMatch(/const client = passwordClientRef\.current/);
    expect(page).toMatch(/client\.auth\.updateUser\(\{ password \}\)/);
    expect(page).not.toMatch(/createClient/);
    expect(page).toMatch(/router\.replace\(['"]\/onboarding['"]\)/);
  });
});

describe('a senha passou a nascer no cadastro', () => {
  it('o cadastro manda a senha junto do token', () => {
    expect(authForm).toMatch(/JSON\.stringify\(\{ token, password \}\)/);
    expect(authForm).toMatch(/passwordConfirm/);
    expect(authForm).toMatch(/As senhas não conferem/);
  });

  it('o e-mail do pagamento é exibido travado, sem input editável no cadastro', () => {
    // Campo editável seria mentira: a conta nasce no e-mail do pagamento
    // (row.email na rota), não no que a pessoa digitar.
    expect(authForm).toMatch(/Conta para o e-mail do pagamento/);
    expect(authForm).toMatch(/data-testid="signup-paid-email"/);
    // O <Field> de e-mail só sobra no login.
    expect(authForm).toMatch(/\) : \(\s*<Field icon=\{Mail\} label="E-mail"/);
  });

  it('/definir-senha vira fallback: com senha já definida, encaminha sem perguntar', () => {
    expect(page).toMatch(/app_metadata\?\.password_set === true/);
  });

  it('o aviso "chegar aqui não é prova de pagamento" mudou de casa junto com o successUrl', () => {
    // Morava na /assinatura/sucesso, que era a primeira tela depois do
    // checkout. Agora a primeira tela é o /cadastro, e o aviso vale para ela:
    // o Asaas redireciona ANTES de a cobrança ser confirmada.
    expect(cadastro).toMatch(/NÃO LIBERA NADA/);
    expect(cadastro).toMatch(/não é prova de pagamento/i);
    expect(cadastro).toMatch(/webhook/i);
  });
});
