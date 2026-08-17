import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Custo em créditos por tipo de geração. Hoje só a IMAGEM consome crédito —
 * só app/api/generate-image debita de fato.
 *
 * Carrossel é ILIMITADO para assinante (decisão de produto, 17/08/2026): custa
 * 0. A chave continua existindo de propósito — `CreditAction` e o
 * generate-carousel dependem dela, e é `requireCredits(0)` que segura o gate
 * de assinatura daquela rota. Zerar o custo NÃO abre a rota: requireCredits
 * confere sessão (401) e assinatura ativa (402 subscription_required) ANTES do
 * atalho de custo zero (lib/subscription.ts:135). Não troque essa chamada por
 * nada "mais leve" e não a remova.
 *
 * Ações não listadas são grátis (ex.: criar e editar notícias, editor manual) —
 * exigem apenas sessão, e no plano Grátis algumas têm TETO em vez de custo
 * (FREE_NEWS_DAILY_LIMIT em lib/news-quota.ts). Limite não é custo.
 *
 * O exemplo anterior aqui era "refinar slide", funcionalidade que não existe no
 * produto; a copy da /conta a anunciava por causa deste comentário.
 */
export const CREDIT_COSTS = {
  carousel: 0,
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
