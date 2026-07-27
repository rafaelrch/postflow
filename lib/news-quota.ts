import type { SupabaseClient } from '@supabase/supabase-js';

/** Teto de criação de news por janela deslizante de 24h no plano free. */
export const FREE_NEWS_DAILY_LIMIT = 4;

export type Plan = 'free' | 'pro';

/**
 * Quantos cards podem ser criados AGORA, dado o plano, o uso na janela de 24h e
 * quantos foram pedidos. Pro é ilimitado; free recebe só o que ainda cabe na
 * cota (nunca negativo). Usado ANTES de gerar os cards — as news nascem 100% no
 * cliente, então a trava tem que estar na criação, não só no INSERT (backstop).
 */
export function newsCreateAllowance(args: { plan: Plan; used24h: number; requested: number }): number {
  const { plan, used24h, requested } = args;
  if (requested <= 0) return 0;
  if (plan === 'pro') return requested;
  const remaining = Math.max(0, FREE_NEWS_DAILY_LIMIT - Math.max(0, used24h));
  return Math.min(requested, remaining);
}

export type NewsUsage = { plan: Plan; used24h: number };

/**
 * Lê o plano (user_entitlements) e conta as news criadas na janela deslizante
 * de 24h. FALHA FECHADA: plano indeterminado/erro = 'free'; contagem
 * indeterminada/erro = janela cheia (bloqueia a criação) — o backstop do banco
 * (trigger free_news_daily_limit) segura o resto. Pro não precisa contar.
 */
export async function fetchNewsUsage(supabase: SupabaseClient): Promise<NewsUsage> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { plan: 'free', used24h: FREE_NEWS_DAILY_LIMIT };

  const { data: ent, error: entErr } = await supabase
    .from('user_entitlements')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle();
  const plan: Plan = !entErr && (ent as { plan?: string } | null)?.plan === 'pro' ? 'pro' : 'free';
  if (plan === 'pro') return { plan, used24h: 0 };

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await supabase
    .from('news_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gt('created_at', cutoff);
  if (countErr || count === null) return { plan, used24h: FREE_NEWS_DAILY_LIMIT };
  return { plan, used24h: count };
}
