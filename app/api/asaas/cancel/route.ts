import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/subscription';
import { scheduleSubscriptionCancellation } from '@/lib/asaas-subscription-admin';

export const runtime = 'nodejs';

/**
 * Cancela a assinatura do usuário logado.
 *
 * A UI é o botão do card "Assinatura" em /conta
 * (components/billing/CancelSubscriptionButton.tsx). O Asaas não tem portal do
 * cliente como a Stripe tinha, então este é o único caminho de cancelamento —
 * serve tanto para o usuário quanto para um cancelamento operacional, sem
 * ninguém precisar mexer no banco à mão.
 *
 * O acesso NÃO acaba na hora: cancela no Asaas (para não cobrar de novo) e
 * marca cancel_at_period_end mantendo o acesso até o fim do ciclo já pago. Ver
 * scheduleSubscriptionCancellation — e não troque pelo cancelamento imediato.
 *
 * O id da assinatura NÃO vem do request. Ele é resolvido a partir da sessão:
 * aceitar um id do cliente deixaria qualquer usuário logado cancelar a
 * assinatura de outro só chutando ids.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const subscription = await getActiveSubscription(supabase, user.id);
  if (!subscription) {
    return NextResponse.json(
      { error: 'Nenhuma assinatura ativa encontrada.', code: 'no_active_subscription' },
      { status: 404 },
    );
  }

  const result = await scheduleSubscriptionCancellation(subscription.subscription_id);

  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 502;
    return NextResponse.json(
      { error: 'Não foi possível cancelar a assinatura agora.', code: result.reason },
      { status },
    );
  }

  // current_period_end vem da assinatura que JÁ tínhamos lido: é a data que a
  // tela mostra como fim do acesso. Pode ser null, e a tela trata isso sem
  // afirmar dia nenhum.
  return NextResponse.json({
    canceled: true,
    alreadyCanceled: result.alreadyCanceled,
    cancelAtPeriodEnd: true,
    currentPeriodEnd: subscription.current_period_end,
  });
}
