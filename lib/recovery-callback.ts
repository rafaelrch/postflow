import { createBrowserClient } from '@supabase/ssr';
import {
  createClient as createSupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';

/**
 * Aterrissagem do link de RECUPERAÇÃO DE SENHA (#access_token&type=recovery).
 *
 * ⚠️ POR QUE ISTO EXISTE, e por que uma rota protegida não resolveria: o
 * Supabase devolve a sessão no FRAGMENTO da URL, e fragmento NUNCA é enviado ao
 * servidor. Uma rota que decidisse no middleware olharia um pedido sem sessão
 * nenhuma — antes de qualquer JS ler o fragmento — e mandaria a pessoa para o
 * login, com o link do e-mail já queimado. Já nos mordeu uma vez.
 *
 * MESMO PADRÃO de lib/paid-signup-callback.ts, MÓDULO SEPARADO de propósito:
 * aquele é do cadastro pago e exige `type=signup` mais os marcadores de
 * assinatura paga (isPaidPasswordlessSession, app_metadata.password_set).
 * Misturar os dois faria um fluxo aceitar o token do outro — que é exatamente
 * o tipo de confusão que vira bug de autenticação. Aqui só existe uma regra:
 * `type=recovery`, e nada além disso.
 */

type RecoveryTokens = {
  access_token: string;
  refresh_token: string;
};

type RecoveryUser = {
  id: string;
  email?: string | null;
};

type AuthResult<T> = PromiseLike<{ data: T; error: unknown | null }>;

export type RecoveryClient = {
  auth: {
    setSession(tokens: RecoveryTokens): AuthResult<{ session: RecoveryTokens | null }>;
    getUser(): AuthResult<{ user: RecoveryUser | null }>;
    updateUser(attributes: { password: string }): PromiseLike<{ error: unknown | null }>;
  };
};

type BridgeClientOptions = {
  auth: {
    autoRefreshToken: false;
    detectSessionInUrl: false;
    flowType: 'implicit';
    persistSession: false;
    storageKey: 'password-recovery-implicit-bridge';
  };
};

type SsrClientOptions = { isSingleton: false };

export type RecoveryRuntime = {
  anonKey?: string;
  clearHash: () => void;
  createBridgeClient?: (url: string, key: string, options: BridgeClientOptions) => RecoveryClient;
  createSsrClient?: (url: string, key: string, options: SsrClientOptions) => RecoveryClient;
  supabaseUrl?: string;
};

export type RecoverySessionResult = {
  client: RecoveryClient;
  user: RecoveryUser;
};

const bridgeOptions: BridgeClientOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: 'implicit',
    persistSession: false,
    storageKey: 'password-recovery-implicit-bridge',
  },
};

const ssrOptions: SsrClientOptions = { isSingleton: false };

const defaultCreateBridgeClient = (
  url: string,
  key: string,
  options: BridgeClientOptions,
): RecoveryClient => createSupabaseClient(url, key, options satisfies SupabaseClientOptions<'public'>);

const defaultCreateSsrClient = (
  url: string,
  key: string,
  options: SsrClientOptions,
): RecoveryClient => createBrowserClient(url, key, options);

/**
 * Aceita UM par completo de tokens de recuperação vindo do fragmento.
 *
 * Recusa `type` diferente de 'recovery' (um token de signup não redefine senha
 * aqui), recusa fragmento com `error*` — o Supabase manda o link expirado
 * assim, e tratar isso como sucesso deixaria a tela pedindo senha nova que
 * nunca seria gravada — e recusa valor repetido: `#access_token=bom&
 * access_token=ruim` é tentativa de confundir quem lê só o primeiro.
 */
export function readRecoveryTokens(hash: string): RecoveryTokens | null {
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
    || types[0] !== 'recovery'
    || accessTokens.length !== 1
    || !accessTokens[0]
    || refreshTokens.length !== 1
    || !refreshTokens[0]
  ) {
    return null;
  }

  return { access_token: accessTokens[0], refresh_token: refreshTokens[0] };
}

/**
 * Valida o callback num cliente em memória e só então move a MESMA sessão para
 * o cliente com cookie. A ordem importa: gravar cookie antes de saber se o
 * token presta deixaria meia sessão em navegador de quem clicou num link
 * quebrado.
 *
 * Limpa o fragmento assim que ele deixa de ser necessário — token de acesso não
 * precisa continuar na barra de endereços, no histórico e no que o usuário
 * eventualmente copiar e colar.
 */
export async function establishRecoverySession(
  hash: string,
  runtime: RecoveryRuntime,
): Promise<RecoverySessionResult | null> {
  const tokens = readRecoveryTokens(hash);
  if (!tokens) return null;

  const supabaseUrl = runtime.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = runtime.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const createBridgeClient = runtime.createBridgeClient ?? defaultCreateBridgeClient;
  const createSsrClient = runtime.createSsrClient ?? defaultCreateSsrClient;

  try {
    const bridge = createBridgeClient(supabaseUrl, anonKey, bridgeOptions);
    const { data: bridgeSessionData, error: bridgeSessionError } = await bridge.auth.setSession(tokens);
    const bridgeSession = bridgeSessionData.session;
    if (bridgeSessionError || !bridgeSession?.access_token || !bridgeSession.refresh_token) return null;

    const { data: bridgeUserData, error: bridgeUserError } = await bridge.auth.getUser();
    const bridgeUser = bridgeUserData.user;
    if (bridgeUserError || !bridgeUser?.id) return null;

    runtime.clearHash();

    const ssr = createSsrClient(supabaseUrl, anonKey, ssrOptions);
    const { data: ssrSessionData, error: ssrSessionError } = await ssr.auth.setSession({
      access_token: bridgeSession.access_token,
      refresh_token: bridgeSession.refresh_token,
    });
    if (ssrSessionError || !ssrSessionData.session) return null;

    const { data: ssrUserData, error: ssrUserError } = await ssr.auth.getUser();
    const ssrUser = ssrUserData.user;
    // Mesma pessoa dos dois lados: divergência aqui significa sessão de outro
    // usuário já presente no navegador, e trocar a senha dela seria desastre.
    if (ssrUserError || !ssrUser?.id || ssrUser.id !== bridgeUser.id) return null;

    return { client: ssr, user: ssrUser };
  } catch {
    return null;
  }
}
