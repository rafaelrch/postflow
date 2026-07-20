import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCheckout,
  mockUpsert,
  mockInsert,
  mockVerifySignature,
  mockVerifySecret,
} = vi.hoisted(() => ({
  mockGetCheckout: vi.fn(),
  mockUpsert: vi.fn(),
  mockInsert: vi.fn(),
  mockVerifySignature: vi.fn(),
  mockVerifySecret: vi.fn(),
}));

vi.mock('@/lib/abacatepay', () => ({
  getCheckout: mockGetCheckout,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ from: () => ({ insert: mockInsert }) }),
}));

// Relativos ao arquivo de teste — mesmos módulos que a rota importa.
vi.mock('../lib/abacatepay-webhook', () => ({
  verifySignature: mockVerifySignature,
  verifySecret: mockVerifySecret,
  eventIdFor: (body: string) => `hash-${body.length}`,
}));

vi.mock('../lib/abacatepay-sync', () => ({
  upsertSubscription: mockUpsert,
}));

import { POST } from '../app/api/abacatepay/webhook/route';

/** O corpo BRUTO importa: é o que a assinatura HMAC cobre. */
function webhookRequest(body: unknown, opts: { secret?: string; signature?: string } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const url = `https://app.creatools.com.br/api/abacatepay/webhook?webhookSecret=${opts.secret ?? 'secret-ok'}`;
  return {
    url,
    text: async () => raw,
    headers: { get: (h: string) => (h === 'x-webhook-signature' ? (opts.signature ?? 'sig-ok') : null) },
  } as unknown as Parameters<typeof POST>[0];
}

const CHECKOUT_RELIDO = {
  id: 'bill_1',
  status: 'PAID',
  frequency: 'SUBSCRIPTION',
  items: [{ id: 'prod_mensal', quantity: 1 }],
  customerId: 'cust_1',
};

beforeEach(() => {
  mockVerifySignature.mockReturnValue(true);
  mockVerifySecret.mockReturnValue(true);
  mockInsert.mockResolvedValue({ error: null });
  mockGetCheckout.mockResolvedValue(CHECKOUT_RELIDO);
  mockUpsert.mockResolvedValue({ userId: null, interval: 'month', status: 'active' });
});

afterEach(() => vi.clearAllMocks());

describe('POST /api/abacatepay/webhook — verificação', () => {
  it('rejeita assinatura inválida sem processar nada', async () => {
    mockVerifySignature.mockReturnValue(false);

    const res = await POST(webhookRequest({ event: 'checkout.completed', data: { id: 'bill_1' } }));

    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockGetCheckout).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejeita secret inválido sem processar nada', async () => {
    mockVerifySecret.mockReturnValue(false);

    const res = await POST(webhookRequest({ event: 'checkout.completed', data: { id: 'bill_1' } }));

    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('não revela qual dos dois fatores falhou', async () => {
    mockVerifySignature.mockReturnValue(false);
    const semAssinatura = await (await POST(webhookRequest({ event: 'x' }))).json();

    vi.clearAllMocks();
    mockVerifySignature.mockReturnValue(true);
    mockVerifySecret.mockReturnValue(false);
    mockInsert.mockResolvedValue({ error: null });
    const semSecret = await (await POST(webhookRequest({ event: 'x' }))).json();

    expect(semAssinatura).toEqual(semSecret);
  });

  it('assina o corpo BRUTO recebido, não uma versão reserializada', async () => {
    const raw = '{"event":"checkout.completed","data":{"id":"bill_1"},"extra":  "espacos"}';

    await POST(webhookRequest(raw));

    expect(mockVerifySignature).toHaveBeenCalledWith(raw, 'sig-ok');
  });

  it('payload que não é JSON válido para em 400 depois da verificação', async () => {
    const res = await POST(webhookRequest('nao é json'));

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/abacatepay/webhook — idempotência', () => {
  it('reentrega do mesmo corpo não reprocessa', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505' } });

    const res = await POST(webhookRequest({ event: 'checkout.completed', data: { id: 'bill_1' } }));

    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(mockGetCheckout).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('erro inesperado ao registrar o evento vira 500 e não processa', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42P01', message: 'tabela sumiu' } });

    const res = await POST(webhookRequest({ event: 'checkout.completed', data: { id: 'bill_1' } }));

    expect(res.status).toBe(500);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/abacatepay/webhook — re-read antes de gravar', () => {
  it('grava o checkout RELIDO da API, nunca o que veio no payload', async () => {
    // Payload forjado tentando declarar um estado que a API não confirma.
    const res = await POST(
      webhookRequest({
        event: 'checkout.completed',
        data: { id: 'bill_1', status: 'PAID', amount: 999999, customerId: 'cust_ATACANTE' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockGetCheckout).toHaveBeenCalledWith('bill_1');
    // o objeto gravado é o da API, não o do corpo
    expect(mockUpsert).toHaveBeenCalledWith(CHECKOUT_RELIDO, null, 'checkout.completed');
    expect(mockUpsert.mock.calls[0][0]).not.toMatchObject({ customerId: 'cust_ATACANTE' });
  });

  it('lê a API antes de gravar (ordem importa)', async () => {
    const ordem: string[] = [];
    mockGetCheckout.mockImplementation(async () => {
      ordem.push('read');
      return CHECKOUT_RELIDO;
    });
    mockUpsert.mockImplementation(async () => {
      ordem.push('write');
      return { userId: null, interval: 'month', status: 'active' };
    });

    await POST(webhookRequest({ event: 'checkout.completed', data: { id: 'bill_1' } }));

    expect(ordem).toEqual(['read', 'write']);
  });

  it('sem id no payload não grava nada', async () => {
    const res = await POST(webhookRequest({ event: 'checkout.completed', data: {} }));

    expect(res.status).toBe(200);
    expect(mockGetCheckout).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('falha na releitura vira 500 em vez de gravar estado incerto', async () => {
    mockGetCheckout.mockRejectedValue(new Error('API fora do ar'));

    const res = await POST(webhookRequest({ event: 'checkout.completed', data: { id: 'bill_1' } }));

    expect(res.status).toBe(500);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/abacatepay/webhook — A1: evento chega ao sync', () => {
  it.each([
    'checkout.disputed',
    'checkout.refunded',
    'subscription.cancelled',
  ])('%s repassa o evento para o sync decidir a revogação', async (event) => {
    await POST(webhookRequest({ event, data: { id: 'bill_1' } }));

    // o checkout relido segue PAID; quem impede a reafirmação de acesso é o
    // terceiro argumento — por isso ele precisa chegar ao sync.
    expect(mockUpsert).toHaveBeenCalledWith(CHECKOUT_RELIDO, null, event);
  });

  it.each([
    'checkout.completed',
    'subscription.completed',
    'subscription.renewed',
  ])('%s também repassa o evento', async (event) => {
    await POST(webhookRequest({ event, data: { id: 'bill_1' } }));

    expect(mockUpsert).toHaveBeenCalledWith(CHECKOUT_RELIDO, null, event);
  });

  it('evento desconhecido é registrado mas não altera assinatura', async () => {
    const res = await POST(webhookRequest({ event: 'subscription.plan_changed', data: { id: 'bill_1' } }));

    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockGetCheckout).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
