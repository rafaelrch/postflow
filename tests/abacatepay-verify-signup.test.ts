import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockGetCheckout, mockMaybeSingle, mockResolveEmail, mockUpsert, mockEq, mockIs } = vi.hoisted(() => ({
  mockGetCheckout: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockResolveEmail: vi.fn(),
  mockUpsert: vi.fn(),
  mockEq: vi.fn(),
  mockIs: vi.fn(),
}));

vi.mock('@/lib/abacatepay', () => ({
  getCheckout: mockGetCheckout,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => {
    const query = {
      select: vi.fn(),
      eq: mockEq,
      is: mockIs,
      maybeSingle: mockMaybeSingle,
    };
    query.select.mockReturnValue(query);
    mockEq.mockReturnValue(query);
    mockIs.mockReturnValue(query);
    return { from: () => query };
  },
}));

// Relativo ao arquivo de teste — mesmo módulo que a rota importa.
vi.mock('../lib/abacatepay-sync', () => ({
  resolveEmail: mockResolveEmail,
  upsertSubscription: mockUpsert,
}));

import { POST } from '../app/api/abacatepay/verify-signup/route';

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const REF = '11111111-2222-3333-4444-555555555555';

const paidCheckout = {
  id: 'bill_legitima',
  frequency: 'SUBSCRIPTION',
  status: 'PAID',
  customerId: 'cust_vitima',
  items: [{ id: 'prod_mensal', quantity: 1 }],
};

afterEach(() => vi.clearAllMocks());

describe('POST /api/abacatepay/verify-signup (B2 — sequestro de conta)', () => {
  it('rejeita cadastro sem ref (ataque: atacante só sabe o e-mail da vítima)', async () => {
    const res = await POST(jsonRequest({ email: 'vitima@example.com' }));

    expect(res.status).toBe(400);
    expect(mockGetCheckout).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejeita ref que não existe no nosso registro (referência forjada)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });

    const res = await POST(jsonRequest({ email: 'vitima@example.com', ref: 'forjada' }));

    expect(res.status).toBe(403);
    expect(mockGetCheckout).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejeita quando o checkout sumiu/expirou na AbacatePay', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bill_sumiu' } });
    mockGetCheckout.mockRejectedValue(new Error('Not found'));

    const res = await POST(jsonRequest({ email: 'vitima@example.com', ref: REF }));

    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejeita quando o e-mail pago não bate com o submetido (roubo de conta)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bill_legitima' } });
    mockGetCheckout.mockResolvedValue(paidCheckout);
    mockResolveEmail.mockResolvedValue('vitima@example.com');

    // Atacante tem uma ref válida (ou adivinhou), mas tenta cadastrar
    // o e-mail dele em cima de um pagamento que não é dele.
    const res = await POST(jsonRequest({ email: 'atacante@evil.com', ref: REF }));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/e-mail/i);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejeita checkout ainda PENDING (abandonado / não pago)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bill_pendente' } });
    mockGetCheckout.mockResolvedValue({ ...paidCheckout, status: 'PENDING' });

    const res = await POST(jsonRequest({ email: 'vitima@example.com', ref: REF }));

    expect(res.status).toBe(403);
    expect(mockResolveEmail).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejeita checkout reembolsado — não vira acesso vitalício', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bill_reembolsado' } });
    mockGetCheckout.mockResolvedValue({ ...paidCheckout, status: 'REFUNDED' });

    const res = await POST(jsonRequest({ email: 'vitima@example.com', ref: REF }));

    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejeita quando o customer não tem e-mail resolvível (checkout sem cliente amarrado)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bill_sem_customer' } });
    mockGetCheckout.mockResolvedValue({ ...paidCheckout, customerId: null });
    mockResolveEmail.mockResolvedValue(null);

    const res = await POST(jsonRequest({ email: 'vitima@example.com', ref: REF }));

    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('autoriza e sincroniza quando o checkout está PAID e o e-mail bate', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bill_legitima' } });
    mockGetCheckout.mockResolvedValue(paidCheckout);
    mockResolveEmail.mockResolvedValue('vitima@example.com');

    const res = await POST(jsonRequest({ email: 'vitima@example.com', ref: REF }));

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(paidCheckout, 'vitima@example.com');
    expect(mockIs).toHaveBeenCalledWith('user_id', null);
  });

  it('compara e-mail sem diferenciar maiúsculas (não barra cadastro legítimo)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bill_legitima' } });
    mockGetCheckout.mockResolvedValue(paidCheckout);
    mockResolveEmail.mockResolvedValue('Vitima@Example.com');

    const res = await POST(jsonRequest({ email: 'vitima@example.com', ref: REF }));

    expect(res.status).toBe(200);
  });
});
