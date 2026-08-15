import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInsert } = vi.hoisted(() => ({ mockInsert: vi.fn() }));

vi.mock('../lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ from: () => ({ insert: mockInsert }) }),
}));

import {
  recordAiGenerationBestEffort,
  validateProductEvent,
} from '../lib/product-events';

beforeEach(() => mockInsert.mockReset());

describe('eventos de produto seguros', () => {
  it('recusa evento fora da whitelist e propriedades que podem carregar conteúdo', () => {
    expect(validateProductEvent({ eventName: 'admin_grant', properties: {} })).toBeNull();
    expect(validateProductEvent({
      eventName: 'carousel_generated_with_ai',
      properties: { prompt: 'conteúdo privado' },
    })).toBeNull();
    expect(validateProductEvent({
      eventName: 'carousel_generated_with_ai',
      properties: { model: 'gpt-5.4-nano', slide_count: 5, credits: 5 },
    })).toMatchObject({ feature: 'carousel' });
  });

  it('falha de instrumentação é absorvida e não escapa para o fluxo chamador', async () => {
    mockInsert.mockResolvedValue({ error: new Error('analytics offline') });
    await expect(recordAiGenerationBestEffort({
      operationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      feature: 'image',
      status: 'succeeded',
      model: 'gpt-image-2',
      credits: 5,
      durationMs: 420,
    })).resolves.toBeUndefined();
  });

  it('registro de IA contém apenas metadados e insumos brutos', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await recordAiGenerationBestEffort({
      operationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      feature: 'carousel',
      status: 'succeeded',
      model: 'gpt-5.4-nano',
      credits: 5,
      durationMs: 420,
      inputTokens: 100,
      outputTokens: 50,
    });
    const payload = mockInsert.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ input_tokens: 100, output_tokens: 50 });
    expect(payload).not.toHaveProperty('prompt');
    expect(payload).not.toHaveProperty('response');
    expect(payload).not.toHaveProperty('content');
  });
});
