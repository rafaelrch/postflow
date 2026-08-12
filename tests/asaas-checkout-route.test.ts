import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimit } from '../lib/rate-limit';

const LEAD_ID = '3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

const { mockCreateCheckout, mockGetUser, mockHasBillable, mockLeadMaybeSingle } = vi.hoisted(
  () => ({
    mockCreateCheckout: vi.fn(),
    mockGetUser: vi.fn(),
    mockHasBillable: vi.fn(),
    mockLeadMaybeSingle: vi.fn(),
  }),
);

// Caminhos relativos ao ARQUIVO DE TESTE: o vitest resolve o mock a partir
// daqui, não do módulo que importa. Apontam para os mesmos arquivos que a rota
// importa como '../../../../lib/...'.
vi.mock('../lib/asaas/checkouts', () => ({ createCheckout: mockCreateCheckout }));
vi.mock('../lib/subscription', () => ({ hasBillableSubscription: mockHasBillable }));

vi.mock('@/lib/app-url', () => ({
  appUrl: (path = '') => `http://localhost:3000${path.startsWith('/') ? path : `/${path}`}`,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockLeadMaybeSingle }) }) }),
  }),
}));

import { POST } from '../app/api/asaas/checkout/route';

function jsonRequest(body: unknown, ip = '10.0.0.1') {
  return {
    json: async () => body,
    headers: { get: (h: string) => (h === 'x-forwarded-for' ? ip : null) },
  } as unknown as Parameters<typeof POST>[0];
}

const LEAD_OK = {
  data: { id: LEAD_ID, name: 'Rafael Rocha', email: 'rafael@test.com', phone: '11999999999' },
  error: null,
};

let segredoOriginal: string | undefined;

beforeEach(() => {
  __resetRateLimit();
  segredoOriginal = process.env.SIGNUP_TOKEN_SECRET;
  process.env.SIGNUP_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-16-chars';

  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  mockLeadMaybeSingle.mockResolvedValue(LEAD_OK);
  mockCreateCheckout.mockResolvedValue({ id: 'chk_1', link: 'https://asaas/checkout/chk_1' });
});

afterEach(() => {
  if (segredoOriginal === undefined) delete process.env.SIGNUP_TOKEN_SECRET;
  else process.env.SIGNUP_TOKEN_SECRET = segredoOriginal;
  vi.clearAllMocks();
});

describe('POST /api/asaas/checkout — corpo enviado ao Asaas', () => {
  it('monta uma assinatura RECORRENTE com o ciclo e o valor do plano', async () => {
    const res = await POST(jsonRequest({ interval: 'year', leadId: LEAD_ID }));
    expect(res.status).toBe(200);

    const [body] = mockCreateCheckout.mock.calls[0];
    expect(body.chargeTypes).toEqual(['RECURRENT']);
    expect(body.subscription.cycle).toBe('YEARLY');
    expect(body.items[0].value).toBe(499);
    expect(body.items).toHaveLength(1);
  });

  it('externalReference é o id do lead — é ele que liga o pagamento ao comprador', async () => {
    await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    const [body] = mockCreateCheckout.mock.calls[0];
    expect(body.externalReference).toBe(LEAD_ID);
  });

  it('successUrl leva NOSSO token assinado; cancel e expired apontam para as páginas', async () => {
    await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    const [body] = mockCreateCheckout.mock.calls[0];
    const success = new URL(body.callback.successUrl);
    const token = success.searchParams.get('t');

    expect(success.pathname).toBe('/assinatura/sucesso');
    // O token começa pelo leadId e traz a assinatura — verificação profunda
    // fica em tests/signup-token.test.ts.
    expect(token).toMatch(new RegExp(`^${LEAD_ID}\\.`));
    expect(body.callback.cancelUrl).toContain('/assinatura/cancelado');
    expect(body.callback.expiredUrl).toContain('/assinatura/expirado');
  });

  it('OMITE customerData por completo — mandar parcial faz o Asaas exigir CPF e endereço', async () => {
    await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    const [body] = mockCreateCheckout.mock.calls[0];
    // Verificado contra o sandbox: com name/email/phone parcial o Asaas
    // responde 400 pedindo cpfCnpj, address, addressNumber, province e
    // postalCode. Omitir o objeto inteiro passa, e o checkout hospedado
    // coleta tudo do comprador.
    expect(body).not.toHaveProperty('customerData');
  });

  it('só CREDIT_CARD: o Asaas recusa PIX quando chargeTypes inclui RECURRENT', async () => {
    await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    const [body] = mockCreateCheckout.mock.calls[0];
    expect(body.billingTypes).toEqual(['CREDIT_CARD']);
    expect(body.billingTypes).not.toContain('PIX');
  });

  it('não manda imageBase64: a doc diz obrigatório, o sandbox aceita sem', async () => {
    await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    const [body] = mockCreateCheckout.mock.calls[0];
    expect(body.items[0]).not.toHaveProperty('imageBase64');
  });

  it('desliga o retry: um 502 do Asaas não pode virar dois checkouts', async () => {
    await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    const [, options] = mockCreateCheckout.mock.calls[0];
    expect(options.maxRetries).toBe(0);
  });
});

describe('POST /api/asaas/checkout — entradas inválidas', () => {
  it('intervalo inválido: 400 e NENHUMA chamada ao Asaas (não cobra o plano errado)', async () => {
    const res = await POST(jsonRequest({ interval: 'mensal', leadId: LEAD_ID }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'invalid_interval' });
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('intervalo ausente: 400, sem cair no mensal por padrão', async () => {
    const res = await POST(jsonRequest({ leadId: LEAD_ID }));

    expect(res.status).toBe(400);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('leadId malformado: 400 antes de consultar o banco', async () => {
    const res = await POST(jsonRequest({ interval: 'month', leadId: 'nao-e-uuid' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'invalid_lead' });
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('lead inexistente: 400 e nada é criado no Asaas', async () => {
    mockLeadMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    expect(res.status).toBe(400);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });
});

describe('POST /api/asaas/checkout — guardas', () => {
  it('usuário logado que já assina recebe 409 ANTES de qualquer chamada ao Asaas', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockHasBillable.mockResolvedValue(true);

    const res = await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ alreadySubscribed: true });
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('checkout sem link: 502, não devolve url vazia para o browser', async () => {
    mockCreateCheckout.mockResolvedValue({ id: 'chk_1' });

    const res = await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }));

    expect(res.status).toBe(502);
  });

  it('rate limit por IP: a 11ª tentativa em 1 minuto leva 429', async () => {
    const ip = '203.0.113.9';
    for (let i = 0; i < 10; i += 1) {
      const ok = await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }, ip));
      expect(ok.status).toBe(200);
    }

    const res = await POST(jsonRequest({ interval: 'month', leadId: LEAD_ID }, ip));
    expect(res.status).toBe(429);
  });
});
