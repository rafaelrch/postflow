import { NextResponse, type NextRequest } from 'next/server';
import { getCheckout, type AbacateCheckout } from '@/lib/abacatepay';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
// Imports relativos (não alias) pelo mesmo motivo das outras rotas: manter os
// módulos mockáveis nos testes.
import { eventIdFor, verifySecret, verifySignature } from '../../../../lib/abacatepay-webhook';
import { upsertSubscription } from '../../../../lib/abacatepay-sync';

export const runtime = 'nodejs';

/**
 * Webhook da AbacatePay. NADA é processado antes das duas verificações
 * (assinatura HMAC do corpo bruto + secret na query). Equivalente ao
 * constructEvent da Stripe, que também falhava fechado.
 *
 * Eventos tratados (confirmados na doc):
 *   subscription.completed / .cancelled / .renewed
 *   checkout.completed / .refunded / .disputed
 *
 * NOTA: o briefing citava `subscription.payment_failed` e
 * `subscription.plan_changed`, mas nenhum dos dois aparece na lista de
 * eventos da documentação. Não são tratados aqui — cair no default apenas
 * registra o evento sem efeito, então se eles existirem de fato nada quebra.
 */
export async function POST(req: NextRequest) {
  // O corpo BRUTO é o que foi assinado — parsear antes invalidaria o HMAC.
  const rawBody = await req.text();

  const signature = req.headers.get('x-webhook-signature');
  const secret = new URL(req.url).searchParams.get('webhookSecret');

  if (!verifySecret(secret) || !verifySignature(rawBody, signature)) {
    // 401 sem detalhe: não informar qual dos dois fatores falhou.
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
  }

  let payload: { event?: string; data?: unknown };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const event = payload.event ?? 'unknown';
  const admin = createAdminSupabaseClient();

  // Idempotência: PK é o hash do corpo. Reentrega colide e sai sem reprocessar.
  const { error: insertErr } = await admin
    .from('abacatepay_webhook_events')
    .insert({ id: eventIdFor(rawBody), event, payload: payload as unknown as Record<string, unknown> });

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[abacatepay/webhook] erro ao registrar evento:', insertErr);
    return NextResponse.json({ error: 'Erro ao registrar evento' }, { status: 500 });
  }

  try {
    switch (event) {
      case 'subscription.completed':
      case 'subscription.renewed':
      case 'subscription.cancelled':
      case 'checkout.completed':
      case 'checkout.refunded':
      case 'checkout.disputed': {
        // O payload do webhook não é confiável como fonte de estado: relemos
        // o checkout na API antes de gravar, para que um corpo forjado que
        // passasse pelas verificações ainda não conseguisse marcar assinatura
        // como paga.
        //
        // O re-read traz os dados acessórios (valor, produto, cliente), mas
        // QUEM DECIDE o status é o tipo do evento: numa disputa ou
        // cancelamento o checkout relido pode continuar PAID — o ciclo de
        // vida vive no objeto `subs_...`, que este endpoint não lê. Ver
        // REVOKING_EVENT_STATUS em lib/abacatepay-sync.ts.
        const id = extractCheckoutId(payload.data);
        if (id) {
          const checkout = await getCheckout(id);
          await upsertSubscription(checkout, null, event);
        }
        break;
      }
      default:
        // Evento desconhecido fica registrado na tabela e não faz nada.
        break;
    }
  } catch (err) {
    console.error(`[abacatepay/webhook] erro ao processar ${event}:`, err);
    return NextResponse.json({ error: 'Erro ao processar evento' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function extractCheckoutId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Partial<AbacateCheckout> & { billing?: { id?: string }; id?: string };
  return obj.id ?? obj.billing?.id ?? null;
}
