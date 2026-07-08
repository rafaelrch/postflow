'use client';

import { create } from 'zustand';
import { createClient } from '@/lib/supabase';

interface CreditsState {
  balance: number | null;
  monthlyAllowance: number | null;
  loaded: boolean;
  /** Busca o saldo uma vez (idempotente — não refaz se já carregou). */
  fetch: () => Promise<void>;
  /** Força uma nova leitura do saldo — chamar depois de qualquer geração com IA. */
  refresh: () => Promise<void>;
}

async function loadBalance(set: (partial: Partial<CreditsState>) => void) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    set({ balance: null, monthlyAllowance: null, loaded: true });
    return;
  }
  const { data } = await supabase
    .from('user_credits')
    .select('balance, monthly_allowance')
    .eq('user_id', user.id)
    .maybeSingle();
  set({
    balance: typeof data?.balance === 'number' ? data.balance : null,
    monthlyAllowance: typeof data?.monthly_allowance === 'number' ? data.monthly_allowance : null,
    loaded: true,
  });
}

export const useCreditsStore = create<CreditsState>((set, get) => ({
  balance: null,
  monthlyAllowance: null,
  loaded: false,
  fetch: async () => {
    if (get().loaded) return;
    await loadBalance(set);
  },
  refresh: async () => {
    await loadBalance(set);
  },
}));
