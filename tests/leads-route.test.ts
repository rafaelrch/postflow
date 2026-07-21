import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimit } from '../lib/rate-limit';

const { mockUpsert, mockFrom } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockFrom: vi.fn(),
}));

// Caminho relativo ao ARQUIVO DE TESTE — resolve para o mesmo módulo que a rota
// importa como '../../../lib/supabase-admin'. lead-capture e rate-limit NÃO são
// mockados: a validação e o rate limit do servidor rodam de verdade.
vi.mock('../lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ from: mockFrom }),
}));

import { POST } from '../app/api/leads/route';

// Cada request carrega um IP via x-forwarded-for. IP distinto por teste (ou
// explícito) evita que o rate limit de um caso vaze pro outro.
function jsonRequest(body: unknown, ip = '10.0.0.1') {
  return {
    json: async () => body,
    headers: { get: (h: string) => (h === 'x-forwarded-for' ? ip : null) },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => __resetRateLimit());
afterEach(() => vi.clearAllMocks());

describe('POST /api/leads', () => {
  it('grava o lead com os 3 campos + plano, e-mail normalizado (upsert por e-mail)', async () => {
    mockFrom.mockReturnValue({ upsert: mockUpsert });
    mockUpsert.mockResolvedValue({ error: null });

    const res = await POST(
      jsonRequest({
        name: '  Rafael Rocha ',
        email: 'Rafael@Test.com',
        phone: '(11) 99999-9999',
        interval: 'year',
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    expect(mockFrom).toHaveBeenCalledWith('leads');
    // e-mail duplicado faz UPSERT (onConflict email), não insert → não duplica linha
    expect(mockUpsert).toHaveBeenCalledWith(
      { name: 'Rafael Rocha', email: 'rafael@test.com', phone: '(11) 99999-9999', plan_interval: 'year' },
      { onConflict: 'email' },
    );
  });

  it('default de plano é month quando ausente/estranho', async () => {
    mockFrom.mockReturnValue({ upsert: mockUpsert });
    mockUpsert.mockResolvedValue({ error: null });

    await POST(jsonRequest({ name: 'Ana', email: 'ana@test.com', phone: '11999998888' }));

    expect(mockUpsert.mock.calls[0][0].plan_interval).toBe('month');
  });

  it('e-mail inválido: 400 e NÃO toca no banco', async () => {
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    const res = await POST(jsonRequest({ name: 'Rafael', email: 'nao-e-email', phone: '11999999999' }));

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('telefone inválido: 400 e NÃO toca no banco', async () => {
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    const res = await POST(jsonRequest({ name: 'Rafael', email: 'r@test.com', phone: '123' }));

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('campo gigante (> 200 chars) é rejeitado com 400 e NÃO toca no banco', async () => {
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    const huge = 'a'.repeat(5000);
    const res = await POST(
      jsonRequest({ name: huge, email: 'r@test.com', phone: '11999999999' }),
    );

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('erro do banco vira 500', async () => {
    mockFrom.mockReturnValue({ upsert: mockUpsert });
    mockUpsert.mockResolvedValue({ error: { code: '23505', message: 'unique violation' } });

    const res = await POST(jsonRequest({ name: 'Rafael', email: 'r@test.com', phone: '11999999999' }));

    expect(res.status).toBe(500);
  });

  it('rate limit: a 11ª requisição do mesmo IP em 1 min recebe 429', async () => {
    mockFrom.mockReturnValue({ upsert: mockUpsert });
    mockUpsert.mockResolvedValue({ error: null });

    const ip = '203.0.113.7';
    // 10 permitidas
    for (let i = 0; i < 10; i++) {
      const res = await POST(jsonRequest({ name: 'Rafael', email: `r${i}@test.com`, phone: '11999999999' }, ip));
      expect(res.status).toBe(200);
    }
    // a 11ª é bloqueada
    const blocked = await POST(jsonRequest({ name: 'Rafael', email: 'r10@test.com', phone: '11999999999' }, ip));
    expect(blocked.status).toBe(429);

    // outro IP não é afetado
    const other = await POST(jsonRequest({ name: 'Ana', email: 'ana@test.com', phone: '11999998888' }, '198.51.100.2'));
    expect(other.status).toBe(200);
  });
});
