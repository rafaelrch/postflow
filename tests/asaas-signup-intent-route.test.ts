import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimit } from '../lib/rate-limit';

/**
 * Os TRÊS estados do pagamento no início do cadastro.
 *
 * Este arquivo nasce de um bug de mensagem, não de portão: o gate sempre
 * funcionou (nenhuma conta indevida foi criada). O que estava errado é que os
 * três estados devolviam a MESMA resposta, e a UI dizia "ainda estamos
 * confirmando seu pagamento" para todos — mandando esperar por algo que, em
 * dois dos três casos, nunca ia acontecer.
 */

const LEAD_ID = '3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const ORIGIN = 'http://localhost:3000';

const {
  mockLimit,
  mockCheckoutRefs,
  mockRpc,
  mockCreateUser,
  mockUpdateUserById,
  mockGetSubscription,
  mockResend,
  mockCancelScheduledEmail,
} = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockCheckoutRefs: vi.fn(),
  mockRpc: vi.fn(),
  mockCreateUser: vi.fn(),
  mockUpdateUserById: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockResend: vi.fn(),
  mockCancelScheduledEmail: vi.fn(),
}));

// O CLIENTE do Resend é testado de verdade (contra fetch) em
// tests/asaas-webhook-route.test.ts. Aqui o que está sob teste é a LIGAÇÃO —
// "concluir o cadastro cancela o aviso agendado" —, então o módulo é mockado
// para não disputar o stub global de fetch com o endpoint admin do GoTrue.
vi.mock('../lib/resend', () => ({ cancelScheduledEmail: mockCancelScheduledEmail }));

// Relativo ao ARQUIVO DE TESTE — mesmo módulo que a rota importa como
// '../../../../lib/asaas/subscriptions'.
vi.mock('../lib/asaas/subscriptions', () => ({ getSubscription: mockGetSubscription }));

vi.mock('@/lib/app-url', () => ({
  appUrl: (path = '') => (path ? `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}` : ORIGIN),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { resend: mockResend } }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) =>
      table === 'payment_checkout_refs'
        ? // "este lead chegou a abrir um checkout?" — gravado ANTES de o
          // comprador ir para o Asaas. from().select().eq().limit()
          { select: () => ({ eq: () => ({ limit: mockCheckoutRefs }) }) }
        : { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: mockLimit }) }) }) }) },
    rpc: mockRpc,
    auth: { admin: { createUser: mockCreateUser, updateUserById: mockUpdateUserById } },
  }),
}));

import { POST } from '../app/api/asaas/signup-intent/route';
import { createSignupToken } from '../lib/signup-token';

const SENHA = 'senha-forte-123';

/**
 * Corpo COM senha = passo commit (cria conta e manda o e-mail); corpo SEM senha
 * = passo resolve (só descobre de quem é a conta).
 */
function intentRequest(
  token: string,
  origin: string | null = ORIGIN,
  body: Record<string, unknown> = { password: SENHA },
) {
  return {
    json: async () => ({ token, ...body }),
    headers: {
      get: (h: string) => {
        if (h === 'origin') return origin;
        if (h === 'x-forwarded-for') return '10.0.0.1';
        return null;
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

/** Linha de subscriptions como o banco devolve. */
function sub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    email: 'pagador@test.com',
    status: 'active',
    user_id: null,
    ...over,
  };
}

let token: string;
let segredoOriginal: string | undefined;

beforeEach(() => {
  __resetRateLimit();
  segredoOriginal = process.env.SIGNUP_TOKEN_SECRET;
  process.env.SIGNUP_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-16-chars';
  token = createSignupToken(LEAD_ID);

  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://projeto.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'consume_passwordless_rate' || fn === 'consume_rate_window') {
      return { data: true, error: null };
    }
    return { data: { state: 'pending' }, error: null };
  });
  mockLimit.mockResolvedValue({ data: [sub()], error: null });
  // Sem ref de checkout: o lead nunca abriu checkout nenhum.
  mockCheckoutRefs.mockResolvedValue({ data: [], error: null });
  mockGetSubscription.mockResolvedValue({ id: 'sub_1', status: 'ACTIVE' });
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockUpdateUserById.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockResend.mockResolvedValue({ error: null });
  mockCancelScheduledEmail.mockResolvedValue(true);

  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  // Busca do usuário existente (endpoint admin do GoTrue). Por padrão: ninguém.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ users: [] }) })),
  );
});

/** Resposta do GET /auth/v1/admin/users?filter=… com um usuário. */
function adminUsers(users: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ users }) })));
}

afterEach(() => {
  if (segredoOriginal === undefined) delete process.env.SIGNUP_TOKEN_SECRET;
  else process.env.SIGNUP_TOKEN_SECRET = segredoOriginal;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('POST /api/asaas/signup-intent — os três estados do pagamento', () => {
  it('(a) NENHUMA assinatura para este lead => 404 no_payment_found, NÃO "confirmando"', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'no_payment_found' });
    // Esperar não resolve: a UI não pode mandar tentar de novo.
    expect(res.status).not.toBe(202);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('(b) assinatura existe mas ainda NÃO está active => 202 payment_pending', async () => {
    mockLimit.mockResolvedValue({ data: [sub({ status: 'past_due' })], error: null });

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ pending: true, code: 'payment_pending' });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('(c) assinatura JÁ REIVINDICADA (user_id != null) => 409 account_exists', async () => {
    mockLimit.mockResolvedValue({ data: [sub({ user_id: 'user-1' })], error: null });

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'account_exists' });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('reivindicada NÃO cai em (a): a pessoa ficaria criando conta que já tem', async () => {
    mockLimit.mockResolvedValue({ data: [sub({ user_id: 'user-1' })], error: null });

    const res = await POST(intentRequest(token));
    expect((await res.json()).code).toBe('account_exists');
    expect(res.status).not.toBe(404);
  });

  it('reivindicada e INATIVA ainda é account_exists, não pending', async () => {
    // "Já tem conta" ganha de "ainda confirmando": o caminho é login, qualquer
    // que seja o status da assinatura.
    mockLimit.mockResolvedValue({ data: [sub({ user_id: 'user-1', status: 'canceled' })], error: null });

    const res = await POST(intentRequest(token));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('account_exists');
  });

  it('caminho feliz: assinatura ativa e sem dono => cria usuário e envia o e-mail', async () => {
    const res = await POST(intentRequest(token));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, email: 'pagador@test.com' });
    expect(mockCreateUser).toHaveBeenCalled();
    expect(mockResend).toHaveBeenCalled();
  });

  it('lead com DUAS assinaturas (uma reivindicada, outra ativa e livre): segue pela livre', async () => {
    // Antes o WHERE filtrava user_id null e usava maybeSingle; com duas linhas o
    // PostgREST devolveria erro e a pessoa veria "não encontrei pagamento".
    mockLimit.mockResolvedValue({
      data: [sub({ id: 'sub_velha', user_id: 'user-1' }), sub({ id: 'sub_nova' })],
      error: null,
    });

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(200);
    expect(mockGetSubscription).toHaveBeenCalledWith('sub_nova');
  });
});

describe('POST /api/asaas/signup-intent — a corrida com o webhook', () => {
  /**
   * Visto no teste real, nesta ordem: POST /checkout 200, GET /cadastro,
   * POST /signup-intent 404, POST /webhook 200. Ele TINHA pago; o webhook é que
   * ainda estava voando. Enquanto havia uma página intermediária no meio, os
   * segundos do clique escondiam a janela; com a successUrl apontando direto
   * para /cadastro, a primeira pergunta acontece no instante do redirect.
   *
   * O sinal que separa "não pagou" de "webhook a caminho" é a ref de checkout,
   * gravada ANTES de o comprador ir para o Asaas.
   */
  it('sem assinatura mas COM ref de checkout => 202 payment_pending, nunca no_payment_found', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockCheckoutRefs.mockResolvedValue({ data: [{ checkout_session_id: 'chk_1' }], error: null });

    const res = await POST(intentRequest(token, ORIGIN, {}));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ pending: true, code: 'payment_pending' });
    expect(body.code).not.toBe('no_payment_found');
  });

  it('sem assinatura e SEM ref => no_payment_found de uma vez, como antes', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockCheckoutRefs.mockResolvedValue({ data: [], error: null });

    const res = await POST(intentRequest(token, ORIGIN, {}));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'no_payment_found' });
  });

  it('a ref SOZINHA não cria conta nenhuma — só a assinatura ativa libera', async () => {
    // O princípio que não pode cair: chegar no /cadastro (ou ter aberto um
    // checkout) NÃO é prova de pagamento. A ref justifica ESPERAR, nunca liberar.
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockCheckoutRefs.mockResolvedValue({ data: [{ checkout_session_id: 'chk_1' }], error: null });

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(202);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockResend).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith('prepare_paid_signup_intent', expect.anything());
  });

  it('a ref não muda nada quando a assinatura EXISTE: o estado dela continua mandando', async () => {
    mockLimit.mockResolvedValue({ data: [sub({ user_id: 'user-1' })], error: null });
    mockCheckoutRefs.mockResolvedValue({ data: [{ checkout_session_id: 'chk_1' }], error: null });

    const res = await POST(intentRequest(token, ORIGIN, {}));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('account_exists');
  });
});

describe('POST /api/asaas/signup-intent — baldes separados de rate limit', () => {
  it('o resolve usa o balde folgado; o commit continua no de 5/min', async () => {
    await POST(intentRequest(token, ORIGIN, {}));
    expect(mockRpc).toHaveBeenCalledWith('consume_rate_window', expect.any(Object));
    expect(mockRpc).not.toHaveBeenCalledWith('consume_passwordless_rate', expect.anything());

    vi.clearAllMocks();
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'consume_passwordless_rate' || fn === 'consume_rate_window') {
        return { data: true, error: null };
      }
      return { data: { state: 'pending' }, error: null };
    });
    mockLimit.mockResolvedValue({ data: [sub()], error: null });
    mockCheckoutRefs.mockResolvedValue({ data: [], error: null });

    await POST(intentRequest(token));
    expect(mockRpc).toHaveBeenCalledWith('consume_passwordless_rate', expect.any(Object));
    expect(mockRpc).not.toHaveBeenCalledWith('consume_rate_window', expect.anything());
  });

  it('os dois passos contam em CHAVES diferentes — a espera não come a cota do commit', async () => {
    await POST(intentRequest(token, ORIGIN, {}));
    const resolveArgs = mockRpc.mock.calls.find((c) => c[0] === 'consume_rate_window')?.[1];

    vi.clearAllMocks();
    mockRpc.mockImplementation(async () => ({ data: true, error: null }));
    await POST(intentRequest(token));
    const commitArgs = mockRpc.mock.calls.find((c) => c[0] === 'consume_passwordless_rate')?.[1];

    expect(resolveArgs.p_ref_hash).not.toBe(commitArgs.p_ref_hash);
    // Mesmo IP, então a chave de IP é a MESMA: é o ref_hash que separa os baldes.
    expect(resolveArgs.p_ip_hash).toBe(commitArgs.p_ip_hash);
    expect(resolveArgs.p_ip_limit).toBeGreaterThan(5);
  });

  it('a espera longa NÃO dá 429 no meio, e o commit depois dela ainda passa', async () => {
    // O rate limit em memória é o de verdade aqui (só o do banco é mockado).
    // 6 tentativas é a janela de ~92s do cliente; a 7ª cobre o botão manual.
    for (let i = 0; i < 7; i += 1) {
      const res = await POST(intentRequest(token, ORIGIN, {}));
      expect(res.status, `tentativa ${i + 1} de resolve`).toBe(200);
    }

    const commit = await POST(intentRequest(token));
    expect(commit.status).toBe(200);
    expect(mockCreateUser).toHaveBeenCalled();
  });
});

describe('POST /api/asaas/signup-intent — a senha nasce no cadastro', () => {
  it('a senha do formulário vai para o createUser, com o e-mail AINDA não confirmado', async () => {
    await POST(intentRequest(token));

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'pagador@test.com',
        password: SENHA,
        email_confirm: false,
        app_metadata: expect.objectContaining({ origin: 'paid_passwordless' }),
      }),
    );
  });

  it('(a) e-mail DIGITADO diferente do e-mail do pagamento não muda a conta criada', async () => {
    // O caso real que confundiu o teste em sandbox: dois endereços parecidos.
    // A conta é de quem PAGOU. Se o corpo pudesse decidir isso, qualquer token
    // válido criaria conta paga no endereço que o atacante quisesse.
    const res = await POST(
      intentRequest(token, ORIGIN, { password: SENHA, email: 'atacante@test.com' }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'pagador@test.com' });
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'pagador@test.com' }),
    );
    expect(mockResend).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'pagador@test.com' }),
    );
    expect(JSON.stringify(mockCreateUser.mock.calls)).not.toContain('atacante@test.com');
  });

  it('(c) senha curta é recusada com code weak_password, ANTES de qualquer escrita', async () => {
    const res = await POST(intentRequest(token, ORIGIN, { password: 'abc' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'weak_password' });
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockResend).not.toHaveBeenCalled();
  });

  it('senha acima de 72 bytes é recusada (bcrypt trunca — não prometer o que não cumpre)', async () => {
    const res = await POST(intentRequest(token, ORIGIN, { password: 'a'.repeat(73) }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'weak_password' });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('o e-mail de confirmação continua saindo com emailRedirectTo do nosso appUrl', async () => {
    await POST(intentRequest(token));

    expect(mockResend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'signup',
        options: { emailRedirectTo: `${ORIGIN}/definir-senha` },
      }),
    );
  });
});

describe('POST /api/asaas/signup-intent — passo RESOLVE (corpo sem senha)', () => {
  it('devolve o e-mail do pagamento sem criar usuário nem enviar e-mail', async () => {
    const res = await POST(intentRequest(token, ORIGIN, {}));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, email: 'pagador@test.com' });
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockResend).not.toHaveBeenCalled();
  });

  it('roda o MESMO portão: pagamento não encontrado continua sendo 404', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    const res = await POST(intentRequest(token, ORIGIN, {}));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'no_payment_found' });
  });

  it('roda o MESMO portão: assinatura já reivindicada não devolve e-mail nenhum', async () => {
    mockLimit.mockResolvedValue({ data: [sub({ user_id: 'user-1' })], error: null });

    const res = await POST(intentRequest(token, ORIGIN, {}));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('account_exists');
    expect(body.email).toBeUndefined();
  });
});

describe('POST /api/asaas/signup-intent — trocar a senha de conta existente', () => {
  beforeEach(() => {
    mockCreateUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } });
  });

  it('(b) assinatura JÁ REIVINDICADA não chega a trocar senha nenhuma', async () => {
    mockLimit.mockResolvedValue({ data: [sub({ user_id: 'user-1' })], error: null });
    adminUsers([
      { id: 'u1', email: 'pagador@test.com', app_metadata: { origin: 'paid_passwordless' } },
    ]);

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('account_exists');
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('conta comum (origin != paid_passwordless) com o mesmo e-mail NÃO tem a senha trocada', async () => {
    // Sem isto, pagar uma assinatura no e-mail de outra pessoa viraria um
    // "redefinir senha" da conta dela.
    adminUsers([{ id: 'u9', email: 'pagador@test.com', app_metadata: { origin: 'email' } }]);

    await POST(intentRequest(token));

    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('conta já CONFIRMADA não tem a senha trocada, mesmo com o marcador certo', async () => {
    adminUsers([
      {
        id: 'u9',
        email: 'pagador@test.com',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        app_metadata: { origin: 'paid_passwordless' },
      },
    ]);

    await POST(intentRequest(token));

    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('e-mail PARECIDO não é o mesmo e-mail: nada é atualizado', async () => {
    adminUsers([
      { id: 'u9', email: 'pagador+outro@test.com', app_metadata: { origin: 'paid_passwordless' } },
    ]);

    await POST(intentRequest(token));

    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('reentrada legítima (não confirmada, marcador certo, assinatura livre) grava a senha', async () => {
    adminUsers([
      { id: 'u9', email: 'pagador@test.com', email_confirmed_at: null, app_metadata: { origin: 'paid_passwordless' } },
    ]);

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledWith(
      'u9',
      expect.objectContaining({ password: SENHA }),
    );
  });
});

describe('POST /api/asaas/signup-intent — o que continua genérico', () => {
  it('token inválido => 403 genérico, SEM code (não vira oráculo)', async () => {
    const res = await POST(intentRequest(`${LEAD_ID}.${'a'.repeat(43)}`));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Não foi possível iniciar o cadastro.' });
    expect(body.code).toBeUndefined();
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it('origin errada => 403 genérico antes de qualquer consulta', async () => {
    const res = await POST(intentRequest(token, 'https://site-do-atacante.com'));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBeUndefined();
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it('assinatura ativa localmente mas NÃO no Asaas => 403 genérico, sem code', async () => {
    // A releitura na API é a fonte de verdade. Aqui o estado é ambíguo e não há
    // o que orientar o usuário a fazer — segue genérico de propósito.
    mockGetSubscription.mockResolvedValue({ id: 'sub_1', status: 'INACTIVE' });

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBeUndefined();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('NENHUM estado vaza dado do pagamento (nome, plano, valor, data)', async () => {
    for (const linhas of [[], [sub({ status: 'past_due' })], [sub({ user_id: 'user-1' })]]) {
      mockLimit.mockResolvedValue({ data: linhas, error: null });
      const body = await (await POST(intentRequest(token))).json();
      // Só error/code/pending. Nada de e-mail, valor, plano ou id.
      expect(Object.keys(body).every((k) => ['error', 'code', 'pending'].includes(k))).toBe(true);
      __resetRateLimit();
    }
  });
});

/**
 * FLUXO NORMAL vs. PAGAMENTO ÓRFÃO.
 *
 * O webhook agenda um e-mail "seu acesso está pronto, clique para criar sua
 * conta" toda vez que uma assinatura vira ativa sem dono — porque no instante
 * do webhook é impossível saber se a pessoa ainda está na tela. Quem separa os
 * dois casos é ESTE ponto: se ela terminar o cadastro dentro da janela, o envio
 * é cancelado e ela nunca recebe o convite para criar a conta que acabou de
 * criar.
 */
describe('POST /api/asaas/signup-intent — aviso de pagamento órfão', () => {
  it('fluxo normal: concluir o cadastro CANCELA o aviso agendado', async () => {
    mockLimit.mockResolvedValue({
      data: [sub({ orphan_notice_email_id: 'email_agendado_1' })],
      error: null,
    });

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(200);
    expect(mockCancelScheduledEmail).toHaveBeenCalledWith('email_agendado_1');
  });

  it('sem aviso agendado, não chama o Resend à toa', async () => {
    const res = await POST(intentRequest(token));

    expect(res.status).toBe(200);
    expect(mockCancelScheduledEmail).not.toHaveBeenCalled();
  });

  it('o passo RESOLVE não cancela nada (ela ainda não criou a conta)', async () => {
    mockLimit.mockResolvedValue({
      data: [sub({ orphan_notice_email_id: 'email_agendado_1' })],
      error: null,
    });

    // Sem senha no corpo = resolve: só descobre de quem é a conta.
    const res = await POST(intentRequest(token, ORIGIN, {}));

    expect(res.status).toBe(200);
    expect(mockCancelScheduledEmail).not.toHaveBeenCalled();
  });

  it('cadastro RECUSADO mantém o aviso agendado (ela continua sem conta)', async () => {
    mockLimit.mockResolvedValue({
      data: [sub({ orphan_notice_email_id: 'email_agendado_1' })],
      error: null,
    });
    // A confirmação não saiu: o cadastro não se completou.
    mockResend.mockResolvedValue({ error: { message: 'smtp down' } });

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(403);
    expect(mockCancelScheduledEmail).not.toHaveBeenCalled();
  });

  it('falha ao cancelar NÃO derruba o cadastro (ele já está feito)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLimit.mockResolvedValue({
      data: [sub({ orphan_notice_email_id: 'email_agendado_1' })],
      error: null,
    });
    mockCancelScheduledEmail.mockResolvedValue(false);

    const res = await POST(intentRequest(token));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
