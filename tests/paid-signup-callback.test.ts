import { describe, expect, it, vi } from 'vitest';
import {
  establishPaidSignupSession,
  readPaidSignupTokens,
  type PaidSignupClient,
} from '../lib/paid-signup-callback';

const callbackHash = '#access_token=access-1&expires_in=3600&refresh_token=refresh-1&token_type=bearer&type=signup';
const session = { access_token: 'access-1', refresh_token: 'refresh-1' };
const paidUser = {
  id: 'paid-user-id',
  email_confirmed_at: '2026-07-22T15:00:00Z',
  app_metadata: { origin: 'paid_passwordless' },
};

function authClient(overrides: Partial<PaidSignupClient['auth']>): PaidSignupClient {
  return {
    auth: {
      setSession: vi.fn(async () => ({ data: { session: null }, error: new Error('not configured') })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('not configured') })),
      updateUser: vi.fn(async () => ({ error: null })),
      ...overrides,
    },
  };
}

function runtime(overrides: Record<string, unknown> = {}) {
  return {
    supabaseUrl: 'https://project.supabase.co',
    anonKey: 'anon-key',
    clearHash: vi.fn(),
    createBridgeClient: vi.fn(),
    createSsrClient: vi.fn(),
    ...overrides,
  };
}

describe('paid signup callback bridge', () => {
  it('strictly accepts one signup access/refresh pair', () => {
    expect(readPaidSignupTokens(callbackHash)).toEqual(session);
    expect(readPaidSignupTokens('')).toBeNull();
    expect(readPaidSignupTokens('?access_token=a&refresh_token=r&type=signup')).toBeNull();
    expect(readPaidSignupTokens('#access_token=a&refresh_token=r&type=recovery')).toBeNull();
    expect(readPaidSignupTokens('#access_token=a&type=signup')).toBeNull();
    expect(readPaidSignupTokens('#access_token=a&access_token=b&refresh_token=r&type=signup')).toBeNull();
    expect(readPaidSignupTokens('#error=access_denied&error_code=otp_expired&type=signup')).toBeNull();
  });

  it('isolates both clients and enforces the complete validation order', async () => {
    const order: string[] = [];
    const bridge = authClient({
      setSession: vi.fn(async (tokens) => {
        order.push('bridge.setSession');
        expect(tokens).toEqual(session);
        return { data: { session }, error: null };
      }),
      getUser: vi.fn(async () => {
        order.push('bridge.getUser');
        return { data: { user: paidUser }, error: null };
      }),
    });
    const ssr = authClient({
      setSession: vi.fn(async (tokens) => {
        order.push('ssr.setSession');
        expect(tokens).toEqual(session);
        return { data: { session }, error: null };
      }),
      getUser: vi.fn(async () => {
        order.push('ssr.getUser');
        return { data: { user: paidUser }, error: null };
      }),
    });
    const clearHash = vi.fn(() => order.push('replaceState'));
    const createBridgeClient = vi.fn((_url, _key, options) => {
      order.push('createBridge');
      expect(options).toEqual({
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: 'implicit',
          persistSession: false,
          storageKey: 'paid-signup-implicit-bridge',
        },
      });
      return bridge;
    });
    const createSsrClient = vi.fn((_url, _key, options) => {
      order.push('createSsr');
      expect(options).toEqual({ isSingleton: false });
      return ssr;
    });

    const result = await establishPaidSignupSession(callbackHash, runtime({
      clearHash,
      createBridgeClient,
      createSsrClient,
    }));

    expect(order).toEqual([
      'createBridge',
      'bridge.setSession',
      'bridge.getUser',
      'replaceState',
      'createSsr',
      'ssr.setSession',
      'ssr.getUser',
    ]);
    expect(result).toEqual({ client: ssr, user: paidUser });
    expect(createSsrClient).toHaveBeenCalledOnce();
  });

  it('fails closed on malformed or replay/error callbacks without creating any client', async () => {
    for (const hash of [
      '#access_token=only&type=signup',
      '#error=access_denied&error_code=otp_expired&type=signup',
    ]) {
      const deps = runtime();
      expect(await establishPaidSignupSession(hash, deps)).toBeNull();
      expect(deps.clearHash).not.toHaveBeenCalled();
      expect(deps.createBridgeClient).not.toHaveBeenCalled();
      expect(deps.createSsrClient).not.toHaveBeenCalled();
    }
  });

  it('keeps the hash and never falls back when bridge validation fails', async () => {
    const bridge = authClient({
      setSession: vi.fn(async () => ({ data: { session: null }, error: new Error('replayed token') })),
      getUser: vi.fn(),
    });
    const deps = runtime({ createBridgeClient: vi.fn(() => bridge) });

    expect(await establishPaidSignupSession(callbackHash, deps)).toBeNull();
    expect(bridge.auth.getUser).not.toHaveBeenCalled();
    expect(deps.clearHash).not.toHaveBeenCalled();
    expect(deps.createSsrClient).not.toHaveBeenCalled();
    expect(bridge.auth.updateUser).not.toHaveBeenCalled();
  });

  it('keeps the hash when the bridge user cannot be validated remotely', async () => {
    const bridge = authClient({
      setSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('auth unavailable') })),
    });
    const deps = runtime({ createBridgeClient: vi.fn(() => bridge) });

    expect(await establishPaidSignupSession(callbackHash, deps)).toBeNull();
    expect(deps.clearHash).not.toHaveBeenCalled();
    expect(deps.createSsrClient).not.toHaveBeenCalled();
  });

  it('rejects a confirmed bridge user without the paid marker and keeps the hash', async () => {
    const bridge = authClient({
      setSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({
        data: { user: { ...paidUser, app_metadata: {} } },
        error: null,
      })),
    });
    const deps = runtime({ createBridgeClient: vi.fn(() => bridge) });

    expect(await establishPaidSignupSession(callbackHash, deps)).toBeNull();
    expect(deps.clearHash).not.toHaveBeenCalled();
    expect(deps.createSsrClient).not.toHaveBeenCalled();
  });

  it('does not accept an old cookie session when transfer fails', async () => {
    const bridge = authClient({
      setSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: paidUser }, error: null })),
    });
    const oldCookieUser = { ...paidUser, id: 'old-cookie-user' };
    const ssr = authClient({
      setSession: vi.fn(async () => ({ data: { session: null }, error: new Error('invalid callback session') })),
      getUser: vi.fn(async () => ({ data: { user: oldCookieUser }, error: null })),
    });
    const deps = runtime({
      createBridgeClient: vi.fn(() => bridge),
      createSsrClient: vi.fn(() => ssr),
    });

    expect(await establishPaidSignupSession(callbackHash, deps)).toBeNull();
    expect(ssr.auth.getUser).not.toHaveBeenCalled();
    expect(ssr.auth.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a different or unmarked user returned by the SSR client', async () => {
    const bridge = authClient({
      setSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: paidUser }, error: null })),
    });

    for (const ssrUser of [
      { ...paidUser, id: 'different-user' },
      { ...paidUser, app_metadata: {} },
    ]) {
      const ssr = authClient({
        setSession: vi.fn(async () => ({ data: { session }, error: null })),
        getUser: vi.fn(async () => ({ data: { user: ssrUser }, error: null })),
      });
      const deps = runtime({
        createBridgeClient: vi.fn(() => bridge),
        createSsrClient: vi.fn(() => ssr),
      });

      expect(await establishPaidSignupSession(callbackHash, deps)).toBeNull();
      expect(ssr.auth.updateUser).not.toHaveBeenCalled();
    }
  });
});
