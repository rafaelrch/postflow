import { describe, expect, it, vi } from 'vitest';
import { loadAdminProduct, parseProductBlock } from '../lib/admin-product';
import { resolvePeriod } from '../lib/admin-period';

describe('métricas administrativas de produto', () => {
  it('mapeia números e mantém token ausente como desconhecido', () => {
    expect(parseProductBlock('credits_ai', {
      credits_by_feature: [{ feature: 'image', credits: '10' }],
      ai_succeeded: '2', ai_failed: 1, zero_credits: 3,
      models: [{ model: 'gpt-image-2', generations: 2, input_tokens: null, output_tokens: null }],
    })).toMatchObject({
      aiSucceeded: 2,
      creditsByFeature: [{ feature: 'image', credits: 10 }],
      models: [{ inputTokens: null, outputTokens: null }],
    });
  });

  it('consulta quatro blocos independentes e uma falha não derruba os demais', async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) =>
      args.p_block === 'creation' ? { data: null, error: { message: 'offline' } } : { data: {}, error: null });
    const result = await loadAdminProduct({ rpc } as never, resolvePeriod({ periodo: '30d' }, new Date('2026-08-15T15:00:00Z')));
    expect(rpc).toHaveBeenCalledTimes(4);
    expect(result.creation.ok).toBe(false);
    expect(result.activity.ok).toBe(true);
    expect(result.features.ok).toBe(true);
    expect(result.creditsAi.ok).toBe(true);
  });
});
