import { beforeEach, describe, expect, it, vi } from 'vitest';

// Trava do upload de reel: posse verificada server-side (anti-IDOR) e falha
// fechada. O teto de 1 reel que existia aqui era do PLANO GRATUITO e saiu junto
// com ele — os testes que restam não dependem de entitlement, e um deles vigia
// justamente que a contagem de reels não volte a rodar.

const { mockGetUser, mockSign, mockOwned, mockCount } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSign: vi.fn(),
  mockOwned: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    storage: { from: () => ({ createSignedUploadUrl: mockSign }) },
    from: (table: string) => {
      if (table !== 'reels') throw new Error(`Tabela inesperada: ${table}`);
      return {
        select: (_col: string, opts?: { count?: string; head?: boolean }) => {
          if (opts && opts.count) {
            // Caminho de CONTAGEM: só existia para o teto do plano free. Se
            // alguém reintroduzir a contagem, mockCount registra a chamada e o
            // teste "(a)" quebra.
            return { eq: () => Promise.resolve(mockCount()) };
          }
          // Caminho de POSSE: .select('id').eq('id',reelId).eq('user_id',uid).maybeSingle()
          return { eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(mockOwned()) }) }) };
        },
      };
    },
  }),
}));

// A trava só é exercitável com Reels LIGADO — com a chave desligada a rota
// corta em 404 antes de tudo (coberto em tests/reels-feature-flag.test.tsx).
vi.mock('@/lib/feature-flags', () => ({ REELS_ENABLED: true }));

let POST: typeof import('../app/api/reels/upload-url/route').POST;

const USER = '11111111-1111-4111-8111-111111111111';
const OWN_REEL = '22222222-2222-4222-8222-222222222222';
const OTHER_REEL = '33333333-3333-4333-8333-333333333333';
const MP4 = { mime: 'video/mp4', sizeBytes: 4 * 1024 * 1024 };

function req(body: unknown): Request {
  return new Request('http://localhost/api/reels/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } } });
  mockSign.mockResolvedValue({ data: { path: `${USER}/reels/x.mp4`, token: 'tok', signedUrl: 'https://x/y' }, error: null });
  mockOwned.mockResolvedValue({ data: null, error: null });
  mockCount.mockResolvedValue({ count: 0, error: null });
  ({ POST } = await import('../app/api/reels/upload-url/route'));
});

describe('(a) reel NOVO não tem mais teto', () => {
  it('assina sem contar reels do usuário', async () => {
    const res = await POST(req({ ...MP4 })); // sem reelId = novo
    expect(res.status).toBe(200);
    expect(mockSign).toHaveBeenCalledTimes(1);
    // O acervo não é mais limitado: nenhuma contagem deve rodar.
    expect(mockCount).not.toHaveBeenCalled();
  });
});

describe('(b) troca do vídeo do PRÓPRIO reel', () => {
  it('LIBERADO (assina)', async () => {
    mockOwned.mockResolvedValue({ data: { id: OWN_REEL }, error: null });
    const res = await POST(req({ ...MP4, reelId: OWN_REEL }));
    expect(res.status).toBe(200);
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(mockCount).not.toHaveBeenCalled();
  });
});

describe('(c) IDOR — reelId de OUTRO usuário', () => {
  it('RECUSADO (403), sem assinar e sem vazar existência', async () => {
    mockOwned.mockResolvedValue({ data: null, error: null }); // RLS/filtro user_id → não é dono
    const res = await POST(req({ ...MP4, reelId: OTHER_REEL }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(mockSign).not.toHaveBeenCalled();
    // Mensagem genérica: não revela se o reel existe nem de quem é.
    expect(body.code).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/exist|outro|owner|dono/i);
  });

  it('reelId malformado → recusa idêntica (403), sem tocar o banco', async () => {
    const res = await POST(req({ ...MP4, reelId: 'not-a-uuid' }));
    expect(res.status).toBe(403);
    expect(mockOwned).not.toHaveBeenCalled();
    expect(mockSign).not.toHaveBeenCalled();
  });
});

describe('falha fechada', () => {
  it('erro ao checar posse NÃO libera edição (403)', async () => {
    mockOwned.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await POST(req({ ...MP4, reelId: OWN_REEL }));
    expect(res.status).toBe(403);
    expect(mockSign).not.toHaveBeenCalled();
  });
});
