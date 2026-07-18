import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { syncSubscriptionFromSession } from '@/lib/stripe-sync';

export const runtime = 'nodejs';

/**
 * B2 — sequestro de conta: o cadastro é pagamento-primeiro e pré-login, então
 * o único jeito de saber se quem preenche o formulário é quem realmente pagou
 * é confirmar, no servidor, a sessão de checkout da Stripe — o session_id só
 * existe na URL de quem completou o pagamento, não é adivinhável a partir do
 * e-mail (ao contrário de "existe assinatura ativa com esse e-mail", que
 * qualquer um pode saber). Chamada pelo AuthForm ANTES de signUp.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; session_id?: string };
  const email = body.email?.trim();
  const sessionId = body.session_id?.trim();

  if (!email || !sessionId) {
    return NextResponse.json(
      { error: 'E-mail e sessão de pagamento são obrigatórios.' },
      { status: 400 },
    );
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json(
      { error: 'Sessão de pagamento inválida ou expirada.' },
      { status: 403 },
    );
  }

  const sessionEmail = session.customer_details?.email ?? session.customer_email ?? null;
  if (!sessionEmail || sessionEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json(
      { error: 'O e-mail informado não corresponde ao pagamento.' },
      { status: 403 },
    );
  }

  // payment_status pode ser 'no_payment_required' em planos com trial (ex.:
  // anual com 3 meses grátis) — exigir só 'paid' bloquearia esses cadastros.
  // O sinal confiável de "assinatura realmente criada" é status:'complete' +
  // subscription presente, mesmo critério usado em lib/stripe-sync.ts.
  const paid =
    session.mode === 'subscription' &&
    session.status === 'complete' &&
    !!session.subscription &&
    session.payment_status !== 'unpaid';

  if (!paid) {
    return NextResponse.json(
      { error: 'Pagamento não confirmado para esta sessão.' },
      { status: 403 },
    );
  }

  // Defesa em profundidade: sincroniza a assinatura agora, via admin client,
  // em vez de depender só do timing do webhook — garante que o trigger
  // enforce_paid_signup encontre o registro certo no signUp logo em seguida.
  await syncSubscriptionFromSession(session);

  return NextResponse.json({ ok: true });
}
