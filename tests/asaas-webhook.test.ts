import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actionFor,
  allowanceFor,
  buildSubscriptionPatch,
  paymentConfirmationFor,
  extractContext,
  intervalFor,
  statusForAction,
  statusFromAsaasSubscription,
  verifyAccessToken,
  withResolvedLead,
  EVENT_ACTIONS,
} from '../lib/asaas-webhook';

const TOKEN = 'token-de-webhook-com-mais-de-32-caracteres-ok';

/** Envelope de evento de COBRANÇA, no formato da doc. */
function paymentEvent(event: string, payment: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    event,
    dateCreated: '2026-08-12 10:00:00',
    account: { id: 'acc_1', ownerId: null },
    payment: {
      object: 'payment',
      id: 'pay_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      value: 59.5,
      billingType: 'CREDIT_CARD',
      status: 'CONFIRMED',
      dueDate: '2026-08-12',
      ...payment,
    },
  };
}

/** Envelope de evento de ASSINATURA, no formato da doc. */
function subscriptionEvent(event: string, subscription: Record<string, unknown> = {}) {
  return {
    id: 'evt_2',
    event,
    dateCreated: '2026-08-12 10:00:00',
    subscription: {
      object: 'subscription',
      id: 'sub_1',
      customer: 'cus_1',
      value: 499,
      status: 'ACTIVE',
      cycle: 'YEARLY',
      billingType: 'CREDIT_CARD',
      nextDueDate: '2027-08-12',
      externalReference: 'lead-uuid',
      deleted: false,
      ...subscription,
    },
  };
}

beforeEach(() => {
  vi.stubEnv('ASAAS_WEBHOOK_TOKEN', TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('verifyAccessToken', () => {
  it('token correto passa', () => {
    expect(verifyAccessToken(TOKEN)).toBe('ok');
  });

  it('token errado é recusado', () => {
    expect(verifyAccessToken('errado')).toBe('unauthorized');
    // Mesmo tamanho, conteúdo diferente: exercita o timingSafeEqual de verdade
    // (tamanhos diferentes sairiam pelo atalho de comprimento).
    expect(verifyAccessToken('X'.repeat(TOKEN.length))).toBe('unauthorized');
  });

  it('token ausente é recusado', () => {
    expect(verifyAccessToken(null)).toBe('unauthorized');
    expect(verifyAccessToken(undefined)).toBe('unauthorized');
    expect(verifyAccessToken('')).toBe('unauthorized');
  });

  it('sem ASAAS_WEBHOOK_TOKEN configurada, NADA é aceito', () => {
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', '');
    expect(verifyAccessToken(TOKEN)).toBe('not_configured');
    expect(verifyAccessToken('qualquer-coisa')).toBe('not_configured');
  });
});

describe('mapeamento evento → ação', () => {
  it('⚠️ PAYMENT_CONFIRMED é o gatilho de liberação, NÃO PAYMENT_RECEIVED', () => {
    expect(actionFor('PAYMENT_CONFIRMED')).toBe('grant');
    expect(statusForAction(actionFor('PAYMENT_CONFIRMED'))).toBe('active');

    // RECEIVED chega ~32 dias depois no cartão. Se ele fosse o gatilho, todo
    // assinante de cartão ficaria um mês sem acesso.
    expect(actionFor('PAYMENT_RECEIVED')).toBe('confirm_receipt');
    expect(statusForAction(actionFor('PAYMENT_RECEIVED'))).toBeNull();
  });

  it('a tabela cobre exatamente os 10 eventos combinados', () => {
    expect(EVENT_ACTIONS).toEqual({
      PAYMENT_CONFIRMED: 'grant',
      PAYMENT_RECEIVED: 'confirm_receipt',
      PAYMENT_OVERDUE: 'past_due',
      PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'payment_failed',
      PAYMENT_REFUNDED: 'revoke',
      PAYMENT_CHARGEBACK_REQUESTED: 'revoke',
      SUBSCRIPTION_CREATED: 'sync',
      SUBSCRIPTION_UPDATED: 'sync',
      SUBSCRIPTION_INACTIVATED: 'end_of_cycle',
      SUBSCRIPTION_DELETED: 'end_of_cycle',
    });
  });

  it('PAYMENT_OVERDUE vira past_due (que o Asaas não tem para assinatura)', () => {
    expect(statusForAction(actionFor('PAYMENT_OVERDUE'))).toBe('past_due');
  });

  it('cartão recusado vira unpaid', () => {
    expect(statusForAction(actionFor('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'))).toBe('unpaid');
  });

  it('estorno e chargeback revogam', () => {
    expect(statusForAction(actionFor('PAYMENT_REFUNDED'))).toBe('canceled');
    expect(statusForAction(actionFor('PAYMENT_CHARGEBACK_REQUESTED'))).toBe('canceled');
  });

  it('evento fora da lista é ignorado', () => {
    expect(actionFor('PAYMENT_BANK_SLIP_VIEWED')).toBe('ignore');
    expect(actionFor('EVENTO_QUE_NAO_EXISTE')).toBe('ignore');
    expect(actionFor(null)).toBe('ignore');
    expect(actionFor(undefined)).toBe('ignore');
  });

  it('status cru da assinatura: desconhecido nunca vira acesso', () => {
    expect(statusFromAsaasSubscription('ACTIVE')).toBe('active');
    expect(statusFromAsaasSubscription('EXPIRED')).toBe('canceled');
    expect(statusFromAsaasSubscription('INACTIVE')).toBe('canceled');
    expect(statusFromAsaasSubscription('COISA_NOVA')).toBe('canceled');
    expect(statusFromAsaasSubscription(null)).toBe('canceled');
  });
});

describe('extractContext', () => {
  it('evento de cobrança: o id da ASSINATURA vem de payment.subscription', () => {
    const ctx = extractContext(paymentEvent('PAYMENT_CONFIRMED'));
    expect(ctx.subscriptionId).toBe('sub_1'); // não 'pay_1'
    expect(ctx.paymentId).toBe('pay_1');
    expect(ctx.customerId).toBe('cus_1');
    expect(ctx.eventId).toBe('evt_1');
    expect(ctx.action).toBe('grant');
    expect(ctx.rawStatus).toBe('CONFIRMED');
  });

  it('evento de assinatura: id e externalReference saem do objeto subscription', () => {
    const ctx = extractContext(subscriptionEvent('SUBSCRIPTION_UPDATED'));
    expect(ctx.subscriptionId).toBe('sub_1');
    expect(ctx.paymentId).toBeNull();
    expect(ctx.externalReference).toBe('lead-uuid');
    expect(ctx.cycle).toBe('YEARLY');
    expect(ctx.rawStatus).toBe('ACTIVE');
  });

  it('CAMPO NOVO no payload não quebra nada (parsing tolerante)', () => {
    const comCampoNovo = {
      ...paymentEvent('PAYMENT_CONFIRMED', { campoQueAsaasInventou: { a: [1, 2] } }),
      outroCampoRaiz: 'surpresa',
    };
    const ctx = extractContext(comCampoNovo);
    expect(ctx.subscriptionId).toBe('sub_1');
    expect(ctx.action).toBe('grant');
  });

  it('payload lixo não lança', () => {
    expect(() => extractContext(null)).not.toThrow();
    expect(() => extractContext('texto')).not.toThrow();
    expect(() => extractContext({ payment: 'nao-e-objeto' })).not.toThrow();
    expect(extractContext({}).action).toBe('ignore');
  });
});

describe('extractContext — checkoutSession', () => {
  // Medido no primeiro pagamento real em sandbox: o Asaas NÃO devolve o
  // externalReference que mandamos na criação do checkout, mas devolve o
  // checkoutSession (= o id do checkout) nos dois objetos.
  const SESSION = '008a7f76-2ae2-4100-9652-65b7b2ded675';

  it('lê checkoutSession do objeto payment', () => {
    const ctx = extractContext(
      paymentEvent('PAYMENT_CONFIRMED', { externalReference: null, checkoutSession: SESSION }),
    );
    expect(ctx.externalReference).toBeNull();
    expect(ctx.checkoutSession).toBe(SESSION);
  });

  it('lê checkoutSession do objeto subscription quando não há payment', () => {
    const ctx = extractContext(
      subscriptionEvent('SUBSCRIPTION_CREATED', {
        externalReference: null,
        checkoutSession: SESSION,
      }),
    );
    expect(ctx.checkoutSession).toBe(SESSION);
  });

  it('sem checkoutSession em lugar nenhum: null, sem lançar', () => {
    expect(extractContext(paymentEvent('PAYMENT_CONFIRMED')).checkoutSession).toBeNull();
    expect(extractContext(null).checkoutSession).toBeNull();
  });
});

describe('withResolvedLead', () => {
  const SESSION = '008a7f76-2ae2-4100-9652-65b7b2ded675';

  it('usa o lead resolvido pela ponte quando o evento não traz externalReference', () => {
    const ctx = extractContext(
      paymentEvent('PAYMENT_CONFIRMED', { externalReference: null, checkoutSession: SESSION }),
    );
    expect(withResolvedLead(ctx, 'lead-da-ponte').externalReference).toBe('lead-da-ponte');
  });

  it('PREFERE o externalReference do evento — a fonte direta ganha', () => {
    const ctx = extractContext(
      paymentEvent('PAYMENT_CONFIRMED', {
        externalReference: 'lead-do-asaas',
        checkoutSession: SESSION,
      }),
    );
    expect(withResolvedLead(ctx, 'lead-da-ponte').externalReference).toBe('lead-do-asaas');
  });

  it('sem nada resolvido, continua null — nunca inventa', () => {
    const ctx = extractContext(paymentEvent('PAYMENT_CONFIRMED', { externalReference: null }));
    expect(withResolvedLead(ctx, null).externalReference).toBeNull();
  });

  it('não muta o contexto recebido', () => {
    const ctx = extractContext(
      paymentEvent('PAYMENT_CONFIRMED', { externalReference: null, checkoutSession: SESSION }),
    );
    withResolvedLead(ctx, 'lead-da-ponte');
    expect(ctx.externalReference).toBeNull();
  });
});

describe('intervalFor', () => {
  it('cycle é a fonte preferencial', () => {
    expect(intervalFor({ cycle: 'YEARLY' })).toBe('year');
    expect(intervalFor({ cycle: 'MONTHLY' })).toBe('month');
  });

  it('sem cycle, o valor identifica o plano', () => {
    expect(intervalFor({ value: 499 })).toBe('year');
    expect(intervalFor({ value: 59.5 })).toBe('month');
  });

  it('sem cycle e sem valor, usa o que já está gravado', () => {
    expect(intervalFor({ value: 12.34, current: 'year' })).toBe('year');
  });

  it('sem nada, cai em month E LOGA (não pode passar calado)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(intervalFor({ subscriptionId: 'sub_x' })).toBe('month');
    expect(err).toHaveBeenCalled();
  });
});

describe('buildSubscriptionPatch', () => {
  const AGORA = new Date('2026-08-12T10:00:00.000Z');

  it('PAYMENT_CONFIRMED: active, com os dados da cobrança', () => {
    const ctx = extractContext(paymentEvent('PAYMENT_CONFIRMED'));
    const patch = buildSubscriptionPatch(ctx, null, AGORA);

    expect(patch).toMatchObject({
      id: 'sub_1',
      payment_provider: 'asaas',
      status: 'active',
      subscription_status: 'CONFIRMED',
      provider_customer_id: 'cus_1',
      provider_payment_id: 'pay_1',
      plan_interval: 'month',
      billing_type: 'CREDIT_CARD',
      value: 59.5,
      cancel_at_period_end: false,
      canceled_at: null,
      payment_confirmed_at: AGORA.toISOString(),
    });
  });

  it('só PAYMENT_CONFIRMED grava a prova; eventos de assinatura e cobrança não a inventam', () => {
    expect(paymentConfirmationFor('grant', AGORA)).toBe(AGORA.toISOString());
    for (const action of ['sync', 'confirm_receipt', 'past_due', 'payment_failed', 'revoke'] as const) {
      expect(paymentConfirmationFor(action, AGORA)).toBeNull();
    }

    const created = buildSubscriptionPatch(
      extractContext(subscriptionEvent('SUBSCRIPTION_CREATED')),
      null,
      AGORA,
    );
    expect(created).not.toHaveProperty('payment_confirmed_at');
  });

  it('é independente da ordem: pagamento primeiro grava prova e assinatura posterior não a apaga', () => {
    const confirmed = buildSubscriptionPatch(
      extractContext(paymentEvent('PAYMENT_CONFIRMED')),
      null,
      AGORA,
    );
    const subscriptionLater = buildSubscriptionPatch(
      extractContext(subscriptionEvent('SUBSCRIPTION_CREATED')),
      { status: 'active' },
      new Date('2026-08-15T12:00:05.000Z'),
    );

    expect(confirmed.payment_confirmed_at).toBe(AGORA.toISOString());
    // O upsert parcial não recebe null: preserva a prova já gravada.
    expect(subscriptionLater).not.toHaveProperty('payment_confirmed_at');
  });

  it('sequência normal: assinatura espera e PAYMENT_CONFIRMED posterior grava a prova', () => {
    const created = buildSubscriptionPatch(
      extractContext(subscriptionEvent('SUBSCRIPTION_CREATED')),
      null,
      AGORA,
    );
    const confirmed = buildSubscriptionPatch(
      extractContext(paymentEvent('PAYMENT_CONFIRMED')),
      { status: created.status as string },
      new Date('2026-08-15T12:05:00.000Z'),
    );

    expect(created).not.toHaveProperty('payment_confirmed_at');
    expect(confirmed.payment_confirmed_at).toBe('2026-08-15T12:05:00.000Z');
    expect(confirmed.status).toBe('active');
  });

  it('PAYMENT_RECEIVED NÃO altera status', () => {
    const ctx = extractContext(paymentEvent('PAYMENT_RECEIVED', { status: 'RECEIVED' }));
    const patch = buildSubscriptionPatch(ctx, { status: 'active' }, AGORA);

    expect(patch.status).toBeUndefined();
    // Mas registra a conciliação.
    expect(patch.subscription_status).toBe('RECEIVED');
    expect(patch.provider_payment_id).toBe('pay_1');
  });

  it('PAYMENT_OVERDUE => past_due', () => {
    const ctx = extractContext(paymentEvent('PAYMENT_OVERDUE', { status: 'OVERDUE' }));
    expect(buildSubscriptionPatch(ctx, { status: 'active' }, AGORA).status).toBe('past_due');
  });

  it('PAYMENT_REFUNDED e CHARGEBACK => canceled com canceled_at', () => {
    for (const evento of ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED']) {
      const ctx = extractContext(paymentEvent(evento));
      const patch = buildSubscriptionPatch(ctx, { status: 'active' }, AGORA);
      expect(patch.status).toBe('canceled');
      expect(patch.canceled_at).toBe(AGORA.toISOString());
    }
  });

  it('NUNCA apaga external_reference quando o evento não traz', () => {
    const ctx = extractContext(paymentEvent('PAYMENT_CONFIRMED'));
    expect(ctx.externalReference).toBeNull();

    const patch = buildSubscriptionPatch(ctx, { external_reference: 'lead-antigo' }, AGORA);
    expect(patch.external_reference).toBe('lead-antigo');
  });

  it('SUBSCRIPTION_DELETED com ciclo pago restante: mantém acesso, marca fim de ciclo', () => {
    const ctx = extractContext(subscriptionEvent('SUBSCRIPTION_DELETED', { status: 'INACTIVE' }));
    const patch = buildSubscriptionPatch(
      ctx,
      { status: 'active', current_period_end: '2026-09-12T10:00:00.000Z' },
      AGORA,
    );

    expect(patch.cancel_at_period_end).toBe(true);
    expect(patch.canceled_at).toBe(AGORA.toISOString());
    // Quem já pagou o mês fica com o mês.
    expect(patch.status).toBeUndefined();
  });

  it('SUBSCRIPTION_DELETED sem ciclo pago restante: corta agora', () => {
    // nextDueDate no PASSADO de propósito: o evento é a fonte mais fresca do
    // fim do período (ver periodEndFor), então deixá-lo no futuro do fixture
    // descreveria uma assinatura que AINDA tem ciclo pago — o oposto do caso.
    const ctx = extractContext(subscriptionEvent('SUBSCRIPTION_DELETED', { nextDueDate: '2026-06-30' }));
    const patch = buildSubscriptionPatch(
      ctx,
      { status: 'active', current_period_end: '2026-07-01T00:00:00.000Z' },
      AGORA,
    );
    expect(patch.status).toBe('canceled');
    expect(patch.cancel_at_period_end).toBe(true);
  });

  /**
   * O BUG DA FASE 16, e o motivo deste bloco existir.
   *
   * `current_period_end` nunca era gravado por ninguém: a data do fim do ciclo
   * só existia em `next_due_date`. Com a coluna sempre nula, o ramo
   * 'end_of_cycle' lia NaN, concluía "não sobrou ciclo pago" e CORTAVA O ACESSO
   * NA HORA — revertendo em silêncio a regra que ele deveria implementar. Quem
   * tinha pago o mês perdia o mês ao cancelar.
   *
   * O traço no lugar da data em /conta era só a parte visível disso.
   */
  describe('current_period_end — a fonte única do fim do período pago', () => {
    it('⚠️ end_of_cycle NÃO corta acesso de quem tem ciclo pago restante', () => {
      // Linha legada: gravada antes do conserto, com current_period_end nulo.
      // Este é exatamente o estado de TODAS as assinaturas em produção hoje.
      const ctx = extractContext(
        subscriptionEvent('SUBSCRIPTION_DELETED', {
          status: 'INACTIVE',
          nextDueDate: '2026-09-14',
        }),
      );
      const patch = buildSubscriptionPatch(ctx, { status: 'active', current_period_end: null }, AGORA);

      expect(patch.cancel_at_period_end).toBe(true);
      // O que não pode acontecer de jeito nenhum: virar 'canceled' agora.
      expect(patch.status).toBeUndefined();
      // E a data passa a existir, que é o que a tela mostra.
      expect(patch.current_period_end).toBe(new Date('2026-09-14T23:59:59.999-03:00').toISOString());
    });

    it('evento de assinatura: o fim do período é o nextDueDate, até o fim do dia em Brasília', () => {
      const ctx = extractContext(subscriptionEvent('SUBSCRIPTION_UPDATED', { nextDueDate: '2026-09-14' }));
      const patch = buildSubscriptionPatch(ctx, null, AGORA);

      expect(patch.current_period_end).toBe(new Date('2026-09-14T23:59:59.999-03:00').toISOString());
      // O eco cru do provedor continua onde sempre esteve.
      expect(patch.next_due_date).toBe('2026-09-14');
    });

    it('PAYMENT_CONFIRMED: pagar a cobrança de hoje compra UM CICLO à frente', () => {
      const ctx = extractContext(paymentEvent('PAYMENT_CONFIRMED', { dueDate: '2026-08-14' }));
      const patch = buildSubscriptionPatch(ctx, null, AGORA);

      // Mensal (value 59,50): 14/08 pago ⇒ acesso até 14/09.
      expect(patch.current_period_end).toBe(new Date('2026-09-14T23:59:59.999-03:00').toISOString());
    });

    it('PAYMENT_CONFIRMED anual soma um ano, e o fim do mês não estoura', () => {
      const anual = extractContext(
        paymentEvent('PAYMENT_CONFIRMED', { dueDate: '2026-08-14', value: 499 }),
      );
      expect(buildSubscriptionPatch(anual, null, AGORA).current_period_end).toBe(
        new Date('2027-08-14T23:59:59.999-03:00').toISOString(),
      );

      // 31/01 + 1 mês não existe: fica no último dia de fevereiro, nunca em março.
      const mensal = extractContext(paymentEvent('PAYMENT_CONFIRMED', { dueDate: '2027-01-31' }));
      expect(buildSubscriptionPatch(mensal, null, AGORA).current_period_end).toBe(
        new Date('2027-02-28T23:59:59.999-03:00').toISOString(),
      );
    });

    it('cobrança que NÃO libera acesso não mexe no fim do período', () => {
      // O vencimento de uma cobrança vencida/estornada não compra ciclo nenhum:
      // somar um mês aqui daria acesso de graça a quem não pagou.
      for (const evento of ['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED']) {
        const ctx = extractContext(paymentEvent(evento, { dueDate: '2026-08-14' }));
        expect(buildSubscriptionPatch(ctx, { status: 'active' }, AGORA)).not.toHaveProperty(
          'current_period_end',
        );
      }
    });

    it('o fim do período só AVANÇA: evento atrasado não encurta ciclo já pago', () => {
      // O nextDueDate de SUBSCRIPTION_CREATED é o dia da PRIMEIRA cobrança
      // (ainda não paga). Reentregue depois do pagamento, ele puxaria a data
      // para trás e cortaria o acesso de quem já pagou.
      const ctx = extractContext(subscriptionEvent('SUBSCRIPTION_CREATED', { nextDueDate: '2026-08-14' }));
      const patch = buildSubscriptionPatch(
        ctx,
        { status: 'active', current_period_end: '2026-09-14T23:59:59.999-03:00' },
        AGORA,
      );

      expect(patch).not.toHaveProperty('current_period_end');
    });

    it('sem data nenhuma no evento, NÃO inventa data', () => {
      const ctx = extractContext(subscriptionEvent('SUBSCRIPTION_UPDATED', { nextDueDate: null }));
      expect(buildSubscriptionPatch(ctx, null, AGORA)).not.toHaveProperty('current_period_end');
    });
  });

  it('SUBSCRIPTION_UPDATED reflete o status cru da assinatura', () => {
    const ativo = extractContext(subscriptionEvent('SUBSCRIPTION_UPDATED'));
    expect(buildSubscriptionPatch(ativo, null, AGORA).status).toBe('active');

    const expirado = extractContext(subscriptionEvent('SUBSCRIPTION_UPDATED', { status: 'EXPIRED' }));
    expect(buildSubscriptionPatch(expirado, null, AGORA).status).toBe('canceled');
  });
});

describe('allowanceFor', () => {
  it('espelha plan_allowance do banco: 200 mensal, 300 anual', () => {
    expect(allowanceFor('month')).toBe(200);
    expect(allowanceFor('year')).toBe(300);
  });
});
