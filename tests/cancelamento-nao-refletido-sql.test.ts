import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * O alerta "cancelamento não refletido", rodando de verdade no Postgres.
 *
 * Ele é o par do `stale_webhook`, e a diferença entre os dois é a razão de
 * existirem separados:
 *   • stale_webhook            → o evento chegou e não processou;
 *   • cancellation_not_reflected → o Asaas diz cancelado e o nosso banco não
 *     sabe. É este que infla o MRR e mantém acesso depois do período pago.
 *
 * Uma assinatura pode ter evento pendente sem nenhuma consequência (foi o caso
 * de 14/08), e pode divergir com todos os eventos processados. Por isso os
 * casos abaixo cobrem as duas metades separadamente.
 */

const migration = readFileSync(
  new URL('../supabase/migrations/20260815e_cancellation_not_reflected_check.sql', import.meta.url),
  'utf8',
);

const AGORA = '2026-08-15T18:00:00Z';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.subscriptions(
      id text primary key, email text, status text,
      cancel_at_period_end boolean, canceled_at timestamptz, current_period_end timestamptz
    );
    create table public.payment_webhook_events(
      event_id text primary key, event_type text, payload jsonb,
      received_at timestamptz, processed_at timestamptz
    );
  `);
  await db.exec(migration);
});

afterAll(async () => db?.close?.());

async function evento(eventId: string, subscriptionId: string, opts: { type?: string; processed?: boolean } = {}) {
  await db.query(
    `insert into public.payment_webhook_events values($1,$2,jsonb_build_object('subscription',jsonb_build_object('id',$3::text)),'2026-08-14T17:05:00Z',$4::timestamptz)`,
    [eventId, opts.type ?? 'SUBSCRIPTION_DELETED', subscriptionId, opts.processed ? AGORA : null],
  );
}

async function assinatura(id: string, row: {
  status: string; cancel?: boolean | null; canceledAt?: string | null; periodEnd?: string | null;
}) {
  await db.query(
    'insert into public.subscriptions values($1,$2,$3,$4,$5,$6)',
    [id, `${id}@test.com`, row.status, row.cancel ?? false, row.canceledAt ?? null, row.periodEnd ?? null],
  );
}

async function check() {
  const { rows } = await db.query<{ r: Record<string, unknown> }>(
    `select public.admin_health_cancellation_check('cancellation_not_reflected',$1::timestamptz,20) as r`,
    [AGORA],
  );
  return rows[0].r as { count: number; severity: string; rows: { record_key: string; detail: string }[] };
}

async function limpar() {
  await db.exec('delete from public.payment_webhook_events; delete from public.subscriptions;');
}

describe('admin_health_cancellation_check', () => {
  it('chave desconhecida falha alto em vez de devolver zero', async () => {
    await expect(db.query(`select public.admin_health_cancellation_check('inexistente')`)).rejects.toThrow();
  });

  it('cancelado no Asaas e ainda renovando aqui → alerta', async () => {
    await limpar();
    await assinatura('sub_1', { status: 'active', cancel: false, periodEnd: '2026-09-12T02:59:59Z' });
    await evento('evt_1', 'sub_1', { processed: true });

    const r = await check();
    expect(r.count).toBe(1);
    expect(r.rows[0].record_key).toBe('sub_1');
    expect(r.rows[0].detail).toMatch(/renovação ainda ligada/i);
    // Ainda tem período pago à frente: é sério, mas não é o caso caro.
    expect(r.severity).toBe('high');
  });

  it('evento de cancelamento ainda pendente aparece com detalhe próprio', async () => {
    await limpar();
    await assinatura('sub_2', { status: 'active', cancel: false, periodEnd: '2026-09-12T02:59:59Z' });
    await evento('evt_2', 'sub_2');

    const r = await check();
    expect(r.count).toBe(1);
    expect(r.rows[0].detail).toMatch(/evento ainda pendente/i);
  });

  it('ativa DEPOIS do fim do período pago é crítico — é aqui que o MRR infla', async () => {
    await limpar();
    // Já reconciliada (cancel_at_period_end=true) e ainda assim ativa com o
    // período vencido: ninguém revogou, porque ninguém revoga automaticamente.
    await assinatura('sub_3', {
      status: 'active', cancel: true, canceledAt: '2026-07-01T00:00:00Z', periodEnd: '2026-07-12T02:59:59Z',
    });
    await evento('evt_3', 'sub_3', { processed: true });

    const r = await check();
    expect(r.count).toBe(1);
    expect(r.severity).toBe('critical');
    expect(r.rows[0].detail).toMatch(/após o fim do período pago/i);
  });

  it('cancelamento JÁ refletido e dentro do período não alerta', async () => {
    await limpar();
    await assinatura('sub_4', {
      status: 'active', cancel: true, canceledAt: '2026-08-14T17:05:00Z', periodEnd: '2026-09-12T02:59:59Z',
    });
    await evento('evt_4', 'sub_4', { processed: true });

    const r = await check();
    expect(r.count).toBe(0);
    expect(r.rows).toEqual([]);
  });

  it('assinatura já encerrada (status canceled) não alerta', async () => {
    await limpar();
    await assinatura('sub_5', { status: 'canceled', cancel: true, periodEnd: '2026-07-12T02:59:59Z' });
    await evento('evt_5', 'sub_5', { processed: true });

    expect((await check()).count).toBe(0);
  });

  it('SUBSCRIPTION_INACTIVATED conta igual a DELETED', async () => {
    await limpar();
    await assinatura('sub_6', { status: 'active', cancel: false, periodEnd: '2026-09-12T02:59:59Z' });
    await evento('evt_6', 'sub_6', { type: 'SUBSCRIPTION_INACTIVATED', processed: true });

    expect((await check()).count).toBe(1);
  });

  it('evento que não é de cancelamento não gera este alerta', async () => {
    await limpar();
    await assinatura('sub_7', { status: 'active', cancel: false, periodEnd: '2026-09-12T02:59:59Z' });
    await evento('evt_7', 'sub_7', { type: 'PAYMENT_CONFIRMED' });

    expect((await check()).count).toBe(0);
  });

  it('a função é SOMENTE LEITURA: nenhuma assinatura muda ao rodar', async () => {
    await limpar();
    await assinatura('sub_8', { status: 'active', cancel: false, periodEnd: '2026-07-12T02:59:59Z' });
    await evento('evt_8', 'sub_8');

    await check();
    const { rows } = await db.query<{ status: string; cancel_at_period_end: boolean }>(
      'select status, cancel_at_period_end from public.subscriptions where id=$1', ['sub_8'],
    );
    expect(rows[0].status).toBe('active');
    expect(rows[0].cancel_at_period_end).toBe(false);
  });
});
