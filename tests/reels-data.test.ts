import { describe, expect, it } from 'vitest';
import { formatReelDuration, stripHandle } from '../lib/reels';

describe('formatReelDuration — selinho de duração do card da lista', () => {
  it('formata segundos como m:ss com zero à esquerda', () => {
    expect(formatReelDuration(12)).toBe('0:12');
    expect(formatReelDuration(9)).toBe('0:09');
    expect(formatReelDuration(75)).toBe('1:15');
    expect(formatReelDuration(60)).toBe('1:00');
  });

  it('arredonda para o segundo mais próximo', () => {
    expect(formatReelDuration(12.4)).toBe('0:12');
    expect(formatReelDuration(12.6)).toBe('0:13');
  });

  it('sem duração conhecida retorna vazio (esconde o selo)', () => {
    expect(formatReelDuration(0)).toBe('');
    expect(formatReelDuration(undefined)).toBe('');
    expect(formatReelDuration(null)).toBe('');
    expect(formatReelDuration(Number.NaN)).toBe('');
    expect(formatReelDuration(-5)).toBe('');
  });
});

describe('stripHandle — mantém um único @ (regressão)', () => {
  it('remove @ inicial e espaços', () => {
    expect(stripHandle('@foo')).toBe('foo');
    expect(stripHandle('@@foo')).toBe('foo');
    expect(stripHandle('  bar ')).toBe('bar');
    expect(stripHandle(undefined)).toBe('');
  });
});
