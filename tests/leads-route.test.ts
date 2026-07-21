import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockInsert, mockFrom } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockFrom: vi.fn(),
}));

// Caminho relativo ao ARQUIVO DE TESTE — resolve para o mesmo módulo que a rota
// importa como '../../../lib/supabase-admin'. lead-capture NÃO é mockado: a
// validação do servidor roda de verdade.
vi.mock('../lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ from: mockFrom }),
}));

import { POST } from '../app/api/leads/route';

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/leads', () => {
  it('grava o lead com os 3 campos + plano, e-mail normalizado', async () => {
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockResolvedValue({ error: null });

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
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Rafael Rocha',
      email: 'rafael@test.com',
      phone: '(11) 99999-9999',
      plan_interval: 'year',
    });
  });

  it('default de plano é month quando ausente/estranho', async () => {
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockResolvedValue({ error: null });

    await POST(jsonRequest({ name: 'Ana', email: 'ana@test.com', phone: '11999998888' }));

    expect(mockInsert.mock.calls[0][0].plan_interval).toBe('month');
  });

  it('e-mail inválido: 400 e NÃO toca no banco', async () => {
    mockFrom.mockReturnValue({ insert: mockInsert });

    const res = await POST(
      jsonRequest({ name: 'Rafael', email: 'nao-e-email', phone: '11999999999' }),
    );

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('telefone inválido: 400 e NÃO toca no banco', async () => {
    mockFrom.mockReturnValue({ insert: mockInsert });

    const res = await POST(jsonRequest({ name: 'Rafael', email: 'r@test.com', phone: '123' }));

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('erro do banco vira 500', async () => {
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockResolvedValue({ error: { message: 'insert failed' } });

    const res = await POST(
      jsonRequest({ name: 'Rafael', email: 'r@test.com', phone: '11999999999' }),
    );

    expect(res.status).toBe(500);
  });
});
