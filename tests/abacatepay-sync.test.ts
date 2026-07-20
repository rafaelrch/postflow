import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PROD_ANUAL entra no hoisted porque é usado dentro da factory do vi.mock,
// que é içada para o topo do arquivo.
const { mockGetCustomer, mockUpsert, mockMaybeSingle, PROD_ANUAL, PROD_MENSAL } = vi.hoisted(() => ({
  mockGetCustomer: vi.fn(),
  mockUpsert: vi.fn(),
  mockMaybeSingle: vi.fn(),
  PROD_ANUAL: 'prod_anual_123',
  PROD_MENSAL: 'prod_mensal_456',
}));

vi.mock('@/lib/abacatepay', () => ({
  getCheckout: vi.fn(),
  getCustomer: mockGetCustomer,
  ABACATEPAY_PRODUCT_ANNUALLY: PROD_ANUAL,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      upsert: mockUpsert,
    }),
  }),
}));

import {
  intervalOf,
  isRevokingEvent,
  mapStatus,
  resolveEmail,
  statusForEvent,
  upsertSubscription,
} from '../lib/abacatepay-sync';

type Checkout = Parameters<typeof upsertSubscription>[0];

function checkout(over: Partial<Checkout> = {}): Checkout {
  return {
    id: 'bill_1',
    externalId: null,
    url: 'https://app.abacatepay.com/pay/bill_1',
    amount: 5950,
    paidAmount: null,
    items: [{ id: PROD_MENSAL, quantity: 1 }],
    status: 'PAID',
    methods: ['CARD'],
    frequency: 'SUBSCRIPTION',
    customerId: 'cust_1',
    returnUrl: null,
    completionUrl: null,
    metadata: null,
    trialDays: null,
    trialEndsAt: null,
    nextChargeAt: '2026-08-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...over,
  } as Checkout;
}

beforeEach(() => {
  mockMaybeSingle.mockResolvedValue({ data: null });
  mockUpsert.mockResolvedValue({ error: null });
  mockGetCustomer.mockResolvedValue({ id: 'cust_1', email: 'pagante@example.com' });
});

afterEach(() => vi.clearAllMocks());

describe('mapStatus', () => {
  it('traduz os status conhecidos para o vocabulário interno', () => {
    expect(mapStatus('PAID')).toBe('active');
    expect(mapStatus('PENDING')).toBe('incomplete');
    expect(mapStatus('EXPIRED')).toBe('incomplete_expired');
    expect(mapStatus('CANCELLED')).toBe('canceled');
  });

  it('separa REFUNDED de CANCELLED (estorno não é o mesmo que cancelar)', () => {
    expect(mapStatus('REFUNDED')).toBe('refunded');
  });

  it('status desconhecido nunca vira acesso ativo', () => {
    expect(mapStatus('QUALQUER_COISA' as never)).toBe('incomplete');
  });

  it('só PAID produz o status que a view de assinatura ativa aceita', () => {
    const ativos = (['PAID', 'PENDING', 'EXPIRED', 'CANCELLED', 'REFUNDED'] as const).filter(
      (s) => ['active', 'trialing'].includes(mapStatus(s)),
    );
    expect(ativos).toEqual(['PAID']);
  });
});

describe('statusForEvent — A1: evento vence o checkout.status', () => {
  it('disputa NUNCA reafirma acesso, mesmo com o checkout relido em PAID', () => {
    expect(statusForEvent('checkout.disputed', 'PAID')).toBe('disputed');
  });

  it('estorno NUNCA reafirma acesso, mesmo com o checkout relido em PAID', () => {
    expect(statusForEvent('checkout.refunded', 'PAID')).toBe('refunded');
  });

  it('cancelamento NUNCA reafirma acesso, mesmo com o checkout relido em PAID', () => {
    // Cenário real: o ciclo de vida vive no objeto subs_..., que getCheckout
    // não enxerga — o bill pode seguir PAID depois do cancelamento.
    expect(statusForEvent('subscription.cancelled', 'PAID')).toBe('canceled');
  });

  it('nenhum status de evento revogador entra na view de assinatura ativa', () => {
    for (const ev of ['checkout.disputed', 'checkout.refunded', 'subscription.cancelled']) {
      expect(['active', 'trialing']).not.toContain(statusForEvent(ev, 'PAID'));
    }
  });

  it('eventos de pagamento seguem derivando do status do checkout', () => {
    expect(statusForEvent('checkout.completed', 'PAID')).toBe('active');
    expect(statusForEvent('subscription.renewed', 'PAID')).toBe('active');
    expect(statusForEvent('subscription.completed', 'PENDING')).toBe('incomplete');
  });

  it('sem evento (fallback de sync) usa o status do checkout', () => {
    expect(statusForEvent(null, 'PAID')).toBe('active');
    expect(statusForEvent(undefined, 'CANCELLED')).toBe('canceled');
  });

  it('isRevokingEvent identifica só os três que retiram acesso', () => {
    expect(isRevokingEvent('checkout.disputed')).toBe(true);
    expect(isRevokingEvent('checkout.refunded')).toBe(true);
    expect(isRevokingEvent('subscription.cancelled')).toBe(true);
    expect(isRevokingEvent('checkout.completed')).toBe(false);
    expect(isRevokingEvent(null)).toBe(false);
  });
});

describe('intervalOf', () => {
  it('identifica anual pelo id do produto', () => {
    expect(intervalOf(checkout({ items: [{ id: PROD_ANUAL, quantity: 1 }] }))).toBe('year');
  });

  it('qualquer outro produto é mensal', () => {
    expect(intervalOf(checkout({ items: [{ id: PROD_MENSAL, quantity: 1 }] }))).toBe('month');
    expect(intervalOf(checkout({ items: [] }))).toBe('month');
  });

  it('A7: sem a env do produto anual, loga erro em vez de mascarar', async () => {
    vi.resetModules();
    vi.doMock('@/lib/abacatepay', () => ({
      getCheckout: vi.fn(),
      getCustomer: mockGetCustomer,
      ABACATEPAY_PRODUCT_ANNUALLY: '',
    }));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { intervalOf: semEnv } = await import('../lib/abacatepay-sync');

    // mesmo um checkout anual cai em 'month' — mas agora ruidosamente
    expect(semEnv(checkout({ items: [{ id: PROD_ANUAL, quantity: 1 }] }))).toBe('month');
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('ABACATEPAY_PRODUCT_ANNUALLY'));

    erro.mockRestore();
    vi.doUnmock('@/lib/abacatepay');
    vi.resetModules();
  });
});

describe('resolveEmail', () => {
  it('busca o e-mail no customer (o checkout não carrega e-mail)', async () => {
    expect(await resolveEmail(checkout())).toBe('pagante@example.com');
    expect(mockGetCustomer).toHaveBeenCalledWith('cust_1');
  });

  it('sem customerId não há e-mail resolvível', async () => {
    expect(await resolveEmail(checkout({ customerId: null }))).toBeNull();
    expect(mockGetCustomer).not.toHaveBeenCalled();
  });

  it('falha da API vira null em vez de estourar', async () => {
    mockGetCustomer.mockRejectedValue(new Error('boom'));
    expect(await resolveEmail(checkout())).toBeNull();
  });
});

describe('upsertSubscription', () => {
  function rowGravada() {
    return mockUpsert.mock.calls[0][0];
  }

  it('grava a assinatura paga como ativa, com provider e período', async () => {
    const res = await upsertSubscription(checkout());

    expect(res).toEqual({ userId: null, interval: 'month', status: 'active' });
    const row = rowGravada();
    expect(row.id).toBe('bill_1');
    expect(row.provider).toBe('abacatepay');
    expect(row.status).toBe('active');
    expect(row.abacatepay_customer_id).toBe('cust_1');
    expect(row.current_period_end).toBe('2026-08-20T00:00:00.000Z');
    expect(row.canceled_at).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(expect.anything(), { onConflict: 'id' });
  });

  it('A8: não escreve stripe_customer_id (coluna de outro provider)', async () => {
    await upsertSubscription(checkout());
    expect(rowGravada()).not.toHaveProperty('stripe_customer_id');
  });

  it('A1: disputa grava status revogado e NÃO mantém período em aberto', async () => {
    await upsertSubscription(checkout({ status: 'PAID' }), null, 'checkout.disputed');

    const row = rowGravada();
    expect(row.status).toBe('disputed');
    expect(row.current_period_end).toBeNull();
    expect(row.canceled_at).toBe('2026-07-20T00:00:00.000Z');
  });

  it('A1: cancelamento grava canceled mesmo com o checkout ainda PAID', async () => {
    await upsertSubscription(checkout({ status: 'PAID' }), null, 'subscription.cancelled');

    expect(rowGravada().status).toBe('canceled');
  });

  it('resolveUserId: metadata.supabase_user_id tem prioridade', async () => {
    const res = await upsertSubscription(
      checkout({ metadata: { supabase_user_id: 'user-meta' } }),
    );

    expect(res.userId).toBe('user-meta');
    expect(rowGravada().user_id).toBe('user-meta');
    // não precisou consultar a tabela de customers
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('resolveUserId: sem metadata, casa pelo customer salvo', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { user_id: 'user-da-tabela' } });

    const res = await upsertSubscription(checkout());

    expect(res.userId).toBe('user-da-tabela');
  });

  it('resolveUserId: fluxo pagamento-primeiro grava user_id nulo', async () => {
    const res = await upsertSubscription(checkout({ customerId: null }));
    expect(res.userId).toBeNull();
    expect(rowGravada().user_id).toBeNull();
  });

  it('emailOverride evita a chamada extra a /customers/get', async () => {
    await upsertSubscription(checkout(), 'informado@example.com');

    expect(rowGravada().email).toBe('informado@example.com');
    expect(mockGetCustomer).not.toHaveBeenCalled();
  });

  it('propaga erro do banco em vez de seguir em silêncio', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'falhou' } });

    await expect(upsertSubscription(checkout())).rejects.toBeDefined();
  });
});
