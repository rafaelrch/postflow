import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newsCreateAllowance, fetchNewsUsage, FREE_NEWS_DAILY_LIMIT } from '../lib/news-quota';

describe('newsCreateAllowance — trava de criação de news (bug 1)', () => {
  it('cota ESGOTADA: free com 4 usadas pedindo 5 → 0 (nada é gerado)', () => {
    expect(newsCreateAllowance({ plan: 'free', used24h: 4, requested: 5 })).toBe(0);
  });

  it('cota PARCIAL: free com 2 usadas pedindo 5 → 2 (só o que cabe)', () => {
    expect(newsCreateAllowance({ plan: 'free', used24h: 2, requested: 5 })).toBe(2);
  });

  it('cota LIVRE: free com 0 usadas pedindo 3 → 3', () => {
    expect(newsCreateAllowance({ plan: 'free', used24h: 0, requested: 3 })).toBe(3);
  });

  it('exatamente no limite: free com 3 usadas pedindo 1 → 1; pedindo 2 → 1', () => {
    expect(newsCreateAllowance({ plan: 'free', used24h: 3, requested: 1 })).toBe(1);
    expect(newsCreateAllowance({ plan: 'free', used24h: 3, requested: 2 })).toBe(1);
  });

  it('used acima do limite (defensivo) → 0', () => {
    expect(newsCreateAllowance({ plan: 'free', used24h: 10, requested: 4 })).toBe(0);
  });

  it('PRO: sem limite — 100 usadas pedindo 7 → 7', () => {
    expect(newsCreateAllowance({ plan: 'pro', used24h: 100, requested: 7 })).toBe(7);
  });

  it('pedido não-positivo → 0', () => {
    expect(newsCreateAllowance({ plan: 'free', used24h: 0, requested: 0 })).toBe(0);
    expect(newsCreateAllowance({ plan: 'pro', used24h: 0, requested: 0 })).toBe(0);
  });

  it('o limite é 4', () => {
    expect(FREE_NEWS_DAILY_LIMIT).toBe(4);
  });
});

describe('fetchNewsUsage — leitura de plano + uso 24h (falha fechada)', () => {
  const mkSupabase = (opts: {
    user?: { id: string } | null;
    plan?: { data: unknown; error: unknown };
    count?: { count: number | null; error: unknown };
  }) => {
    const countChain = {
      select: () => ({ eq: () => ({ gt: () => Promise.resolve(opts.count ?? { count: 0, error: null }) }) }),
    };
    const entChain = {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(opts.plan ?? { data: null, error: null }) }) }),
    };
    return {
      auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: 'u1' } : opts.user } }) },
      from: (table: string) => (table === 'news_entries' ? countChain : entChain),
    } as never;
  };

  it('sem sessão → free e janela cheia (bloqueia)', async () => {
    const usage = await fetchNewsUsage(mkSupabase({ user: null }));
    expect(usage).toEqual({ plan: 'free', used24h: FREE_NEWS_DAILY_LIMIT });
  });

  it('pro → não conta (used 0)', async () => {
    const usage = await fetchNewsUsage(mkSupabase({ plan: { data: { plan: 'pro' }, error: null } }));
    expect(usage).toEqual({ plan: 'pro', used24h: 0 });
  });

  it('free com 2 no período → used24h 2', async () => {
    const usage = await fetchNewsUsage(
      mkSupabase({ plan: { data: { plan: 'free' }, error: null }, count: { count: 2, error: null } }),
    );
    expect(usage).toEqual({ plan: 'free', used24h: 2 });
  });

  it('erro na contagem → falha fechada (janela cheia)', async () => {
    const usage = await fetchNewsUsage(
      mkSupabase({ plan: { data: { plan: 'free' }, error: null }, count: { count: null, error: { message: 'boom' } } }),
    );
    expect(usage.used24h).toBe(FREE_NEWS_DAILY_LIMIT);
  });

  it('erro no entitlement → tratado como free', async () => {
    const usage = await fetchNewsUsage(
      mkSupabase({ plan: { data: null, error: { message: 'boom' } }, count: { count: 1, error: null } }),
    );
    expect(usage.plan).toBe('free');
  });
});
