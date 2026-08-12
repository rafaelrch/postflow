import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/subscription';
import { cancelUserSubscription } from '@/lib/asaas-subscription-admin';

export const runtime = 'nodejs';

/**
 * Cancela a assinatura do usuário logado.
 *
 * NÃO EXISTE UI PARA ISTO, de propósito: o Rafael decidiu que o cancelamento
 * segue manual por enquanto (o Asaas não tem portal do cliente como a Stripe
 * tinha). Esta rota existe para o caminho de servidor estar pronto e testado
 * quando a decisão mudar — e para dar suporte a um cancelamento operacional
 * sem alguém precisar mexer no banco à mão.
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

  const result = await cancelUserSubscription(subscription.subscription_id);

  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 502;
    return NextResponse.json(
      { error: 'Não foi possível cancelar a assinatura agora.', code: result.reason },
      { status },
    );
  }

  return NextResponse.json({ canceled: true, alreadyCanceled: result.alreadyCanceled });
}
