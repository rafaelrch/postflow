import { describe, expect, it } from 'vitest';
import { civilDate, resolvePeriod, startOfCivilDay } from '../lib/admin-period';

/**
 * O filtro de período. O caso que justifica o arquivo inteiro é o das 22h em
 * Brasília: o servidor da Vercel roda em UTC e já virou o dia — "hoje" não
 * pode pular para amanhã por causa disso.
 */

// 14/08/2026 às 23:30 em São Paulo = 15/08 às 02:30 UTC.
const NOITE_DE_SP = new Date('2026-08-15T02:30:00Z');

describe('fuso de São Paulo', () => {
  it('o dia civil segue São Paulo, não UTC', () => {
    expect(civilDate(NOITE_DE_SP)).toBe('2026-08-14');
  });

  it('o começo do dia civil vira o instante UTC correspondente', () => {
    expect(startOfCivilDay('2026-08-14').toISOString()).toBe('2026-08-14T03:00:00.000Z');
  });
});

describe('resolvePeriod', () => {
  it('"hoje" cobre só o dia civil corrente, com fim exclusivo', () => {
    const period = resolvePeriod({ periodo: 'hoje' }, NOITE_DE_SP);
    expect(period.key).toBe('hoje');
    expect(period.from).toBe('2026-08-14T03:00:00.000Z');
    expect(period.to).toBe('2026-08-15T03:00:00.000Z');
  });

  it('"7d" inclui hoje e os seis dias anteriores', () => {
    const period = resolvePeriod({ periodo: '7d' }, NOITE_DE_SP);
    expect(period.fromDate).toBe('2026-08-08');
    expect(period.toDate).toBe('2026-08-14');
  });

  it('o período anterior tem a mesma duração e termina onde o atual começa', () => {
    const period = resolvePeriod({ periodo: '7d' }, NOITE_DE_SP);
    expect(period.previous.to).toBe(period.from);
    expect(Date.parse(period.from) - Date.parse(period.previous.from)).toBe(
      Date.parse(period.to) - Date.parse(period.from),
    );
  });

  it('sem parâmetro nenhum, cai em 30 dias', () => {
    expect(resolvePeriod({}, NOITE_DE_SP).key).toBe('30d');
    expect(resolvePeriod({ periodo: 'ontem-talvez' }, NOITE_DE_SP).key).toBe('30d');
  });

  it('aceita intervalo custom e o marca como válido', () => {
    const period = resolvePeriod(
      { periodo: 'custom', de: '2026-07-01', ate: '2026-07-31' },
      NOITE_DE_SP,
    );
    expect(period.key).toBe('custom');
    expect(period.customInvalid).toBe(false);
    expect(period.from).toBe('2026-07-01T03:00:00.000Z');
    // Fim EXCLUSIVO: começo de 01/08, para 31/07 23:59 entrar e não vazar.
    expect(period.to).toBe('2026-08-01T03:00:00.000Z');
  });

  it('custom torto cai em 30 dias e avisa, em vez de quebrar a página', () => {
    for (const params of [
      { periodo: 'custom', de: 'ontem', ate: '2026-07-31' },
      { periodo: 'custom', de: '2026-07-31', ate: '2026-07-01' },
      { periodo: 'custom', de: '2026-02-31', ate: '2026-03-01' },
      { periodo: 'custom' },
    ]) {
      const period = resolvePeriod(params, NOITE_DE_SP);
      expect(period.key).toBe('30d');
      expect(period.customInvalid).toBe(true);
    }
  });
});
