import { describe, expect, it, beforeAll } from 'vitest';

// lib/openai instancia o client OpenAI no import (exige OPENAI_API_KEY). Como só
// testamos a função pura buildImagePrompt, definimos uma chave dummy e importamos
// dinamicamente — sem tocar no módulo de produção.
let buildImagePrompt: typeof import('../lib/openai').buildImagePrompt;

beforeAll(async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  ({ buildImagePrompt } = await import('../lib/openai'));
});

describe('buildImagePrompt', () => {
  it('inclui título e descrição no prompt', () => {
    const p = buildImagePrompt({ title: 'Título', description: 'Desc' });
    expect(p).toContain('Título — Desc');
  });

  it('usa a intenção de capa quando isCover', () => {
    expect(buildImagePrompt({ title: 'T', isCover: true })).toMatch(/Cover slide/);
  });

  it('usa a intenção de fechamento quando isFinal', () => {
    expect(buildImagePrompt({ title: 'T', isFinal: true })).toMatch(/Closing slide/);
  });

  it('tece o userPrompt como direção de arte adicional', () => {
    const p = buildImagePrompt({ title: 'T', userPrompt: 'tons frios, neon' });
    expect(p).toContain('Additional art direction: tons frios, neon.');
  });

  it('sem userPrompt não adiciona a seção de direção (não quebra chamadas atuais)', () => {
    const p = buildImagePrompt({ title: 'T', description: 'D' });
    expect(p).not.toContain('Additional art direction');
  });

  it('userPrompt em branco é ignorado', () => {
    const p = buildImagePrompt({ title: 'T', userPrompt: '   ' });
    expect(p).not.toContain('Additional art direction');
  });
});
