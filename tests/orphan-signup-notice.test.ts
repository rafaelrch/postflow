/**
 * Regras do aviso de PAGAMENTO ÓRFÃO (lib/orphan-signup-notice.ts).
 *
 * Módulo puro: aqui não há banco, nem Resend, nem rota. O que se testa é a
 * decisão — "este evento merece um e-mail?" — que é a parte onde um erro custa
 * dinheiro nos dois sentidos: não avisar quem pagou, ou avisar quem já resolveu.
 */

import { describe, expect, it } from 'vitest';
import {
  decideOrphanNotice,
  noticeSendAt,
  NOTICE_DELAY_MINUTES,
} from '../lib/orphan-signup-notice';

const LEAD_ID = '3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

/** O caso que este código existe para cobrir: pagou, ninguém reivindicou. */
function orphan(over: Parameters<typeof decideOrphanNotice>[0] | object = {}) {
  return decideOrphanNotice({
    action: 'grant',
    subscriptionId: 'sub_1',
    payerEmail: 'pagador@test.com',
    leadId: LEAD_ID,
    current: null,
    ...over,
  });
}

describe('decideOrphanNotice — quando avisar', () => {
  it('grant sem dono agenda, com o e-mail do pagador e o lead', () => {
    expect(orphan()).toEqual({
      schedule: true,
      to: 'pagador@test.com',
      leadId: LEAD_ID,
      subscriptionId: 'sub_1',
    });
  });

  it('normaliza o e-mail (o cadastro casa por lower(email))', () => {
    const d = orphan({ payerEmail: '  PagadoR@Test.COM  ' });
    expect(d).toMatchObject({ schedule: true, to: 'pagador@test.com' });
  });

  it('linha existente ainda sem dono continua agendando', () => {
    // Reentrega ou segundo evento antes de a pessoa criar a conta.
    expect(orphan({ current: { user_id: null, orphan_notice_email_id: null } })).toMatchObject({
      schedule: true,
    });
  });
});

describe('decideOrphanNotice — quando NÃO avisar', () => {
  it('assinatura JÁ REIVINDICADA não avisa (ela já resolveu)', () => {
    expect(orphan({ current: { user_id: 'user-1' } })).toEqual({
      schedule: false,
      reason: 'already_claimed',
    });
  });

  it('renovação de quem já tem conta não avisa, mesmo sendo grant', () => {
    expect(orphan({ current: { user_id: 'user-1', orphan_notice_email_id: null } })).toMatchObject({
      schedule: false,
      reason: 'already_claimed',
    });
  });

  it('JÁ AVISADO não avisa de novo — a trava de idempotência', () => {
    expect(orphan({ current: { orphan_notice_email_id: 'email_1' } })).toEqual({
      schedule: false,
      reason: 'already_noticed',
    });
  });

  it('"já tem dono" ganha de "já avisado": os dois juntos não viram e-mail', () => {
    expect(orphan({ current: { user_id: 'u', orphan_notice_email_id: 'email_1' } })).toMatchObject({
      schedule: false,
    });
  });

  it.each([
    ['confirm_receipt', 'PAYMENT_RECEIVED — dinheiro caiu, não libera acesso'],
    ['past_due', 'cobrança vencida'],
    ['payment_failed', 'cartão recusado'],
    ['revoke', 'estorno'],
    ['sync', 'só reflete estado'],
    ['end_of_cycle', 'cancelamento'],
    ['ignore', 'evento fora da lista'],
  ])('ação %s não avisa (%s)', (action) => {
    expect(orphan({ action })).toEqual({ schedule: false, reason: 'not_grant' });
  });

  it('sem e-mail do pagador não há para quem mandar', () => {
    expect(orphan({ payerEmail: null })).toEqual({ schedule: false, reason: 'no_payer_email' });
    expect(orphan({ payerEmail: '   ' })).toEqual({ schedule: false, reason: 'no_payer_email' });
  });

  it('sem lead não avisa: o link precisa do token assinado', () => {
    expect(orphan({ leadId: null })).toEqual({ schedule: false, reason: 'no_lead' });
  });

  it('sem id de assinatura não avisa', () => {
    expect(orphan({ subscriptionId: null })).toMatchObject({ schedule: false });
  });
});

describe('noticeSendAt', () => {
  it('adia o envio pela janela combinada, em ISO 8601', () => {
    const now = new Date('2026-08-14T12:00:00.000Z');
    expect(noticeSendAt(now)).toBe('2026-08-14T12:15:00.000Z');
  });

  it('a janela cobre com folga a espera da tela (~92s)', () => {
    // Abaixo disso o e-mail competiria com a própria página, que ainda tenta.
    expect(NOTICE_DELAY_MINUTES * 60).toBeGreaterThan(92);
  });
});

describe('decideOrphanNotice — e-mail do pagador, com reserva', () => {
  it('usa o e-mail já gravado quando o evento não trouxe um', () => {
    // GET /v3/customers falhou NESTE evento, mas o endereço chegou num anterior.
    // Sem esta reserva, uma indisponibilidade momentânea custaria o aviso.
    expect(orphan({ payerEmail: null, current: { email: 'gravado@test.com' } })).toMatchObject({
      schedule: true,
      to: 'gravado@test.com',
    });
  });

  it('o e-mail DESTE evento ganha do gravado (é o mais novo)', () => {
    expect(
      orphan({ payerEmail: 'novo@test.com', current: { email: 'antigo@test.com' } }),
    ).toMatchObject({ schedule: true, to: 'novo@test.com' });
  });

  it('nem evento nem reserva => não avisa', () => {
    expect(orphan({ payerEmail: null, current: { email: null } })).toEqual({
      schedule: false,
      reason: 'no_payer_email',
    });
  });
});
