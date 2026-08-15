import { describe, expect, it } from 'vitest';
import { financialWriteFromAsaas } from '@/lib/asaas-financial-event';

describe('normalização financeira do Asaas', () => {
  it('extrai somente metadados financeiros e fixa o fuso do dateCreated', () => {
    expect(financialWriteFromAsaas({
      event: 'PAYMENT_RECEIVED',
      dateCreated: '2026-08-15 10:20:30',
      payment: {
        id: 'pay_1', subscription: 'sub_1', status: 'RECEIVED', value: 59.5,
        billingType: 'PIX', dueDate: '2026-08-15', customer: 'não-vai-para-a-rpc',
      },
    })).toEqual({
      p_provider_payment_id: 'pay_1', p_provider_subscription_id: 'sub_1',
      p_event_type: 'PAYMENT_RECEIVED', p_status: 'RECEIVED', p_gross_value: 59.5,
      p_billing_type: 'PIX', p_due_date: '2026-08-15',
      p_event_at: '2026-08-15T10:20:30-03:00',
    });
  });

  it('ignora evento sem payment.id em vez de inventar cobrança', () => {
    expect(financialWriteFromAsaas({ event: 'SUBSCRIPTION_UPDATED', subscription: { id: 'sub_1' } })).toBeNull();
  });
});
