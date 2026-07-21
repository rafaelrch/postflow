import { beforeEach, describe, expect, it } from 'vitest';
import { rateLimit, clientIp, __resetRateLimit } from '../lib/rate-limit';

beforeEach(() => __resetRateLimit());

describe('rateLimit — janela fixa por chave', () => {
  it('permite até o limite e bloqueia a N+1 da mesma chave', () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(rateLimit('ip:a', opts, 1000).ok).toBe(true);
    expect(rateLimit('ip:a', opts, 1000).ok).toBe(true);
    expect(rateLimit('ip:a', opts, 1000).ok).toBe(true);
    const blocked = rateLimit('ip:a', opts, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('chaves diferentes têm contadores independentes', () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit('ip:a', opts, 0).ok).toBe(true);
    expect(rateLimit('ip:a', opts, 0).ok).toBe(false);
    // outra chave começa do zero
    expect(rateLimit('ip:b', opts, 0).ok).toBe(true);
  });

  it('libera de novo depois que a janela expira', () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit('ip:a', opts, 0).ok).toBe(true);
    expect(rateLimit('ip:a', opts, 30_000).ok).toBe(false); // ainda na janela
    expect(rateLimit('ip:a', opts, 60_000).ok).toBe(true); // janela expirou
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => ({
    headers: { get: (h: string) => headers[h] ?? null },
  });

  it('pega o primeiro IP de x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('cai para x-real-ip quando não há x-forwarded-for', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('devolve "unknown" quando não há header nenhum, sem lançar', () => {
    expect(clientIp(req({}))).toBe('unknown');
    expect(clientIp({} as never)).toBe('unknown');
  });
});
