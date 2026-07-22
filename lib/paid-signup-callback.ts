import { createBrowserClient } from '@supabase/ssr';
import {
  createClient as createSupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';
import { isPaidPasswordlessSession } from '@/lib/paid-password-session';

type SignupSessionTokens = {
  access_token: string;
  refresh_token: string;
};

type PaidSignupUser = {
  id: string;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

type AuthResult<T> = PromiseLike<{
  data: T;
  error: unknown | null;
}>;

export type PaidSignupClient = {
  auth: {
    setSession(tokens: SignupSessionTokens): AuthResult<{ session: SignupSessionTokens | null }>;
    getUser(): AuthResult<{ user: PaidSignupUser | null }>;
    updateUser(attributes: { password: string }): PromiseLike<{ error: unknown | null }>;
  };
};

type BridgeClientOptions = {
  auth: {
    autoRefreshToken: false;
    detectSessionInUrl: false;
    flowType: 'implicit';
    persistSession: false;
    storageKey: 'paid-signup-implicit-bridge';
  };
};

type SsrClientOptions = {
  isSingleton: false;
};

type PaidSignupRuntime = {
  anonKey?: string;
  clearHash: () => void;
  createBridgeClient?: (
    url: string,
    key: string,
    options: BridgeClientOptions,
  ) => PaidSignupClient;
  createSsrClient?: (
    url: string,
    key: string,
    options: SsrClientOptions,
  ) => PaidSignupClient;
  supabaseUrl?: string;
};

export type PaidSignupSessionResult = {
  client: PaidSignupClient;
  user: PaidSignupUser;
};

const bridgeOptions: BridgeClientOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: 'implicit',
    persistSession: false,
    storageKey: 'paid-signup-implicit-bridge',
  },
};

const ssrOptions: SsrClientOptions = { isSingleton: false };

const defaultCreateBridgeClient = (
  url: string,
  key: string,
  options: BridgeClientOptions,
): PaidSignupClient => createSupabaseClient(
  url,
  key,
  options satisfies SupabaseClientOptions<'public'>,
);

const defaultCreateSsrClient = (
  url: string,
  key: string,
  options: SsrClientOptions,
): PaidSignupClient => createBrowserClient(url, key, options);

/** Accept only one complete implicit signup token pair from the URL fragment. */
export function readPaidSignupTokens(hash: string): SignupSessionTokens | null {
  if (!hash.startsWith('#')) return null;

  const params = new URLSearchParams(hash.slice(1));
  const types = params.getAll('type');
  const accessTokens = params.getAll('access_token');
  const refreshTokens = params.getAll('refresh_token');

  if (
    params.has('error')
    || params.has('error_code')
    || params.has('error_description')
    || types.length !== 1
    || types[0] !== 'signup'
    || accessTokens.length !== 1
    || !accessTokens[0]
    || refreshTokens.length !== 1
    || !refreshTokens[0]
  ) {
    return null;
  }

  return {
    access_token: accessTokens[0],
    refresh_token: refreshTokens[0],
  };
}

/**
 * Validates the implicit callback in an isolated in-memory client, then moves
 * that exact session into an isolated cookie-backed SSR browser client.
 */
export async function establishPaidSignupSession(
  hash: string,
  runtime: PaidSignupRuntime,
): Promise<PaidSignupSessionResult | null> {
  const callbackTokens = readPaidSignupTokens(hash);
  if (!callbackTokens) return null;

  const supabaseUrl = runtime.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = runtime.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const createBridgeClient = runtime.createBridgeClient ?? defaultCreateBridgeClient;
  const createSsrClient = runtime.createSsrClient ?? defaultCreateSsrClient;

  try {
    const bridge = createBridgeClient(supabaseUrl, anonKey, bridgeOptions);
    const { data: bridgeSessionData, error: bridgeSessionError } = await bridge.auth.setSession(callbackTokens);
    const bridgeSession = bridgeSessionData.session;
    if (bridgeSessionError || !bridgeSession?.access_token || !bridgeSession.refresh_token) return null;

    const { data: bridgeUserData, error: bridgeUserError } = await bridge.auth.getUser();
    const bridgeUser = bridgeUserData.user;
    if (bridgeUserError || !bridgeUser || !isPaidPasswordlessSession({ user: bridgeUser })) return null;

    runtime.clearHash();

    const ssr = createSsrClient(supabaseUrl, anonKey, ssrOptions);
    const transferredSession = {
      access_token: bridgeSession.access_token,
      refresh_token: bridgeSession.refresh_token,
    };
    const { data: ssrSessionData, error: ssrSessionError } = await ssr.auth.setSession(transferredSession);
    if (ssrSessionError || !ssrSessionData.session) return null;

    const { data: ssrUserData, error: ssrUserError } = await ssr.auth.getUser();
    const ssrUser = ssrUserData.user;
    if (
      ssrUserError
      || !isPaidPasswordlessSession({ user: ssrUser })
      || bridgeUser.id !== ssrUser?.id
    ) {
      return null;
    }

    return { client: ssr, user: ssrUser };
  } catch {
    return null;
  }
}
