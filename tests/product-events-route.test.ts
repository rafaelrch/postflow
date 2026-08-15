import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUser, mockInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('../lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('../lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({ from: () => ({ insert: mockInsert }) }),
}));

import { POST } from '../app/api/product-events/route';
import { __resetRateLimit } from '../lib/rate-limit';

beforeEach(() => {
  __resetRateLimit();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'session-user' } } });
  mockInsert.mockResolvedValue({ error: null });
});

function request(body: unknown) {
  return new NextRequest('http://localhost/api/product-events', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/product-events', () => {
  it('deriva user_id da sessão e ignora identidade enviada pelo cliente', async () => {
    const response = await POST(request({
      userId: 'forged-user',
      eventName: 'carousel_exported_all',
      properties: { export_format: 'zip', slide_count: 5 },
    }));
    expect(response.status).toBe(204);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'session-user' }));
    expect(mockInsert).not.toHaveBeenCalledWith(expect.objectContaining({ user_id: 'forged-user' }));
  });

  it('exige autenticação e rejeita propriedades privadas', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await POST(request({ eventName: 'session_started' }))).status).toBe(401);
    expect((await POST(request({
      eventName: 'carousel_generated_with_ai',
      properties: { prompt: 'segredo' },
    }))).status).toBe(400);
  });
});
