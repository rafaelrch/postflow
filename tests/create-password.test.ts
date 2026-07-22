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

  it('creates a password only for the confirmed Supabase session', () => {
    expect(page).toMatch(/getUser/);
    expect(page).toMatch(/isPaidPasswordlessSession/);
    expect(page).toMatch(/email_confirmed_at/);
    expect(page).toMatch(/updateUser\(\{ password \}\)/);
    expect(page).toMatch(/router\.replace\(['"]\/onboarding['"]\)/);
  });
});
