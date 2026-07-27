import { afterEach, describe, expect, it } from 'vitest';
import {
  useUpgradeStore,
  handlePlanRequired,
  handleProjectLimit,
  isProjectLimitError,
  handleReelLimit,
  isReelLimitError,
  handleNewsDailyLimit,
  isNewsDailyLimitError,
} from '../hooks/useUpgradeStore';

afterEach(() => useUpgradeStore.setState({ reason: null }));

describe('handlePlanRequired — 402 plan_required das rotas de IA', () => {
  it('abre o modal de upgrade e retorna true quando code é plan_required', () => {
    expect(handlePlanRequired({ code: 'plan_required' })).toBe(true);
    expect(useUpgradeStore.getState().reason).toBe('plan_required');
  });

  it('ignora outros códigos (não abre o modal)', () => {
    expect(handlePlanRequired({ code: 'insufficient_credits' })).toBe(false);
    expect(handlePlanRequired(null)).toBe(false);
    expect(handlePlanRequired(undefined)).toBe(false);
    expect(useUpgradeStore.getState().reason).toBeNull();
  });
});

describe('isProjectLimitError — reconhece o trigger free_project_limit', () => {
  it('detecta a mensagem do Postgres em vários formatos', () => {
    expect(isProjectLimitError({ message: 'free_project_limit' })).toBe(true);
    expect(isProjectLimitError(new Error('free_project_limit'))).toBe(true);
    expect(isProjectLimitError('erro: free_project_limit')).toBe(true);
  });

  it('não confunde com outros erros', () => {
    expect(isProjectLimitError({ message: 'duplicate key value' })).toBe(false);
    expect(isProjectLimitError(new Error('insufficient_credits'))).toBe(false);
    expect(isProjectLimitError(null)).toBe(false);
    expect(isProjectLimitError(undefined)).toBe(false);
  });
});

describe('handleProjectLimit — teto de 5 carrosséis do free', () => {
  it('abre o modal com reason project_limit e retorna true', () => {
    expect(handleProjectLimit(new Error('free_project_limit'))).toBe(true);
    expect(useUpgradeStore.getState().reason).toBe('project_limit');
  });

  it('deixa outros erros seguirem o fluxo normal (retorna false, não abre)', () => {
    expect(handleProjectLimit(new Error('network down'))).toBe(false);
    expect(useUpgradeStore.getState().reason).toBeNull();
  });
});

describe('handleReelLimit — teto de 1 reel do free (código próprio e distinto)', () => {
  it('abre o modal com reason reel_limit e retorna true', () => {
    expect(handleReelLimit(new Error('free_reel_limit'))).toBe(true);
    expect(useUpgradeStore.getState().reason).toBe('reel_limit');
  });

  it('não confunde reel com carrossel nem news', () => {
    expect(isReelLimitError(new Error('free_project_limit'))).toBe(false);
    expect(isReelLimitError(new Error('free_news_daily_limit'))).toBe(false);
    expect(isReelLimitError(new Error('free_reel_limit'))).toBe(true);
  });

  it('deixa outros erros seguirem o fluxo normal', () => {
    expect(handleReelLimit(new Error('disco cheio'))).toBe(false);
    expect(useUpgradeStore.getState().reason).toBeNull();
  });
});

describe('handleNewsDailyLimit — teto de 4 news/dia do free (código próprio e distinto)', () => {
  it('abre o modal com reason news_daily_limit e retorna true', () => {
    expect(handleNewsDailyLimit(new Error('free_news_daily_limit'))).toBe(true);
    expect(useUpgradeStore.getState().reason).toBe('news_daily_limit');
  });

  it('não confunde news com carrossel nem reel', () => {
    expect(isNewsDailyLimitError(new Error('free_project_limit'))).toBe(false);
    expect(isNewsDailyLimitError(new Error('free_reel_limit'))).toBe(false);
    expect(isNewsDailyLimitError({ message: 'free_news_daily_limit' })).toBe(true);
  });

  it('deixa outros erros seguirem o fluxo normal', () => {
    expect(handleNewsDailyLimit(new Error('timeout'))).toBe(false);
    expect(useUpgradeStore.getState().reason).toBeNull();
  });
});

describe('store: close() zera o motivo', () => {
  it('fecha o modal', () => {
    useUpgradeStore.getState().open('plan_required');
    expect(useUpgradeStore.getState().reason).toBe('plan_required');
    useUpgradeStore.getState().close();
    expect(useUpgradeStore.getState().reason).toBeNull();
  });
});
