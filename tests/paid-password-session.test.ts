import { describe, expect, it } from 'vitest';
import { isPaidPasswordlessSession } from '../lib/paid-password-session';

describe('paid passwordless session proof', () => {
  it('accepts only a confirmed user carrying the server-set paid marker', () => {
    expect(isPaidPasswordlessSession({ user: { email_confirmed_at: '2026-07-22T12:00:00Z', app_metadata: { origin: 'paid_passwordless' } } })).toBe(true);
  });

  it('rejects a confirmed session that did not come from paid_passwordless', () => {
    expect(isPaidPasswordlessSession({ user: { email_confirmed_at: '2026-07-22T12:00:00Z', app_metadata: {} } })).toBe(false);
    expect(isPaidPasswordlessSession({ user: { email_confirmed_at: '2026-07-22T12:00:00Z' } })).toBe(false);
    expect(isPaidPasswordlessSession(null)).toBe(false);
  });
});
