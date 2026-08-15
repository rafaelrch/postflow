import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractContext } from '../lib/asaas-webhook';
import { decideReconciliation, runReconciliation } from '../lib/asaas-reconciliation';

/**
 * RECONCILIAÇÃO DE EVENTOS PENDENTES — o caminho do dinheiro.
 *
 * O cenário que estes testes existem para cobrir não é o evento pendente de
 * 14/08 (aquele é inofensivo: o produto já tinha cancelado antes). É o outro:
 * o Rafael cancela a assinatura de um cliente NO PAINEL DO ASAAS, o webhook é
 * o único canal, ele fica pendente, e a assinatura continua parecendo ativa
 * depois do fim do período — com acesso de graça e MRR inflado.
 *
 * As duas regras duras, que aparecem como asserção em quase todo caso abaixo:
 *   • cancelamento NÃO é revogação — o acesso vai até `current_period_end`;
 *   • NADA revoga acesso automaticamente — o que não dá para resolver com
 *     segurança fica pendente e vira alerta.
 */

const AGORA = new Date('2026-08-15T18:00:00.000Z');
const FIM_FUTURO = '2026-09-12T02:59:59.999Z';
const FIM_PASSADO = '2026-07-12T02:59:59.999Z';

function eventoDelecao(subscriptionId = 'sub_1', status = 'INACTIVE') {
  return {
    id: 'evt_del',
    event: 'SUBSCRIPTION_DELETED',
    subscription: { id: subscriptionId, status, nextDueDate: '2026-09-12' },
  };
}

function ctxDe(payload: unknown) {
  return extractContext(payload);
}

describe('decideReconciliation — SUBSCRIPTION_DELETED vindo do painel do Asaas', () => {
  it('registra o cancelamento e NÃO derruba o status: o acesso pago continua', () => {
    const decisao = decideReconciliation(
      ctxDe(eventoDelecao()),
      { id: 'sub_1', status: 'active', cancel_at_period_end: false, canceled_at: null, current_period_end: FIM_FUTURO },
      AGORA,
    );

    expect(decisao.kind).toBe('reconcile');
    if (decisao.kind !== 'reconcile') return;
    expect(decisao.patch.cancel_at_period_end).toBe(true);
    expect(decisao.patch.canceled_at).toBe(AGORA.toISOString());
    // ⚠️ O CORAÇÃO DA REGRA: nada de `status`, nada de encurtar o período.
    expect(decisao.patch).not.toHaveProperty('status');
    expect(decisao.patch).not.toHaveProperty('current_period_end');
  });

  it('período JÁ VENCIDO também não revoga — quem corta cliente é o Rafael', () => {
    const decisao = decideReconciliation(
      ctxDe(eventoDelecao()),
      { id: 'sub_1', status: 'active', cancel_at_period_end: false, canceled_at: null, current_period_end: FIM_PASSADO },
      AGORA,
    );

    expect(decisao.kind).toBe('reconcile');
    if (decisao.kind !== 'reconcile') return;
    // O caso "ativa depois do período pago" fica visível no alerta
    // cancellation_not_reflected, que é onde a decisão humana acontece.
    expect(decisao.patch).not.toHaveProperty('status');
  });

  it('assinatura já cancelada localmente NÃO é alterada', () => {
    const decisao = decideReconciliation(
      ctxDe(eventoDelecao()),
      {
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: true,
        canceled_at: '2026-08-14T17:05:00.000Z',
        current_period_end: FIM_FUTURO,
      },
      AGORA,
    );

    // Este é literalmente o evento pendente de 14/08: o cancelamento pelo
    // produto rodou 9,7s antes. Reprocessar não pode reescrever a data.
    expect(decisao).toEqual({ kind: 'already_reconciled' });
  });

  it('status já canceled não é revertido nem reescrito', () => {
    const decisao = decideReconciliation(
      ctxDe(eventoDelecao()),
      { id: 'sub_1', status: 'canceled', cancel_at_period_end: true, canceled_at: '2026-08-01T00:00:00Z', current_period_end: FIM_PASSADO },
      AGORA,
    );
    expect(decisao).toEqual({ kind: 'already_reconciled' });
  });

  it('SUBSCRIPTION_UPDATED com status não-ACTIVE carrega a mesma notícia', () => {
    const decisao = decideReconciliation(
      ctxDe({ id: 'e', event: 'SUBSCRIPTION_UPDATED', subscription: { id: 'sub_1', status: 'EXPIRED' } }),
      { id: 'sub_1', status: 'active', cancel_at_period_end: false, canceled_at: null, current_period_end: FIM_FUTURO },
      AGORA,
    );
    expect(decisao.kind).toBe('reconcile');
  });

  it('SUBSCRIPTION_UPDATED ainda ACTIVE não é reconciliável', () => {
    const decisao = decideReconciliation(
      ctxDe({ id: 'e', event: 'SUBSCRIPTION_UPDATED', subscription: { id: 'sub_1', status: 'ACTIVE' } }),
      { id: 'sub_1', status: 'active', cancel_at_period_end: false, canceled_at: null, current_period_end: FIM_FUTURO },
      AGORA,
    );
    expect(decisao).toEqual({ kind: 'skip', reason: 'unsafe_to_replay' });
  });
});

describe('decideReconciliation — o que ela se recusa a fazer', () => {
  it('PAYMENT_CONFIRMED atrasado NÃO é reaplicado: fica pendente e vira alerta', () => {
    const decisao = decideReconciliation(
      ctxDe({ id: 'e', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', subscription: 'sub_1', dueDate: '2026-08-12' } }),
      { id: 'sub_1', status: 'active', current_period_end: FIM_FUTURO },
      AGORA,
    );
    // Reaplicar concessão de acesso e recarga de crédito a partir de um evento
    // velho é o tipo de "conserto" que cria o problema seguinte.
    expect(decisao).toEqual({ kind: 'skip', reason: 'unsafe_to_replay' });
  });

  it('estorno e chargeback também ficam para decisão humana', () => {
    for (const event of ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_OVERDUE']) {
      const decisao = decideReconciliation(
        ctxDe({ id: 'e', event, payment: { id: 'p', subscription: 'sub_1' } }),
        { id: 'sub_1', status: 'active' },
        AGORA,
      );
      expect(decisao).toEqual({ kind: 'skip', reason: 'unsafe_to_replay' });
    }
  });

  it('assinatura inexistente no nosso banco não é criada', () => {
    const decisao = decideReconciliation(ctxDe(eventoDelecao('sub_fantasma')), null, AGORA);
    expect(decisao).toEqual({ kind: 'skip', reason: 'subscription_missing' });
  });

  it('evento de assinatura sem id não tem o que reconciliar', () => {
    const decisao = decideReconciliation(
      ctxDe({ id: 'e', event: 'SUBSCRIPTION_DELETED', subscription: { status: 'INACTIVE' } }),
      null,
      AGORA,
    );
    expect(decisao).toEqual({ kind: 'skip', reason: 'no_subscription_id' });
  });

  it('evento fora da nossa lista se conclui sem efeito', () => {
    expect(decideReconciliation(ctxDe({ id: 'e', event: 'PAYMENT_UPDATED' }), null, AGORA))
      .toEqual({ kind: 'noop' });
  });
});

// ─── Execução com um Supabase de mentira ────────────────────

type Linha = Record<string, unknown>;

/**
 * Banco falso mínimo, com estado de verdade: é ele que permite provar
 * IDEMPOTÊNCIA rodando a reconciliação duas vezes seguidas sobre o mesmo dado.
 */
function fakeAdmin(state: { events: Linha[]; subscriptions: Linha[] }) {
  const updates: { table: string; patch: Linha }[] = [];

  function tabela(nome: string) {
    const alvo = nome === 'payment_webhook_events' ? state.events : state.subscriptions;

    return {
      select() {
        const q = {
          _filtros: [] as ((linha: Linha) => boolean)[],
          is(coluna: string, valor: null) {
            q._filtros.push((linha) => (linha[coluna] ?? null) === valor);
            return q;
          },
          eq(coluna: string, valor: unknown) {
            q._filtros.push((linha) => linha[coluna] === valor);
            return q;
          },
          order() { return q; },
          limit() {
            return Promise.resolve({ data: alvo.filter((l) => q._filtros.every((f) => f(l))), error: null });
          },
          maybeSingle() {
            const achou = alvo.find((l) => q._filtros.every((f) => f(l))) ?? null;
            return Promise.resolve({ data: achou, error: null });
          },
        };
        return q;
      },
      update(patch: Linha) {
        const q = {
          _filtros: [] as ((linha: Linha) => boolean)[],
          eq(coluna: string, valor: unknown) {
            q._filtros.push((linha) => linha[coluna] === valor);
            return q;
          },
          is(coluna: string, valor: null) {
            q._filtros.push((linha) => (linha[coluna] ?? null) === valor);
            return q;
          },
          then(resolve: (r: { error: null }) => void) {
            for (const linha of alvo) {
              if (q._filtros.every((f) => f(linha))) {
                Object.assign(linha, patch);
                updates.push({ table: nome, patch });
              }
            }
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        // `eq` precisa devolver algo aguardável quando é o último elo.
        return q;
      },
    };
  }

  return {
    client: { from: (nome: string) => tabela(nome) } as unknown as SupabaseClient,
    updates,
  };
}

function estadoComPendente(overrides: Linha = {}) {
  return {
    events: [
      {
        event_id: 'evt_5dbdd3e48f06e3fd744ba0e8e6abd53a',
        event_type: 'SUBSCRIPTION_DELETED',
        payload: eventoDelecao('sub_1'),
        received_at: '2026-08-14T17:05:00.000Z',
        processed_at: null,
      },
    ],
    subscriptions: [
      {
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        current_period_end: FIM_FUTURO,
        ...overrides,
      },
    ],
  };
}

describe('runReconciliation', () => {
  it('um evento pendente concilia e sai da fila', async () => {
    const state = estadoComPendente();
    const { client } = fakeAdmin(state);

    const resumo = await runReconciliation(client, { now: AGORA });

    expect(resumo).toMatchObject({ scanned: 1, reconciled: 1, alreadyReconciled: 0, failed: 0 });
    expect(resumo.skipped).toEqual([]);
    expect(state.subscriptions[0].cancel_at_period_end).toBe(true);
    expect(state.subscriptions[0].canceled_at).toBe(AGORA.toISOString());
    // Acesso preservado: nem o status nem o fim do período foram tocados.
    expect(state.subscriptions[0].status).toBe('active');
    expect(state.subscriptions[0].current_period_end).toBe(FIM_FUTURO);
    expect(state.events[0].processed_at).toBe(AGORA.toISOString());
  });

  it('rodar DUAS VEZES não duplica efeito nem move a data do cancelamento', async () => {
    const state = estadoComPendente();
    const { client } = fakeAdmin(state);

    await runReconciliation(client, { now: AGORA });
    const depoisDaPrimeira = { ...state.subscriptions[0] };

    const segunda = await runReconciliation(client, { now: new Date('2026-08-20T10:00:00Z') });

    // O evento já saiu da fila: a segunda passada não tem o que ler.
    expect(segunda).toMatchObject({ scanned: 0, reconciled: 0, failed: 0 });
    expect(state.subscriptions[0]).toEqual(depoisDaPrimeira);
  });

  it('mesmo com o evento reaberto, reprocessar não reescreve o cancelamento', async () => {
    // Simula a reentrega do Asaas: mesmo evento, pendente de novo, com a
    // assinatura já reconciliada. Nada pode mudar.
    const state = estadoComPendente({ cancel_at_period_end: true, canceled_at: '2026-08-14T17:05:00.000Z' });
    const { client, updates } = fakeAdmin(state);

    const resumo = await runReconciliation(client, { now: AGORA });

    expect(resumo).toMatchObject({ scanned: 1, reconciled: 0, alreadyReconciled: 1 });
    expect(state.subscriptions[0].canceled_at).toBe('2026-08-14T17:05:00.000Z');
    expect(state.subscriptions[0].status).toBe('active');
    // Nenhum write em subscriptions — só o carimbo do evento.
    expect(updates.filter((u) => u.table === 'subscriptions')).toHaveLength(0);
  });

  it('o que ela não sabe resolver CONTINUA pendente, para virar alerta', async () => {
    const state = {
      events: [
        {
          event_id: 'evt_pag',
          event_type: 'PAYMENT_CONFIRMED',
          payload: { id: 'evt_pag', event: 'PAYMENT_CONFIRMED', payment: { id: 'p', subscription: 'sub_1' } },
          received_at: '2026-08-14T17:00:00.000Z',
          processed_at: null,
        },
      ],
      subscriptions: [{ id: 'sub_1', status: 'active', current_period_end: FIM_FUTURO }],
    };
    const { client, updates } = fakeAdmin(state);

    const resumo = await runReconciliation(client, { now: AGORA });

    expect(resumo.skipped).toEqual([{ eventId: 'evt_pag', reason: 'unsafe_to_replay' }]);
    // Continua com processed_at nulo DE PROPÓSITO: é o que a Saúde lê.
    expect(state.events[0].processed_at).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it('falha ao ler a fila não lança — devolve resumo com falha', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const quebrado = {
      from: () => ({
        select: () => ({ is: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }),
      }),
    } as unknown as SupabaseClient;

    const resumo = await runReconciliation(quebrado, { now: AGORA });
    expect(resumo).toMatchObject({ scanned: 0, reconciled: 0, failed: 1 });
    erro.mockRestore();
  });
});
