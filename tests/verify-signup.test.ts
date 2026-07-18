import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockRetrieve, mockSync } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockSync: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { retrieve: mockRetrieve } } },
}));

vi.mock('@/lib/stripe-sync', () => ({
  syncSubscriptionFromSession: mockSync,
}));

import { POST } from '../app/api/auth/verify-signup/route';

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const paidSession = {
  mode: 'subscription',
  status: 'complete',
  subscription: 'sub_victim_123',
  payment_status: 'paid',
  customer_details: { email: 'vitima@example.com' },
  customer_email: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/verify-signup (B2 — sequestro de conta)', () => {
  it('rejeita cadastro sem session_id (ataque: atacante só sabe o e-mail da vítima)', async () => {
    const res = await POST(jsonRequest({ email: 'vitima@example.com' }));

    expect(res.status).toBe(400);
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('rejeita quando a sessão informada não existe/expirou na Stripe', async () => {
    mockRetrieve.mockRejectedValue(new Error('No such checkout session'));

    const res = await POST(jsonRequest({ email: 'vitima@example.com', session_id: 'cs_forjada' }));

    expect(res.status).toBe(403);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('rejeita quando o e-mail da sessão paga não bate com o e-mail submetido (roubo de conta)', async () => {
    mockRetrieve.mockResolvedValue(paidSession);

    // Atacante tem uma sessão paga PRÓPRIA (ou nenhuma prova real), mas tenta
    // cadastrar o e-mail da vítima.
    const res = await POST(jsonRequest({ email: 'atacante@evil.com', session_id: 'cs_atacante' }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/e-mail/i);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('rejeita quando a sessão existe mas não foi paga (checkout abandonado/incompleto)', async () => {
    mockRetrieve.mockResolvedValue({ ...paidSession, status: 'open', subscription: null, payment_status: 'unpaid' });

    const res = await POST(jsonRequest({ email: 'vitima@example.com', session_id: 'cs_incompleta' }));

    expect(res.status).toBe(403);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('autoriza e sincroniza a assinatura quando a sessão é paga e o e-mail bate', async () => {
    mockRetrieve.mockResolvedValue(paidSession);
    mockSync.mockResolvedValue({ userId: null, interval: 'month', status: 'active' });

    const res = await POST(jsonRequest({ email: 'vitima@example.com', session_id: 'cs_legitima' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith(paidSession);
  });

  it('autoriza plano anual em trial (payment_status "no_payment_required") — não trata trial como não-pago', async () => {
    mockRetrieve.mockResolvedValue({ ...paidSession, payment_status: 'no_payment_required' });
    mockSync.mockResolvedValue({ userId: null, interval: 'year', status: 'trialing' });

    const res = await POST(jsonRequest({ email: 'vitima@example.com', session_id: 'cs_trial' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
