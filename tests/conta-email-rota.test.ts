import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decideEmailChange,
  isEmailTakenError,
  isSendRateLimitError,
  normalizeEmail,
} from '../lib/account-email-change';

/**
 * TROCA DE E-MAIL DA CONTA — regra pura + rota.
 *
 * O que estes testes existem para impedir, em ordem de gravidade:
 *
 *   1. o e-mail mudar SEM confirmação (tomada de conta);
 *   2. alguém escrever `auth.users.email` com service_role por atalho;
 *   3. a rota virar oráculo de cadastro ("este e-mail tem conta?");
 *   4. a troca respingar em `subscriptions`, que é o e-mail de quem PAGOU.
 */

const { mockGetUser, mockUpdateUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser },
  }),
}));

function pedido(body: unknown) {
  return {
    json: async () => {
      if (body === undefined) throw new Error('corpo ilegível');
      return body;
    },
  } as never;
}

async function POST(body: unknown) {
  const { POST: handler } = await import('../app/api/conta/email/route');
  return handler(pedido(body));
}

beforeEach(async () => {
  vi.resetModules();
  (await import('../lib/rate-limit')).__resetRateLimit();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'cliente@example.com', new_email: null } },
  });
  mockUpdateUser.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('normalizeEmail', () => {
  it('normaliza trim + lowercase', () => {
    expect(normalizeEmail('  Novo@Example.COM ')).toBe('novo@example.com');
  });

  it('recusa lixo, vazio e não-string', () => {
    for (const entrada of ['', '   ', 'sem-arroba', 'a@b', 'a@b.c', 'a b@c.com', null, 42, {}]) {
      expect(normalizeEmail(entrada)).toBeNull();
    }
  });

  it('recusa endereço absurdamente longo', () => {
    expect(normalizeEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('decideEmailChange', () => {
  const atual = 'cliente@example.com';

  it('endereço novo → troca', () => {
    expect(decideEmailChange({ currentEmail: atual, pendingEmail: null, requested: 'novo@x.com' }))
      .toEqual({ kind: 'change', email: 'novo@x.com' });
  });

  it('o próprio e-mail da conta (em qualquer caixa) → nada a fazer', () => {
    expect(decideEmailChange({ currentEmail: atual, pendingEmail: null, requested: ' CLIENTE@Example.com ' }))
      .toEqual({ kind: 'same_as_current' });
  });

  it('repetir o pendente é REENVIO, não erro — é o caso "não recebi"', () => {
    expect(decideEmailChange({ currentEmail: atual, pendingEmail: 'novo@x.com', requested: 'Novo@X.com' }))
      .toEqual({ kind: 'resend', email: 'novo@x.com' });
  });

  it('endereço inválido não chega ao Supabase', () => {
    expect(decideEmailChange({ currentEmail: atual, pendingEmail: null, requested: 'xxx' }))
      .toEqual({ kind: 'invalid' });
  });
});

describe('classificação de erro do provedor', () => {
  it('reconhece e-mail já usado por code e por mensagem', () => {
    expect(isEmailTakenError({ code: 'email_exists' })).toBe(true);
    expect(isEmailTakenError({ code: 'user_already_exists' })).toBe(true);
    expect(isEmailTakenError({ message: 'A user with this email address has already been registered' })).toBe(true);
    expect(isEmailTakenError({ code: 'weak_password' })).toBe(false);
    expect(isEmailTakenError(null)).toBe(false);
  });

  it('reconhece o teto de envio do próprio Supabase', () => {
    expect(isSendRateLimitError({ code: 'over_email_send_rate_limit' })).toBe(true);
    expect(isSendRateLimitError({ status: 429 })).toBe(true);
    expect(isSendRateLimitError({ status: 500 })).toBe(false);
  });
});

describe('POST /api/conta/email', () => {
  it('sem sessão → 401 e nenhuma chamada ao Auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST({ email: 'novo@x.com' });
    expect(res.status).toBe(401);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('pedido aceito → 202 "pendente", e a troca NÃO aconteceu ainda', async () => {
    const res = await POST({ email: ' Novo@Example.com ' });
    const body = await res.json();

    // 202 e não 200: o pedido foi aceito; o e-mail muda na confirmação.
    expect(res.status).toBe(202);
    expect(body).toEqual({ pendingEmail: 'novo@example.com', resent: false });
    // updateUser({ email }) é o fluxo NATIVO com confirmação. Só o e-mail vai
    // no payload: nada de password, nada de metadata.
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'novo@example.com' });
  });

  it('usa a SESSÃO do usuário — nunca o client de service_role', async () => {
    const rota = await import('../app/api/conta/email/route');
    expect(rota).toBeTruthy();
    const fonte = (await import('node:fs')).readFileSync('app/api/conta/email/route.ts', 'utf8');
    // O trinco: um write de service_role em auth.users trocaria a identidade
    // da conta sem prova nenhuma de posse da caixa nova.
    expect(fonte).not.toContain('createAdminSupabaseClient');
    expect(fonte).not.toContain('supabase-admin');
    expect(fonte).not.toContain('SERVICE_ROLE');
    expect(fonte).not.toContain('updateUserById');
    expect(fonte).toContain('createServerSupabaseClient');
  });

  it('não escreve em subscriptions nem em nenhuma tabela', async () => {
    const fonte = (await import('node:fs')).readFileSync('app/api/conta/email/route.ts', 'utf8');
    expect(fonte).not.toContain("from('subscriptions')");
    expect(fonte).not.toMatch(/\.from\(/);
  });

  it('não derruba a sessão: pedir a troca não desloga ninguém', async () => {
    const fonte = (await import('node:fs')).readFileSync('app/api/conta/email/route.ts', 'utf8');
    expect(fonte).not.toContain('signOut');
    // E o pedido aceito não devolve nada que peça novo login na tela.
    const res = await POST({ email: 'novo@x.com' });
    expect(res.status).toBe(202);
    expect(JSON.stringify(await res.json())).not.toMatch(/logout|signout|reautenticar/i);
  });

  it('repetir o pendente reenvia a confirmação', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'cliente@example.com', new_email: 'novo@example.com' } },
    });
    const res = await POST({ email: 'novo@example.com' });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.resent).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'novo@example.com' });
  });

  it('o próprio e-mail da conta → 400, sem gastar envio', async () => {
    const res = await POST({ email: 'cliente@example.com' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('same_as_current');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('e-mail inválido → 400, sem gastar envio', async () => {
    const res = await POST({ email: 'nada' });
    expect(res.status).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('corpo ilegível não derruba a rota', async () => {
    const res = await POST(undefined);
    expect(res.status).toBe(400);
  });

  it('e-mail de outra conta → recusa SEM confirmar que a outra conta existe', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { code: 'email_exists', status: 422, message: 'already registered' } });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await POST({ email: 'alguem@example.com' });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('email_unavailable');
    // A mensagem não afirma existência de conta alheia — nem "já cadastrado",
    // nem "em uso", nem o endereço de volta.
    expect(body.error).not.toMatch(/cadastrad|já existe|em uso|outra conta/i);
    expect(JSON.stringify(body)).not.toContain('alguem@example.com');
    // E o log do servidor não carrega PII.
    expect(aviso.mock.calls.flat().join(' ')).not.toContain('alguem@example.com');
    aviso.mockRestore();
  });

  it('teto de envio do Supabase vira 429, não 500', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { code: 'over_email_send_rate_limit', status: 429 } });
    const res = await POST({ email: 'novo@x.com' });
    expect(res.status).toBe(429);
  });

  it('falha desconhecida do Auth vira 502 e não vaza o motivo', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { status: 500, message: 'boom interno' } });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST({ email: 'novo@x.com' });
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain('boom interno');
    erro.mockRestore();
  });

  it('rate limit por SESSÃO: a 6ª tentativa na janela é recusada', async () => {
    for (let i = 1; i <= 5; i += 1) {
      const res = await POST({ email: `novo${i}@example.com` });
      expect(res.status).toBe(202);
    }
    const bloqueado = await POST({ email: 'novo6@example.com' });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers.get('Retry-After')).toBeTruthy();
    // E o Auth não foi chamado de novo depois do bloqueio.
    expect(mockUpdateUser).toHaveBeenCalledTimes(5);
  });

  it('o rate limit de uma conta não bloqueia outra', async () => {
    for (let i = 1; i <= 5; i += 1) await POST({ email: `novo${i}@example.com` });

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u2', email: 'outro@example.com', new_email: null } },
    });
    const res = await POST({ email: 'destino@example.com' });
    expect(res.status).toBe(202);
  });
});
