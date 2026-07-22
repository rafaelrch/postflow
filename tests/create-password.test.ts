import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const authForm = readFileSync(new URL('../components/auth/AuthForm.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/(auth)/definir-senha/page.tsx', import.meta.url), 'utf8');

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
