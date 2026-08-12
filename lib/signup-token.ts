/**
 * Token assinado que viaja na successUrl do checkout.
 *
 * ⚠️ SERVIDOR APENAS — lê SIGNUP_TOKEN_SECRET. Nunca importe de componente
 * client.
 *
 * POR QUE ISTO EXISTE: a doc do Asaas não documenta se ele anexa algum
 * identificador na URL de retorno. Depender de um comportamento não
 * documentado para decidir quem pode criar conta é frágil — se um dia mudar,
 * ou o cadastro para de funcionar, ou (pior) passa a aceitar qualquer volta.
 *
 * Como NÓS controlamos a successUrl, colocamos o nosso próprio identificador
 * assinado nela: HMAC-SHA256 do id do lead. Recupera a propriedade que o
 * session_id da Stripe dava — "esta URL só pode ter sido gerada pelo nosso
 * servidor, para este lead" — sem depender de nada do provedor.
 *
 * O QUE O TOKEN **NÃO** É: prova de pagamento. Ele é emitido quando o checkout
 * é CRIADO, antes de qualquer cobrança, e um usuário que abandone o pagamento
 * volta com um token perfeitamente válido. Quem confirma pagamento é o webhook
 * (Fase 4), escrevendo a assinatura; o cadastro exige essa linha. O token só
 * responde "de qual lead é esta volta".
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Formato: <leadId>.<hmac em base64url>. */
const TOKEN_RE = /^([0-9a-fA-F-]{36})\.([A-Za-z0-9_-]{43})$/;

function secret(): string {
  const value = process.env.SIGNUP_TOKEN_SECRET;
  // Sem fallback: um segredo default tornaria o token forjável por qualquer um
  // que leia o repositório, que é exatamente o que ele existe para impedir.
  if (!value || value.length < 16) {
    throw new Error('Missing SIGNUP_TOKEN_SECRET env var (mínimo 16 caracteres)');
  }
  return value;
}

function sign(leadId: string): string {
  return createHmac('sha256', secret()).update(leadId).digest('base64url');
}

/** Token para pendurar na successUrl. */
export function createSignupToken(leadId: string): string {
  return `${leadId}.${sign(leadId)}`;
}

/**
 * Devolve o leadId se o token for autêntico, senão null.
 *
 * Comparação em TEMPO CONSTANTE (timingSafeEqual): comparar com === vaza, pelo
 * tempo de resposta, quantos bytes iniciais o atacante acertou, o que permite
 * forjar a assinatura byte a byte. timingSafeEqual exige buffers do mesmo
 * tamanho, então o comprimento é conferido antes — e isso não vaza nada, já que
 * o tamanho da assinatura é fixo e público.
 */
export function verifySignupToken(token: string | undefined | null): string | null {
  if (!token) return null;

  const match = TOKEN_RE.exec(token.trim());
  if (!match) return null;

  const [, leadId, provided] = match;

  const expectedBuf = Buffer.from(sign(leadId), 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return null;

  return timingSafeEqual(expectedBuf, providedBuf) ? leadId : null;
}
