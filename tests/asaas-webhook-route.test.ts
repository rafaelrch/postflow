import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'token-de-webhook-com-mais-de-32-caracteres-ok';
/** Id do checkout (o `id` de POST /v3/checkouts, que volta como checkoutSession). */
const SESSION = '008a7f76-2ae2-4100-9652-65b7b2ded675';
const LEAD_ID = '3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

const {
  mockGetCustomer,
  mockEventInsert,
  mockEventUpdateEq,
  mockSubMaybeSingle,
  mockSubUpsert,
  mockRpc,
  mockRefMaybeSingle,
} = vi.hoisted(() => ({
  mockGetCustomer: vi.fn(),
  mockEventInsert: vi.fn(),
  mockEventUpdateEq: vi.fn(),
  mockSubMaybeSingle: vi.fn(),
  mockSubUpsert: vi.fn(),
  mockRpc: vi.fn(),
  mockRefMaybeSingle: vi.fn(),
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
      if (table === 'payment_checkout_refs') {
        return { select: () => ({ eq: () => ({ maybeSingle: mockRefMaybeSingle }) }) };
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
      // Como o Asaas manda de verdade: externalReference NULL (ele não propaga o
      // que enviamos na criação do checkout) e checkoutSession preenchido.
      externalReference: null,
      checkoutSession: SESSION,
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
  mockRefMaybeSingle.mockResolvedValue({ data: { lead_id: LEAD_ID }, error: null });
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

describe('POST /api/asaas/webhook — atribuição do lead (external_reference)', () => {
  // Este bloco existe por causa de um bug real: no primeiro pagamento em sandbox
  // tudo funcionou MENOS external_reference, que ficou NULL. Causa: o Asaas não
  // devolve o externalReference que mandamos no checkout — devolve
  // `checkoutSession`. A ponte é a payment_checkout_refs.
  it('resolve o lead por payment.checkoutSession', async () => {
    await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));

    expect(mockRefMaybeSingle).toHaveBeenCalled();
    expect(upsertedRow().external_reference).toBe(LEAD_ID);
  });

  it('resolve por subscription.checkoutSession quando não há objeto payment', async () => {
    mockSubMaybeSingle.mockResolvedValue({ data: { id: 'sub_1', user_id: null } });

    await POST(
      webhookRequest({
        id: 'evt_sub_1',
        event: 'SUBSCRIPTION_CREATED',
        subscription: {
          object: 'subscription',
          id: 'sub_1',
          customer: 'cus_1',
          status: 'ACTIVE',
          cycle: 'MONTHLY',
          externalReference: null,
          checkoutSession: SESSION,
        },
      }),
    );

    expect(upsertedRow().external_reference).toBe(LEAD_ID);
  });

  it('PREFERE externalReference quando ele vier preenchido — e nem consulta a ponte', async () => {
    // Hoje nunca vem, mas se o Asaas passar a mandar, a fonte direta ganha.
    await POST(
      webhookRequest(
        paymentEvent('PAYMENT_CONFIRMED', { externalReference: 'lead-vindo-do-asaas' }),
      ),
    );

    expect(upsertedRow().external_reference).toBe('lead-vindo-do-asaas');
    expect(mockRefMaybeSingle).not.toHaveBeenCalled();
  });

  it('sem NENHUMA pista: grava external_reference NULL, loga e não quebra', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(
      webhookRequest(
        paymentEvent('PAYMENT_CONFIRMED', { externalReference: null, checkoutSession: null }),
      ),
    );

    expect(res.status).toBe(200);
    // Nunca inventa: a coluna não é escrita, então continua NULL no banco.
    expect(upsertedRow().external_reference).toBeUndefined();
    expect(upsertedRow().status).toBe('active'); // o pagamento vale mais
    expect(err).toHaveBeenCalled();
  });

  it('checkoutSession sem linha na ponte: NULL, log, e o pagamento segue', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRefMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));

    expect(res.status).toBe(200);
    expect(upsertedRow().external_reference).toBeUndefined();
    expect(upsertedRow().status).toBe('active');
    expect(err).toHaveBeenCalled();
  });

  it('falha ao consultar a ponte não derruba o evento', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRefMaybeSingle.mockRejectedValue(new Error('db fora do ar'));

    const res = await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));

    expect(res.status).toBe(200);
    expect(upsertedRow().status).toBe('active');
    expect(mockEventUpdateEq).toHaveBeenCalled(); // evento concluído
  });

  it('não apaga o external_reference já gravado quando nada resolve', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRefMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSubMaybeSingle.mockResolvedValue({
      data: { id: 'sub_1', external_reference: 'lead-de-antes', user_id: null },
    });

    await POST(webhookRequest(paymentEvent('PAYMENT_CONFIRMED')));

    expect(upsertedRow().external_reference).toBe('lead-de-antes');
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
