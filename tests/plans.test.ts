import { describe, expect, it } from 'vitest';
import { PLANS, formatBrl, isPlanInterval, planFor } from '../lib/plans';

/**
 * Estes testes existem para travar NÚMERO COBRADO. Se alguém mudar o preço sem
 * querer, é aqui que estoura — não na fatura do cliente.
 */
describe('planos — valores cobrados', () => {
  it('mensal: R$ 59,50 em ciclo MONTHLY', () => {
    const plan = planFor('month');
    expect(plan.value).toBe(59.5);
    expect(plan.cycle).toBe('MONTHLY');
  });

  it('anual: R$ 499 em ciclo YEARLY', () => {
    const plan = planFor('year');
    expect(plan.value).toBe(499);
    expect(plan.cycle).toBe('YEARLY');
  });

  it('o preço EXIBIDO deriva do preço COBRADO (não são dois números)', () => {
    expect(PLANS.month.priceLabel).toBe(formatBrl(PLANS.month.value));
    expect(PLANS.year.priceLabel).toBe(formatBrl(PLANS.year.value));
    expect(PLANS.month.priceLabel).toBe('R$ 59,50');
    expect(PLANS.year.priceLabel).toBe('R$ 499');
  });
});

describe('planos — limites de campo do Asaas', () => {
  it('items[].name cabe em 30 caracteres', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.itemName.length).toBeLessThanOrEqual(30);
    }
  });

  it('items[].description cabe em 150 caracteres', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.itemDescription.length).toBeLessThanOrEqual(150);
    }
  });
});

describe('planos — validação de entrada', () => {
  it('aceita só month e year', () => {
    expect(isPlanInterval('month')).toBe(true);
    expect(isPlanInterval('year')).toBe(true);
  });

  it('rejeita qualquer outra coisa, inclusive vizinhos plausíveis', () => {
    for (const valor of ['MONTHLY', 'mensal', 'monthly', '', null, undefined, 1, {}]) {
      expect(isPlanInterval(valor)).toBe(false);
    }
  });
});
