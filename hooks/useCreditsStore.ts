'use client';

import { create } from 'zustand';
import { createClient } from '@/lib/supabase';

interface CreditsState {
  balance: number | null;
  monthlyAllowance: number | null;
  /** Fim do ciclo atual (user_credits.period_end) — data da recarga mensal. */
  periodEnd: string | null;
  loaded: boolean;
  /** Popup global de "créditos esgotados" (ver CreditsExhaustedModal). */
  exhaustedOpen: boolean;
  /** Busca o saldo uma vez (idempotente — não refaz se já carregou). */
  fetch: () => Promise<void>;
  /** Força uma nova leitura do saldo — chamar depois de qualquer geração com IA. */
  refresh: () => Promise<void>;
  showExhausted: () => void;
  closeExhausted: () => void;
}

async function loadBalance(set: (partial: Partial<CreditsState>) => void) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    set({ balance: null, monthlyAllowance: null, periodEnd: null, loaded: true });
    return;
  }
  const { data } = await supabase
    .from('user_credits')
    .select('balance, monthly_allowance, period_end')
    .eq('user_id', user.id)
    .maybeSingle();
  set({
    balance: typeof data?.balance === 'number' ? data.balance : null,
    monthlyAllowance: typeof data?.monthly_allowance === 'number' ? data.monthly_allowance : null,
    periodEnd: typeof data?.period_end === 'string' ? data.period_end : null,
    loaded: true,
  });
}

export const useCreditsStore = create<CreditsState>((set, get) => ({
  balance: null,
  monthlyAllowance: null,
  periodEnd: null,
  loaded: false,
  exhaustedOpen: false,
  fetch: async () => {
    if (get().loaded) return;
    await loadBalance(set);
  },
  refresh: async () => {
    await loadBalance(set);
  },
  showExhausted: () => {
    set({ exhaustedOpen: true });
    loadBalance(set); // garante saldo e data de recarga atualizados no popup
  },
  closeExhausted: () => set({ exhaustedOpen: false }),
}));

/**
 * Trata a resposta 402 de créditos esgotados das rotas de IA: abre o popup
 * global e retorna true. Retorna false se o erro não for de créditos.
 */
export function handleInsufficientCredits(payload: { code?: string } | null | undefined): boolean {
  if (payload?.code !== 'insufficient_credits') return false;
  useCreditsStore.getState().showExhausted();
  return true;
}
