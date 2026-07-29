import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './supabase-server';

export type Plan = 'free' | 'pro';

/**
 * Plano explícito do usuário. Fonte da verdade: public.user_entitlements,
 * mantida em sync com subscriptions por trigger no banco (ver
 * supabase/migrations/20260724_free_plan_entitlement.sql).
 *
 * 'free' aqui é um estado de PRIMEIRA CLASSE, não "assinatura ausente".
 * Falha fechada para o lado pago: ausência de linha ou erro de leitura NUNCA
 * viram 'pro' — o padrão é sempre 'free' (menor privilégio).
 */
export async function getEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<Plan> {
  const { data, error } = await supabase
    .from('user_entitlements')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Erro de leitura não pode liberar acesso pago. Degrada para free.
    console.error('[getEntitlement]', error);
    return 'free';
  }

  const plan = (data as { plan?: string } | null)?.plan;
  return plan === 'pro' ? 'pro' : 'free';
}

export type EntitlementGuardResult =
  | { ok: true; userId: string; plan: Plan }
  | { ok: false; response: NextResponse };

/**
 * Guard para rotas de API, no mesmo padrão de lib/subscription.ts.
 *
 * 401 se não autenticado. Se `requirePlan: 'pro'` e o usuário for free, 402
 * com code 'plan_required' — negado CEDO, antes de qualquer efeito colateral
 * (OpenAI, débito de crédito). Sem `requirePlan`, aceita free e pro: é a
 * superfície MANUAL, que o free pode usar.
 *
 * Uso:
 *   // rota manual — free e pro:
 *   const ent = await requireEntitlement();
 *   if (!ent.ok) return ent.response;
 *
 *   // rota de IA — só pro:
 *   const ent = await requireEntitlement({ requirePlan: 'pro' });
 *   if (!ent.ok) return ent.response;
 */
export async function requireEntitlement(
  opts: { requirePlan?: Plan } = {},
): Promise<EntitlementGuardResult> {
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

  const plan = await getEntitlement(supabase, user.id);

  if (opts.requirePlan === 'pro' && plan !== 'pro') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Esse recurso de IA é exclusivo do plano pago. Faça upgrade para usar.',
          code: 'plan_required',
        },
        { status: 402 },
      ),
    };
  }

  return { ok: true, userId: user.id, plan };
}
