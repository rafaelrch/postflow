import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockCreateSignedUploadUrl, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCreateSignedUploadUrl: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    storage: { from: mockFrom },
  }),
}));

let POST: typeof import('../app/api/reels/upload-url/route').POST;

const USER_ID = '11111111-1111-4111-8111-111111111111';

function req(body: unknown): Request {
  return new Request('http://localhost/api/reels/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ createSignedUploadUrl: mockCreateSignedUploadUrl });
  ({ POST } = await import('../app/api/reels/upload-url/route'));
});

describe('POST /api/reels/upload-url — gate de sessão', () => {
  it('401 sem sessão', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ mime: 'video/mp4', sizeBytes: 1024 }));
    expect(res.status).toBe(401);
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe('POST /api/reels/upload-url — validação de mídia', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it('422 para imagem estática', async () => {
    const res = await POST(req({ mime: 'image/png', sizeBytes: 1024 }));
    expect(res.status).toBe(422);
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('422 para MOV', async () => {
    const res = await POST(req({ mime: 'video/quicktime', sizeBytes: 1024 }));
    expect(res.status).toBe(422);
  });

  it('422 acima do tamanho máximo', async () => {
    const res = await POST(req({ mime: 'video/mp4', sizeBytes: 500 * 1024 * 1024 }));
    expect(res.status).toBe(422);
  });
});

describe('POST /api/reels/upload-url — path derivado do user.id', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { path: `${USER_ID}/reels/abc.mp4`, token: 'tok', signedUrl: 'https://x/y' },
      error: null,
    });
  });

  it('assina um path que começa pela pasta do user.id (RLS por usuário)', async () => {
    const res = await POST(req({ mime: 'video/mp4', sizeBytes: 4 * 1024 * 1024 }));
    expect(res.status).toBe(200);

    expect(mockFrom).toHaveBeenCalledWith('postflow-reels');
    const signedPath = mockCreateSignedUploadUrl.mock.calls[0][0] as string;
    expect(signedPath.startsWith(`${USER_ID}/`)).toBe(true);
    expect(signedPath).toMatch(/^11111111-1111-4111-8111-111111111111\/reels\/[^/]+\.mp4$/);

    const json = await res.json();
    expect(json.bucket).toBe('postflow-reels');
    expect(json.token).toBe('tok');
  });

  it('usa a extensão .webm quando o MIME é video/webm', async () => {
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { path: `${USER_ID}/reels/abc.webm`, token: 'tok', signedUrl: 'https://x/y' },
      error: null,
    });
    await POST(req({ mime: 'video/webm', sizeBytes: 4 * 1024 * 1024 }));
    const signedPath = mockCreateSignedUploadUrl.mock.calls[0][0] as string;
    expect(signedPath).toMatch(/\.webm$/);
  });

  it('não deixa o cliente escolher a pasta (path é sempre server-side)', async () => {
    // Mesmo mandando lixo extra no body, o path é derivado do user.id.
    await POST(
      req({ mime: 'video/mp4', sizeBytes: 4 * 1024 * 1024, path: '../../etc/passwd', userId: 'outro' }),
    );
    const signedPath = mockCreateSignedUploadUrl.mock.calls[0][0] as string;
    expect(signedPath.startsWith(`${USER_ID}/`)).toBe(true);
    expect(signedPath).not.toContain('..');
  });
});
