import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'token-de-webhook-com-mais-de-32-caracteres-ok';

const {
  mockGetCustomer,
  mockEventInsert,
  mockEventUpdateEq,
  mockSubMaybeSingle,
  mockSubUpsert,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetCustomer: vi.fn(),
  mockEventInsert: vi.fn(),
  mockEventUpdateEq: vi.fn(),
  mockSubMaybeSingle: vi.fn(),
  mockSubUpsert: vi.fn(),
  mockRpc: vi.fn(),
}));

// Relativo ao ARQUIVO DE TESTE — mesmo módulo que a rota importa como
// '../../../../lib/asaas/customers'.
vi.mock('../lib/asaas/customers', () => ({ getCustomer: mockGetCustomer }));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'payment_webhook_events') {
        return {
          insert: mockEventInsert,
          update: () => ({ eq: mockEventUpdateEq }),
        };
      }
      // subscriptions
      return {
        select: () => ({ eq: () => ({ maybeSingle: mockSubMaybeSingle }) }),
        upsert: mockSubUpsert,
      };
    },
    rpc: mockRpc,
  }),
}));

import { POST } from '../app/api/asaas/webhook/route';

function webhookRequest(body: unknown, token: string | null = TOKEN) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    text: async () => raw,
    headers: {
      get: (h: string) => (h === 'asaas-access-token' ? token : null),
    },
  } as unknown as Parameters<typeof POST>[0];
}

function paymentEvent(event: string, over: Record<string, unknown> = {}, eventId = 'evt_1') {
  return {
    id: eventId,
    event,
    dateCreated: '2026-08-12 10:00:00',
    payment: {
      object: 'payment',
      id: 'pay_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      value: 59.5,
      billingType: 'CREDIT_CARD',
      status: 'CONFIRMED',
      ...over,
    },
  };
}

/** Última linha passada ao upsert de subscriptions. */
function upsertedRow() {
  return mockSubUpsert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubEnv('ASAAS_WEBHOOK_TOKEN', TOKEN);
  mockEventInsert.mockResolvedValue({ error: null });
  mockEventUpdateEq.mockResolvedValue({ error: null });
  mockSubMaybeSingle.mockResolvedValue({ data: null });
  mockSubUpsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ error: null });
  mockGetCustomer.mockResolvedValue({ id: 'cus_1', email: 'pagador@test.com' });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('POST /api/asaas/webhook — autenticação', () => {
  it('token correto processa', async () => {
    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(res.status).toBe(200);
    expect(mockSubUpsert).toHaveBeenCalledTimes(1);
  });

  it('token errado => 401 e NADA é processado', async () => {
    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED'), 'token-errado'));
    expect(res.status).toBe(401);
    expect(mockEventInsert).not.toHaveBeenCalled();
    expect(mockSubUpsert).not.toHaveBeenCalled();
  });

  it('token ausente => 401 e NADA é processado', async () => {
    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED'), null));
    expect(res.status).toBe(401);
    expect(mockSubUpsert).not.toHaveBeenCalled();
  });

  it('ASAAS_WEBHOOK_TOKEN não configurada => 500 e NADA é processado', async () => {
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(res.status).toBe(500);
    expect(mockEventInsert).not.toHaveBeenCalled();
    expect(mockSubUpsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/asaas/webhook — idempotência', () => {
  it('grava o evento ANTES de processar', async () => {
    const ordem: string[] = [];
    mockEventInsert.mockImplementation(async () => {
      ordem.push('evento');
      return { error: null };
    });
    mockSubUpsert.mockImplementation(async () => {
      ordem.push('assinatura');
      return { error: null };
    });

    await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(ordem).toEqual(['evento', 'assinatura']);
  });

  it('MESMO evento entregue DUAS VEZES: o segundo é ignorado e responde 2xx', async () => {
    const evento = paymentEvent('PAYMENT_CONFIRMED');

    const primeira = await POST(webhookRequest(evento));
    expect(primeira.status).toBe(200);
    expect(mockSubUpsert).toHaveBeenCalledTimes(1);

    // Segunda entrega: a PK de payment_webhook_events colide.
    mockEventInsert.mockResolvedValue({ error: { code: '23505' } });

    const segunda = await POST(webhookRequest(evento));
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toMatchObject({ received: true, duplicate: true });
    // NÃO reprocessou: continua 1.
    expect(mockSubUpsert).toHaveBeenCalledTimes(1);
  });

  it('marca processed_at só DEPOIS do sucesso', async () => {
    await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(mockEventUpdateEq).toHaveBeenCalledTimes(1);
  });

  it('se o processamento falha, processed_at NÃO é marcado (fica o rastro)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSubUpsert.mockResolvedValue({ error: { message: 'db down' } });

    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(res.status).toBe(200); // não pode penalizar a fila
    expect(mockEventUpdateEq).not.toHaveBeenCalled();
  });
});

describe('POST /api/asaas/webhook — efeitos no banco', () => {
  it('PAYMENT_CONFIRMED cria a assinatura com user_id NULL e status active', async () => {
    await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));

    const row = upsertedRow();
    expect(row).toMatchObject({
      id: 'sub_1',
      payment_provider: 'asaas',
      status: 'active',
      provider_customer_id: 'cus_1',
      provider_payment_id: 'pay_1',
    });
    // Pagamento-primeiro: a conta ainda não existe, então o webhook NÃO
    // inventa dono. Não escrever a coluna preserva o NULL do banco.
    expect(row.user_id).toBeUndefined();
  });

  it('usa o e-mail do CUSTOMER do Asaas, não o que estava gravado do lead', async () => {
    mockSubMaybeSingle.mockResolvedValue({
      data: { id: 'sub_1', email: 'digitado-no-popup@test.com', user_id: null },
    });
    mockGetCustomer.mockResolvedValue({ id: 'cus_1', email: 'QuemPagou@Test.com' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));

    expect(mockGetCustomer).toHaveBeenCalledWith('cus_1');
    // Normalizado e vindo do PAGADOR.
    expect(upsertedRow().email).toBe('quempagou@test.com');
    // Divergência precisa aparecer no log.
    expect(warn).toHaveBeenCalled();
  });

  it('falha ao buscar o customer não derruba o evento', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetCustomer.mockRejectedValue(new Error('asaas fora do ar'));

    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(res.status).toBe(200);
    // A assinatura ainda é gravada, só sem e-mail.
    expect(upsertedRow().status).toBe('active');
  });

  it('PAYMENT_RECEIVED NÃO é o gatilho de liberação', async () => {
    await POST(webhookRequest(paymentEvent('PAYMENT_RECEIVED', { status: 'RECEIVED' })));
    expect(upsertedRow().status).toBeUndefined();
  });

  it('PAYMENT_OVERDUE => past_due', async () => {
    await POST(webhookRequest(paymentEvent('PAYMENT_OVERDUE', { status: 'OVERDUE' })));
    expect(upsertedRow().status).toBe('past_due');
  });

  it('PAYMENT_REFUNDED => revoga', async () => {
    await POST(webhookRequest(paymentEvent('PAYMENT_REFUNDED')));
    expect(upsertedRow().status).toBe('canceled');
  });

  it('PAYMENT_CHARGEBACK_REQUESTED => revoga', async () => {
    await POST(webhookRequest(paymentEvent('PAYMENT_CHARGEBACK_REQUESTED')));
    expect(upsertedRow().status).toBe('canceled');
  });

  it('SUBSCRIPTION_DELETED encerra', async () => {
    mockSubMaybeSingle.mockResolvedValue({
      data: { id: 'sub_1', status: 'active', current_period_end: null, user_id: null },
    });

    await POST(
      webhookRequest({
        id: 'evt_sub',
        event: 'SUBSCRIPTION_DELETED',
        subscription: { object: 'subscription', id: 'sub_1', customer: 'cus_1', status: 'INACTIVE', cycle: 'MONTHLY' },
      }),
    );

    const row = upsertedRow();
    expect(row.cancel_at_period_end).toBe(true);
    expect(row.status).toBe('canceled');
  });

  it('renovação com dono recarrega créditos (reset=true)', async () => {
    mockSubMaybeSingle.mockResolvedValue({
      data: { id: 'sub_1', status: 'active', user_id: 'user-1', plan_interval: 'year' },
    });

    await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED', { value: 499 })));

    expect(mockRpc).toHaveBeenCalledWith('refresh_credits', {
      p_user: 'user-1',
      p_allowance: 300,
      p_reset: true,
    });
  });

  it('primeiro pagamento (sem dono) NÃO chama refresh_credits', async () => {
    await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('falha do refresh_credits não derruba o evento', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSubMaybeSingle.mockResolvedValue({ data: { id: 'sub_1', user_id: 'user-1' } });
    mockRpc.mockResolvedValue({ error: { message: 'invalid_credit_allowance' } });

    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(res.status).toBe(200);
    expect(mockEventUpdateEq).toHaveBeenCalled(); // evento concluído
  });
});

describe('POST /api/asaas/webhook — tolerância', () => {
  it('evento desconhecido => 2xx, nada quebra, nada é gravado', async () => {
    const res = await POST(webhookRequest(paymentEvent('PAYMENT_BANK_SLIP_VIEWED')));
    expect(res.status).toBe(200);
    expect(mockSubUpsert).not.toHaveBeenCalled();
    // Mas o evento fica registrado.
    expect(mockEventInsert).toHaveBeenCalled();
  });

  it('payload com campo novo/inesperado => 2xx e processa normalmente', async () => {
    const res = await POST(
      webhookRequest({
        ...paymentEvent('PAYMENT_CONFIRMED', { campoNovoDoAsaas: { x: 1 } }),
        outraChaveRaiz: ['surpresa'],
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertedRow().status).toBe('active');
  });

  it('cobrança avulsa (sem subscription) => 2xx sem gravar assinatura', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED', { subscription: null })));
    expect(res.status).toBe(200);
    expect(mockSubUpsert).not.toHaveBeenCalled();
  });

  it('erro de regra de negócio => 2xx (não pode pausar a fila do Asaas)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSubMaybeSingle.mockRejectedValue(new Error('boom'));

    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, processed: false });
  });

  it('JSON inválido => 400 (corpo ilegível não é reentregável)', async () => {
    const res = await POST(webhookRequest('{isso nao e json'));
    expect(res.status).toBe(400);
    expect(mockEventInsert).not.toHaveBeenCalled();
  });
});
