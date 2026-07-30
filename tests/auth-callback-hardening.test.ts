import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeNextPath } from '../lib/safe-next-path';

/**
 * C2 — open redirect no `?next=` do /auth/callback (os 4 vetores testados na
 * produção atual) — e C2b — code inválido que fingia sucesso.
 */

const ORIGIN = 'https://app.creatools.com';

const { mockExchange } = vi.hoisted(() => ({ mockExchange: vi.fn() }));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { exchangeCodeForSession: mockExchange },
  }),
}));

async function callback(query: string) {
  vi.resetModules();
  const { GET } = await import('../app/auth/callback/route');
  const request = new Request(`${ORIGIN}/auth/callback${query}`);
  return GET(request as never);
}

function location(response: Response) {
  return response.headers.get('location');
}

beforeEach(() => {
  mockExchange.mockResolvedValue({ data: { session: {} }, error: null });
});

afterEach(() => vi.clearAllMocks());

describe('C2 — safeNextPath valida a SAÍDA, não a string de entrada', () => {
  it('rejeita `//evil.com` (protocol-relative sai do domínio)', () => {
    expect(new URL('//evil.com', ORIGIN).origin).toBe('https://evil.com');
    expect(safeNextPath('//evil.com', ORIGIN)).toBe('/dashboard');
  });

  it('rejeita `https://evil.com` (absoluto de outra origin)', () => {
    expect(safeNextPath('https://evil.com', ORIGIN)).toBe('/dashboard');
  });

  it('rejeita `\\\\evil.com` (backslash que o parser WHATWG trata como barra)', () => {
    expect(new URL('\\\\evil.com', ORIGIN).origin).toBe('https://evil.com');
    expect(safeNextPath('\\\\evil.com', ORIGIN)).toBe('/dashboard');
  });

  it('rejeita `/..//evil.com` (same-origin, mas o pathname normaliza para `//evil.com`)', () => {
    const resolved = new URL('/..//evil.com', ORIGIN);
    expect(resolved.origin).toBe(ORIGIN);
    expect(resolved.pathname).toBe('//evil.com');
    expect(safeNextPath('/..//evil.com', ORIGIN)).toBe('/dashboard');
  });

  it('rejeita variações da mesma família sem depender de blacklist', () => {
    expect(safeNextPath('///evil.com', ORIGIN)).toBe('/dashboard');
    expect(safeNextPath('/\\evil.com', ORIGIN)).toBe('/dashboard');
    expect(safeNextPath('http://evil.com', ORIGIN)).toBe('/dashboard');
    expect(safeNextPath('javascript:alert(1)', ORIGIN)).toBe('/dashboard');
    expect(safeNextPath('https://app.creatools.com.evil.com/x', ORIGIN)).toBe('/dashboard');
    expect(safeNextPath(null, ORIGIN)).toBe('/dashboard');
    expect(safeNextPath('', ORIGIN)).toBe('/dashboard');
  });

  it('preserva os caminhos internos legítimos, com query e hash', () => {
    expect(safeNextPath('/dashboard', ORIGIN)).toBe('/dashboard');
    expect(safeNextPath('/conta', ORIGIN)).toBe('/conta');
    expect(safeNextPath('/conta?tab=plano', ORIGIN)).toBe('/conta?tab=plano');
    expect(safeNextPath('/dashboard#secao', ORIGIN)).toBe('/dashboard#secao');
    expect(safeNextPath(`${ORIGIN}/conta`, ORIGIN)).toBe('/conta');
  });
});

describe('C2 — a rota /auth/callback aplica a sanitização', () => {
  it.each([
    ['//evil.com', 'protocol-relative'],
    ['https://evil.com', 'absoluto externo'],
    ['\\\\evil.com', 'backslash'],
    ['/..//evil.com', 'path que normaliza para //'],
  ])('não redireciona para fora do domínio com next=%s (%s)', async (next) => {
    const response = await callback(`?code=valido&next=${encodeURIComponent(next)}`);
    expect(location(response)).toBe(`${ORIGIN}/dashboard`);
  });

  it('mantém o destino interno legítimo', async () => {
    const response = await callback(`?code=valido&next=${encodeURIComponent('/conta?tab=plano')}`);
    expect(location(response)).toBe(`${ORIGIN}/conta?tab=plano`);
  });
});

describe('C2b — code inválido não finge sucesso', () => {
  it('manda para /login?authError=invalid_code quando a troca falha', async () => {
    mockExchange.mockResolvedValue({ data: { session: null }, error: { message: 'invalid flow state' } });
    const response = await callback('?code=expirado');
    expect(location(response)).toBe(`${ORIGIN}/login?authError=invalid_code`);
  });

  it('não deixa o erro herdar o next (não leva o erro pra rota protegida)', async () => {
    mockExchange.mockResolvedValue({ data: { session: null }, error: { message: 'invalid flow state' } });
    const response = await callback('?code=expirado&next=%2Fconta');
    const target = new URL(location(response)!);
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('authError')).toBe('invalid_code');
  });

  it('segue para o destino quando a troca dá certo', async () => {
    const response = await callback('?code=valido&next=%2Fconta');
    expect(mockExchange).toHaveBeenCalledWith('valido');
    expect(location(response)).toBe(`${ORIGIN}/conta`);
  });
});
