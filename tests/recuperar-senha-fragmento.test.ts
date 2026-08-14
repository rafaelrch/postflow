/**
 * Redefinição de senha pelo link do e-mail.
 *
 * ⚠️ A MECÂNICA QUE JÁ MORDEU ESTE PROJETO UMA VEZ: o Supabase devolve a sessão
 * no FRAGMENTO da URL (#access_token…&type=recovery), e fragmento NUNCA é
 * enviado ao servidor. Uma tela protegida por sessão no servidor veria um
 * visitante anônimo, mandaria para o login — e o link do e-mail já teria sido
 * consumido. Por isso a leitura é toda no cliente, e é isso que os testes de
 * `establishRecoverySession` seguram.
 *
 * O outro ponto: este fluxo NÃO pode aceitar token do cadastro pago
 * (type=signup), e vice-versa. Fluxos de auth que aceitam o token um do outro é
 * como se troca a senha de quem não devia.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  establishRecoverySession,
  readRecoveryTokens,
  type RecoveryClient,
} from '../lib/recovery-callback';
import { readPaidSignupTokens } from '../lib/paid-signup-callback';

const HASH = '#access_token=access-1&expires_in=3600&refresh_token=refresh-1&token_type=bearer&type=recovery';
const session = { access_token: 'access-1', refresh_token: 'refresh-1' };
const user = { id: 'user-1', email: 'cliente@example.com' };

function authClient(overrides: Partial<RecoveryClient['auth']> = {}): RecoveryClient {
  return {
    auth: {
      setSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      ...overrides,
    },
  };
}

function runtime(bridge: RecoveryClient, ssr: RecoveryClient, overrides = {}) {
  return {
    supabaseUrl: 'https://projeto.supabase.co',
    anonKey: 'anon-key',
    clearHash: vi.fn(),
    createBridgeClient: () => bridge,
    createSsrClient: () => ssr,
    ...overrides,
  };
}

describe('leitura do fragmento', () => {
  it('aceita UM par completo de tokens de recuperação', () => {
    expect(readRecoveryTokens(HASH)).toEqual(session);
  });

  it('recusa tudo que não for exatamente isso', () => {
    // Sem '#': é query string, e query string chega ao servidor — outro fluxo.
    expect(readRecoveryTokens('?access_token=a&refresh_token=r&type=recovery')).toBeNull();
    expect(readRecoveryTokens('')).toBeNull();
    // Par incompleto.
    expect(readRecoveryTokens('#access_token=a&type=recovery')).toBeNull();
    // Token repetido: tentativa de confundir quem lê só o primeiro.
    expect(readRecoveryTokens('#access_token=a&access_token=b&refresh_token=r&type=recovery')).toBeNull();
    // Link expirado chega assim. Tratar como sucesso deixaria a tela pedindo
    // uma senha que nunca seria gravada.
    expect(readRecoveryTokens('#error=access_denied&error_code=otp_expired&type=recovery')).toBeNull();
  });

  it('os dois fluxos NÃO aceitam o token um do outro', () => {
    const hashSignup = '#access_token=a&refresh_token=r&type=signup';
    expect(readRecoveryTokens(hashSignup)).toBeNull();
    expect(readPaidSignupTokens(HASH)).toBeNull();
  });
});

describe('establishRecoverySession', () => {
  it('valida em cliente isolado ANTES de gravar cookie, e limpa o fragmento', async () => {
    const ordem: string[] = [];
    const bridge = authClient({
      setSession: vi.fn(async (t) => { ordem.push('bridge.setSession'); expect(t).toEqual(session); return { data: { session }, error: null }; }),
      getUser: vi.fn(async () => { ordem.push('bridge.getUser'); return { data: { user }, error: null }; }),
    });
    const ssr = authClient({
      setSession: vi.fn(async () => { ordem.push('ssr.setSession'); return { data: { session }, error: null }; }),
      getUser: vi.fn(async () => { ordem.push('ssr.getUser'); return { data: { user }, error: null }; }),
    });
    const rt = runtime(bridge, ssr);

    const resultado = await establishRecoverySession(HASH, rt);

    expect(resultado?.user).toEqual(user);
    expect(resultado?.client).toBe(ssr);
    // A validação inteira acontece antes de o cookie existir.
    expect(ordem).toEqual(['bridge.setSession', 'bridge.getUser', 'ssr.setSession', 'ssr.getUser']);
    // Token de acesso não fica na barra de endereços nem no histórico.
    expect(rt.clearHash).toHaveBeenCalled();
  });

  it('fragmento inválido não cria sessão nenhuma', async () => {
    const bridge = authClient();
    const ssr = authClient();
    expect(await establishRecoverySession('#error=access_denied&type=recovery', runtime(bridge, ssr))).toBeNull();
    expect(bridge.auth.setSession).not.toHaveBeenCalled();
    expect(ssr.auth.setSession).not.toHaveBeenCalled();
  });

  it('token recusado pelo Supabase não vira sessão', async () => {
    const bridge = authClient({
      setSession: vi.fn(async () => ({ data: { session: null }, error: new Error('invalid') })),
    });
    const ssr = authClient();
    expect(await establishRecoverySession(HASH, runtime(bridge, ssr))).toBeNull();
    expect(ssr.auth.setSession).not.toHaveBeenCalled();
  });

  it('usuário diferente entre os dois clientes aborta — trocaria a senha de outra pessoa', async () => {
    const bridge = authClient();
    const ssr = authClient({
      getUser: vi.fn(async () => ({ data: { user: { id: 'OUTRO', email: 'outro@example.com' } }, error: null })),
    });
    expect(await establishRecoverySession(HASH, runtime(bridge, ssr))).toBeNull();
  });
});

