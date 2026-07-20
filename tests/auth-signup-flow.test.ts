import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobertura do caminho feliz do fluxo cadastro → confirmação de e-mail →
 * callback → área logada, na parte que roda no servidor.
 *
 * O fluxo completo tem 4 etapas:
 *   1. POST /api/auth/verify-signup  (prova de pagamento) → tests/verify-signup.test.ts
 *   2. supabase.auth.signUp()        (client, AuthForm) → dispara e-mail de confirmação
 *   3. GET /auth/callback?code=...   (troca o code por sessão) → COBERTO AQUI
 *   4. gate de onboarding_completed  (redirect p/ /onboarding) → ver nota no fim do arquivo
 */

const { mockExchangeCodeForSession, mockGetSession } = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getSession: mockGetSession },
  }),
}));

import { NextRequest } from 'next/server';
import { GET } from '../app/auth/callback/route';
import { proxy } from '../proxy';

const SESSION = { user: { id: 'user-novo-123', email: 'novo@example.com' } };

beforeEach(() => {
  mockExchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

function callbackRequest(url: string) {
  return { url } as unknown as Parameters<typeof GET>[0];
}

describe('GET /auth/callback — confirmação de e-mail vira sessão', () => {
  it('troca o code do link de confirmação por uma sessão e manda pro /dashboard', async () => {
    const res = await GET(callbackRequest('https://app.creatools.com.br/auth/callback?code=pkce_code_valido'));

    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('pkce_code_valido');
    expect(res.headers.get('location')).toBe('https://app.creatools.com.br/dashboard');
  });

  it('respeita o destino do parâmetro next (ex.: usuário veio de uma rota protegida)', async () => {
    const res = await GET(
      callbackRequest('https://app.creatools.com.br/auth/callback?code=pkce_code_valido&next=/onboarding')
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('pkce_code_valido');
    expect(res.headers.get('location')).toBe('https://app.creatools.com.br/onboarding');
  });

  it('manda pro /login com aviso quando o code é inválido/expirado, em vez de fingir sucesso', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'invalid request: both auth code and code verifier should be non-empty' },
    });

    const res = await GET(callbackRequest('https://app.creatools.com.br/auth/callback?code=pkce_expirado'));

    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('authError=invalid_code');
    // o ponto do fix: NÃO segue pro destino como se tivesse dado certo
    expect(location).not.toContain('/dashboard');
  });

  it('não leva o erro pro next: code ruim vai pro login, não pra rota protegida', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'code expired' },
    });

    const res = await GET(
      callbackRequest('https://app.creatools.com.br/auth/callback?code=ruim&next=/onboarding')
    );

    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).not.toContain('/onboarding');
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
  ])('não redireciona para fora do domínio via ?next=%s (open redirect)', async (vetor) => {
    const res = await GET(
      callbackRequest(
        `https://app.creatools.com.br/auth/callback?code=ok&next=${encodeURIComponent(vetor)}`,
      ),
    );

    const location = res.headers.get('location') ?? '';
    expect(location).not.toContain('evil.com');
    expect(new URL(location).host).toBe('app.creatools.com.br');
    expect(location).toBe('https://app.creatools.com.br/dashboard');
  });

  it('não tenta trocar sessão quando o link vem sem code', async () => {
    const res = await GET(callbackRequest('https://app.creatools.com.br/auth/callback'));

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://app.creatools.com.br/dashboard');
  });
});

describe('proxy — gate de rota logada depois do callback', () => {
  it('deixa passar o usuário com sessão na rota de onboarding', async () => {
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });

    const res = await proxy(new NextRequest('https://app.creatools.com.br/onboarding'));

    // NextResponse.next() — sem redirect: o gate de onboarding_completed é
    // decidido depois, no cliente (AuthProvider).
    expect(res.headers.get('location')).toBeNull();
  });

  it('manda pro /login quem cai numa rota protegida sem sessão (code inválido/expirado)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const res = await proxy(new NextRequest('https://app.creatools.com.br/dashboard'));

    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('next=%2Fdashboard');
  });

  it('tira da tela de cadastro quem já confirmou o e-mail e tem sessão', async () => {
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });

    const res = await proxy(new NextRequest('https://app.creatools.com.br/cadastro'));

    expect(res.headers.get('location')).toBe('https://app.creatools.com.br/dashboard');
  });
});

/**
 * NÃO COBERTO AQUI — etapa 4 (redirect condicionado a onboarding_completed).
 *
 * Essa decisão vive em components/AuthProvider.tsx, um client component que lê
 * profiles.onboarding_completed e chama router.replace('/onboarding'). Testar
 * isso exige renderizar React em DOM (jsdom/happy-dom + @testing-library/react),
 * nenhum deles instalado neste projeto — a suíte atual é 100% node/rotas.
 *
 * Adicionar essas devDependencies é decisão do Orquestrador, não deste teste.
 */
