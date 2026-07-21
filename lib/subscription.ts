import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient } from './supabase-admin';
import { createServerSupabaseClient } from './supabase-server';

export type ActiveSubscription = {
  subscription_id: string;
  status: 'active' | 'trialing';
  price_id: string;
  plan_interval: 'month' | 'year';
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  trial_end: string | null;
};

/**
 * Returns the active subscription for a user, or null if none.
 * Uses the user_active_subscription view (RLS-protected via security_invoker).
 */
export async function getActiveSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveSubscription | null> {
  const { data, error } = await supabase
    .from('user_active_subscription')
    .select('subscription_id, status, price_id, plan_interval, cancel_at_period_end, current_period_end, trial_end')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[getActiveSubscription]', error);
    return null;
  }
  return (data as ActiveSubscription | null) ?? null;
}

/**
 * True se o usuário já tem uma assinatura que impede uma nova compra.
 * Inclui status que ainda geram cobrança (past_due/unpaid) — nesses casos o
 * usuário deve resolver o pagamento no portal, não criar uma assinatura nova.
 */
export async function hasBillableSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due', 'unpaid'])
    .limit(1);
  if (error) {
    console.error('[hasBillableSubscription]', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export type SubscriptionGuardResult =
  | { ok: true; userId: string; subscription: ActiveSubscription; balance?: number }
  | { ok: false; response: NextResponse };

/**
 * Guard para rotas de API que exigem assinatura ativa (gating por feature).
 * Retorna 401 se não autenticado, 402 (Payment Required) se sem assinatura.
 *
 * Uso:
 *   const guard = await requireActiveSubscription();
 *   if (!guard.ok) return guard.response;
 */
export async function requireActiveSubscription(): Promise<SubscriptionGuardResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }),
    };
  }

  const subscription = await getActiveSubscription(supabase, user.id);
  if (!subscription) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Esse recurso exige uma assinatura ativa. Assine para continuar.',
          code: 'subscription_required',
        },
        { status: 402 },
      ),
    };
  }

  return { ok: true, userId: user.id, subscription };
}

/**
 * Guard para rotas que CONSOMEM créditos. Exige assinatura ativa e debita
 * `cost` créditos atomicamente (RPC consume_credits, com reset mensal). Se
 * `cost` for 0, comporta-se como requireActiveSubscription (sem débito).
 *
 * 401 não autenticado · 402 sem assinatura (subscription_required) ·
 * 402 sem saldo (insufficient_credits) · 500 erro inesperado.
 */
export async function requireCredits(cost: number): Promise<SubscriptionGuardResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }),
    };
  }

  const subscription = await getActiveSubscription(supabase, user.id);
  if (!subscription) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Esse recurso exige uma assinatura ativa. Assine para continuar.', code: 'subscription_required' },
        { status: 402 },
      ),
    };
  }

  if (cost <= 0) {
    return { ok: true, userId: user.id, subscription };
  }

  // O RPC roda com o JWT do usuário e confere auth.uid() = p_user no banco.
  // Service role aqui eliminaria essa vinculação e ampliaria o blast radius.
  const { data, error } = await supabase.rpc('consume_credits', { p_user: user.id, p_cost: cost });
  if (error) {
    if (error.code === 'P0001' || /insufficient_credits/.test(error.message ?? '')) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'Seus créditos acabaram. Aguarde a recarga mensal ou faça upgrade do plano.',
            code: 'insufficient_credits',
          },
          { status: 402 },
        ),
      };
    }
    console.error('[requireCredits]', error);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Erro ao debitar créditos' }, { status: 500 }),
    };
  }

  return { ok: true, userId: user.id, subscription, balance: data as number };
}

/**
 * Estorna créditos debitados quando a geração falha (best-effort).
 * RPC separado, restrito a service_role, com valor positivo e teto no allowance.
 */
export async function refundCredits(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc('refund_credits', { p_user: userId, p_amount: amount });
  if (error) console.error('[refundCredits]', error);
}
