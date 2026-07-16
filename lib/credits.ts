import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Custo em créditos por tipo de geração. Ações não listadas são grátis
 * (ex.: refinar slide) — exigem apenas assinatura ativa.
 */
export const CREDIT_COSTS = {
  carousel: 5,
  image: 5,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export type UserCredits = {
  balance: number;
  monthly_allowance: number;
  period_end: string | null;
};

/** Saldo de créditos do usuário (para UI). RLS garante que só lê o próprio. */
export async function getUserCredits(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserCredits | null> {
  const { data, error } = await supabase
    .from('user_credits')
    .select('balance, monthly_allowance, period_end')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[getUserCredits]', error);
    return null;
  }
  return (data as UserCredits | null) ?? null;
}
