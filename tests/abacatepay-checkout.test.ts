import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimit } from '../lib/rate-limit';

const { mockCreateCustomer, mockCreateCheckout, mockGetUser, mockLimit, mockUpsertSubscription } =
  vi.hoisted(() => ({
    mockCreateCustomer: vi.fn(),
    mockCreateCheckout: vi.fn(),
    mockGetUser: vi.fn(),
    mockLimit: vi.fn(),
    mockUpsertSubscription: vi.fn(),
  }));

vi.mock('@/lib/abacatepay', () => ({
  createCustomer: mockCreateCustomer,
  createSubscriptionCheckout: mockCreateCheckout,
  productIdForInterval: (i: string) => (i === 'year' ? 'prod_anual' : 'prod_mensal'),
}));

vi.mock('@/lib/app-url', () => ({
  appUrl: (path = '') => `http://localhost:3000${path.startsWith('/') ? path : `/${path}`}`,
}));

// Caminho relativo ao ARQUIVO DE TESTE (o vitest resolve o mock a partir
// daqui, não do módulo que importa). Aponta para o mesmo arquivo que a rota
// importa como '../../../../lib/abacatepay-sync'.
vi.mock('../lib/abacatepay-sync', () => ({
  upsertSubscription: mockUpsertSubscription,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({ eq: () => ({ in: () => ({ limit: mockLimit }) }) }),
    }),
  }),
}));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ from: () => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }) }),
}));

import { POST } from '../app/api/abacatepay/checkout/route';

function jsonRequest(body: unknown, ip = '10.0.0.1') {
  return {
    json: async () => body,
    headers: { get: (h: string) => (h === 'x-forwarded-for' ? ip : null) },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => __resetRateLimit());
afterEach(() => vi.clearAllMocks());

describe('POST /api/abacatepay/checkout', () => {
  it('rate limit: 11ª requisição do mesmo IP em 1 min recebe 429 antes de qualquer chamada', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockCreateCustomer.mockResolvedValue({ id: 'cust_x', email: 'a@test.com' });
    mockCreateCheckout.mockResolvedValue({ id: 'bill_x', url: 'https://x', status: 'PENDING', items: [] });

    const ip = '203.0.113.9';
    for (let i = 0; i < 10; i++) {
      const res = await POST(jsonRequest({ interval: 'month', email: `a${i}@test.com` }, ip));
      expect(res.status).toBe(200);
    }
    const blocked = await POST(jsonRequest({ interval: 'month', email: 'a10@test.com' }, ip));
    expect(blocked.status).toBe(429);
  });

  it('retorna 409 alreadySubscribed e NÃO chama a AbacatePay quando o logado já assina (B1)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'assinante@test.com' } }, error: null });
    mockLimit.mockResolvedValue({ data: [{ id: 'bill_1' }], error: null });

    const res = await POST(jsonRequest({ interval: 'month', email: 'assinante@test.com' }));

    expect(res.status).toBe(409);
    expect((await res.json()).alreadySubscribed).toBe(true);
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('exige e-mail: sem ele não há como provar quem pagou depois (B2)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(jsonRequest({ interval: 'month' }));

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('email_required');
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('rejeita e-mail malformado antes de criar qualquer coisa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(jsonRequest({ interval: 'month', email: 'nao-e-email' }));

    expect(res.status).toBe(400);
    expect(mockCreateCustomer).not.toHaveBeenCalled();
  });

  it('cria customer com o e-mail e amarra ao checkout, devolvendo a url de pagamento', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockCreateCustomer.mockResolvedValue({ id: 'cust_1', email: 'novo@test.com' });
    mockCreateCheckout.mockResolvedValue({
      id: 'bill_1',
      url: 'https://app.abacatepay.com/pay/bill_1',
      status: 'PENDING',
      items: [{ id: 'prod_mensal', quantity: 1 }],
    });

    const res = await POST(jsonRequest({ interval: 'month', email: 'Novo@Test.com' }));

    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://app.abacatepay.com/pay/bill_1');

    // e-mail normalizado em minúsculas antes de virar customer
    expect(mockCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ email: 'novo@test.com' }));

    // o checkout precisa sair amarrado ao customer, senão não há e-mail verificável
    const args = mockCreateCheckout.mock.calls[0][0];
    expect(args.customerId).toBe('cust_1');
    expect(args.productId).toBe('prod_mensal');
    // ref é UUID nosso e vai tanto no externalId quanto na URL de retorno
    expect(args.externalId).toMatch(/^[0-9a-f-]{36}$/);
    expect(args.completionUrl).toContain(args.externalId);

    // registra o checkout pendente pra permitir resolver ref → id depois
    expect(mockUpsertSubscription).toHaveBeenCalledTimes(1);
  });

  it('usa o produto anual quando o intervalo é year', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockCreateCustomer.mockResolvedValue({ id: 'cust_2', email: 'anual@test.com' });
    mockCreateCheckout.mockResolvedValue({ id: 'bill_2', url: 'https://x', status: 'PENDING', items: [] });

    await POST(jsonRequest({ interval: 'year', email: 'anual@test.com' }));

    expect(mockCreateCheckout.mock.calls[0][0].productId).toBe('prod_anual');
  });
});
