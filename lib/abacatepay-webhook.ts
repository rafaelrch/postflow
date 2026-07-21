import crypto from 'node:crypto';
import { ABACATEPAY_PUBLIC_KEY, ABACATEPAY_WEBHOOK_SECRET } from '@/lib/abacatepay';

/**
 * Verificação de webhook da AbacatePay. São DOIS fatores independentes e
 * ambos precisam passar:
 *
 * 1. `X-Webhook-Signature`: HMAC-SHA256 do corpo BRUTO, em base64, usando a
 *    chave pública da AbacatePay como segredo. Prova que o corpo não foi
 *    alterado.
 * 2. `?webhookSecret=` na query: segredo combinado no cadastro do webhook.
 *    Prova que a entrega veio do endpoint que nós registramos.
 *
 * Comparação sempre por timingSafeEqual — nunca `===` — para não vazar o
 * segredo por tempo de resposta.
 */

/** Comparação de tamanho-constante que não estoura com tamanhos diferentes. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader || !ABACATEPAY_PUBLIC_KEY) return false;
  const expected = crypto
    .createHmac('sha256', ABACATEPAY_PUBLIC_KEY)
    .update(Buffer.from(rawBody, 'utf8'))
    .digest('base64');
  return safeEqual(expected, signatureHeader);
}

export function verifySecret(secretFromQuery: string | null): boolean {
  if (!secretFromQuery || !ABACATEPAY_WEBHOOK_SECRET) return false;
  return safeEqual(ABACATEPAY_WEBHOOK_SECRET, secretFromQuery);
}

/**
 * A AbacatePay não manda um id de evento estável (a Stripe manda evt_xxx),
 * então a chave de idempotência é o SHA-256 do corpo bruto: reentrega do
 * mesmo payload colide na PK de abacatepay_webhook_events e é ignorada.
 */
export function eventIdFor(rawBody: string): string {
  return crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
}
