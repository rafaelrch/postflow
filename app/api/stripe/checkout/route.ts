import { NextResponse, type NextRequest } from 'next/server';
import {
  stripe,
  appUrl,
  priceIdForInterval,
  STRIPE_TRIAL_DAYS_YEARLY,
  type PlanInterval,
} from '@/lib/stripe';

export const runtime = 'nodejs';

/**
 * Checkout "pagamento primeiro": NÃO exige login. O lead paga antes de ter
 * conta; a Stripe coleta o e-mail e cria o customer. A assinatura é vinculada
 * ao usuário depois, no cadastro (trigger handle_new_user casa por e-mail).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { interval?: PlanInterval };
    const interval: PlanInterval = body.interval === 'year' ? 'year' : 'month';
    const priceId = priceIdForInterval(interval);
    if (!priceId) {
      return NextResponse.json(
        { error: `Price ID não configurado para o plano ${interval}. Defina STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY.` },
        { status: 500 },
      );
    }

    // Trial só no plano anual (badge "3 meses grátis" da página de preços).
    const trialDays =
      interval === 'year' && STRIPE_TRIAL_DAYS_YEARLY > 0 ? STRIPE_TRIAL_DAYS_YEARLY : undefined;

    const session = await stripe.checkout.sessions.create({
      // Em mode:subscription a Stripe já cria o customer e coleta o e-mail.
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      locale: 'pt-BR',
      // Volta para o cadastro com o e-mail já pago (travado no form).
      success_url: appUrl('/cadastro?session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: appUrl('/precos?checkout=cancel'),
      subscription_data: trialDays ? { trial_period_days: trialDays } : undefined,
      metadata: { interval },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao criar checkout' },
      { status: 500 },
    );
  }
}
