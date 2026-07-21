import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@/lib/abacatepay', () => ({
  ABACATEPAY_PUBLIC_KEY: 'chave-publica-de-teste',
  ABACATEPAY_WEBHOOK_SECRET: 'secret-combinado',
}));

import { eventIdFor, verifySecret, verifySignature } from '../lib/abacatepay-webhook';

const PUBLIC_KEY = 'chave-publica-de-teste';

function sign(body: string, key = PUBLIC_KEY) {
  return crypto.createHmac('sha256', key).update(Buffer.from(body, 'utf8')).digest('base64');
}

const BODY = JSON.stringify({ event: 'subscription.completed', data: { id: 'bill_abc' } });

afterEach(() => vi.clearAllMocks());

describe('verifySignature — HMAC do corpo bruto', () => {
  it('aceita assinatura legítima do corpo exato', () => {
    expect(verifySignature(BODY, sign(BODY))).toBe(true);
  });

  it('rejeita quando o corpo foi adulterado depois de assinado', () => {
    const assinatura = sign(BODY);
    const adulterado = JSON.stringify({ event: 'subscription.completed', data: { id: 'bill_ATACANTE' } });

    expect(verifySignature(adulterado, assinatura)).toBe(false);
  });

  it('rejeita assinatura gerada com outra chave', () => {
    expect(verifySignature(BODY, sign(BODY, 'chave-errada'))).toBe(false);
  });

  it('rejeita header ausente em vez de deixar passar', () => {
    expect(verifySignature(BODY, null)).toBe(false);
  });

  it('rejeita assinatura de tamanho diferente sem estourar (timingSafeEqual)', () => {
    expect(() => verifySignature(BODY, 'curta')).not.toThrow();
    expect(verifySignature(BODY, 'curta')).toBe(false);
  });
});

describe('verifySecret — secret da query', () => {
  it('aceita o secret combinado', () => {
    expect(verifySecret('secret-combinado')).toBe(true);
  });

  it('rejeita secret errado e ausente', () => {
    expect(verifySecret('secret-errado')).toBe(false);
    expect(verifySecret(null)).toBe(false);
  });
});

describe('eventIdFor — idempotência', () => {
  it('mesmo corpo gera o mesmo id (reentrega colide na PK)', () => {
    expect(eventIdFor(BODY)).toBe(eventIdFor(BODY));
  });

  it('corpos diferentes geram ids diferentes', () => {
    expect(eventIdFor(BODY)).not.toBe(eventIdFor(BODY + ' '));
  });
});
