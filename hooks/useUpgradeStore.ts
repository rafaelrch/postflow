'use client';

import { create } from 'zustand';

/**
 * Motivo pelo qual o modal de upgrade abriu:
 *  - 'plan_required': o usuário free tentou usar um recurso de IA. A API já
 *    negou (402 plan_required, fatia 1) — este modal é só a conveniência da UI,
 *    com caminho para upgrade. NÃO substitui a negação do servidor.
 *  - 'project_limit': o INSERT de carrossel bateu no teto de 5 do plano free
 *    (trigger free_project_limit no banco). Nada foi apagado.
 *  - 'reel_limit': o INSERT de reel bateu no teto de 1 do plano free
 *    (trigger free_reel_limit). Nada foi apagado.
 *  - 'news_daily_limit': o INSERT de news bateu no teto de 4/dia (janela de 24h)
 *    do plano free (trigger free_news_daily_limit). Limite RENOVA — não é teto
 *    permanente e nada foi apagado.
 */
export type UpgradeReason = 'plan_required' | 'project_limit' | 'reel_limit' | 'news_daily_limit';

interface UpgradeState {
  reason: UpgradeReason | null;
  open: (reason: UpgradeReason) => void;
  close: () => void;
}

export const useUpgradeStore = create<UpgradeState>((set) => ({
  reason: null,
  open: (reason) => set({ reason }),
  close: () => set({ reason: null }),
}));

/**
 * Trata a resposta 402 plan_required das rotas de IA: abre o modal de upgrade
 * e retorna true. Retorna false se o payload não for de plano.
 */
export function handlePlanRequired(payload: { code?: string } | null | undefined): boolean {
  if (payload?.code !== 'plan_required') return false;
  useUpgradeStore.getState().open('plan_required');
  return true;
}

/**
 * Reconhece o erro do trigger `free_project_limit` (teto de 5 carrosséis no
 * plano free) vindo de um INSERT via Supabase. O Postgres devolve a mensagem
 * 'free_project_limit' com SQLSTATE P0001.
 */
export function isProjectLimitError(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === 'string' ? error : (error as { message?: string })?.message ?? '';
  return /free_project_limit/i.test(message);
}

/**
 * Se o erro for o teto de projetos do free, abre o modal e retorna true.
 * Retorna false para qualquer outro erro (que segue o fluxo normal de erro).
 */
export function handleProjectLimit(error: unknown): boolean {
  if (!isProjectLimitError(error)) return false;
  useUpgradeStore.getState().open('project_limit');
  return true;
}

/** Reconhece a mensagem 'free_reel_limit' (trigger de 1 reel no free). */
export function isReelLimitError(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === 'string' ? error : (error as { message?: string })?.message ?? '';
  return /free_reel_limit/i.test(message);
}

/** Se o erro for o teto de 1 reel do free, abre o modal e retorna true. */
export function handleReelLimit(error: unknown): boolean {
  if (!isReelLimitError(error)) return false;
  useUpgradeStore.getState().open('reel_limit');
  return true;
}

/** Reconhece a mensagem 'free_news_daily_limit' (trigger de 4 news/dia no free). */
export function isNewsDailyLimitError(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === 'string' ? error : (error as { message?: string })?.message ?? '';
  return /free_news_daily_limit/i.test(message);
}

/** Se o erro for o teto diário de news do free, abre o modal e retorna true. */
export function handleNewsDailyLimit(error: unknown): boolean {
  if (!isNewsDailyLimitError(error)) return false;
  useUpgradeStore.getState().open('news_daily_limit');
  return true;
}
