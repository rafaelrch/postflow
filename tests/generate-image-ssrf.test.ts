import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

const {
  mockLookup,
  mockHttpsRequest,
  mockPinnedLookup,
  mockRequireCredits,
  mockRefundCredits,
  mockGenerate,
  mockEdit,
  mockToFile,
  mockUpload,
  mockGetPublicUrl,
} = vi.hoisted(() => ({
  mockLookup: vi.fn(),
  mockHttpsRequest: vi.fn(),
  mockPinnedLookup: vi.fn(),
  mockRequireCredits: vi.fn(),
  mockRefundCredits: vi.fn(),
  mockGenerate: vi.fn(),
  mockEdit: vi.fn(),
  mockToFile: vi.fn(),
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ lookup: mockLookup }));
vi.mock('node:https', () => ({ request: mockHttpsRequest }));
vi.mock('openai', () => ({ toFile: mockToFile }));
vi.mock('@/lib/openai', () => ({
  openai: { images: { generate: mockGenerate, edit: mockEdit } },
  buildImagePrompt: () => 'prompt seguro',
}));
vi.mock('@/lib/subscription', () => ({
  requireCredits: mockRequireCredits,
  refundCredits: mockRefundCredits,
}));
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

let POST: typeof import('../app/api/generate-image/route').POST;
let downloadReferenceImage: typeof import('../lib/generate-image-reference').downloadReferenceImage;

const userId = '11111111-1111-4111-8111-111111111111';
const validUrl =
  `https://project.supabase.co/storage/v1/object/public/postflow-assets/${userId}/reference-images/ref.png`;

let httpsResponse: {
  status: number;
  headers: Record<string, string>;
  chunks: Buffer[];
};

function request(referenceImageUrl?: string) {
  return new NextRequest('http://localhost/api/generate-image', {
    method: 'POST',
    body: JSON.stringify({ slideId: 'slide-1', title: 'Título', referenceImageUrl }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  ({ POST } = await import('../app/api/generate-image/route'));
  ({ downloadReferenceImage } = await import('../lib/generate-image-reference'));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLookup.mockReset();
  mockHttpsRequest.mockReset();
  httpsResponse = {
    status: 200,
    headers: { 'content-type': 'image/png' },
    chunks: [Buffer.from([1, 2, 3])],
  };
  mockLookup.mockResolvedValue([{ address: '2606:4700::1', family: 6 }]);
  mockHttpsRequest.mockImplementation((_url, options, callback) => {
    options.lookup('project.supabase.co', {}, mockPinnedLookup);
    const response = Readable.from(httpsResponse.chunks) as Readable & {
      statusCode: number;
      headers: Record<string, string>;
    };
    response.statusCode = httpsResponse.status;
    response.headers = httpsResponse.headers;
    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
    };
    requestEmitter.end = () => queueMicrotask(() => callback(response));
    options.signal?.addEventListener('abort', () => {
      response.destroy();
      requestEmitter.emit('error', new Error('aborted'));
    }, { once: true });
    return requestEmitter;
  });
  mockRequireCredits.mockResolvedValue({ ok: true, userId });
  mockGenerate.mockResolvedValue({ data: [{ b64_json: 'aW1hZ2U=' }] });
  mockEdit.mockResolvedValue({ data: [{ b64_json: 'aW1hZ2U=' }] });
  mockToFile.mockResolvedValue({});
  mockUpload.mockResolvedValue({ error: null });
  mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://project.supabase.co/result.png' } });
});

describe('download seguro da imagem de referência', () => {
  it.each([
    'http://localhost/reference-images/ref.png',
    'http://127.0.0.1/reference-images/ref.png',
    'http://10.0.0.1/reference-images/ref.png',
    'http://169.254.169.254/latest/meta-data',
    'http://[::ffff:127.0.0.1]/reference-images/ref.png',
    'file:///etc/passwd',
    'https://user:pass@project.supabase.co/storage/v1/object/public/postflow-assets/x/reference-images/ref.png',
    'https://project.supabase.co:444/storage/v1/object/public/postflow-assets/x/reference-images/ref.png',
  ])('rejeita destino não permitido: %s', async (url) => {
    await expect(downloadReferenceImage(url, userId)).rejects.toThrow();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it('rejeita HTTP mesmo na origem, bucket e caminho corretos', async () => {
    const httpUrl = validUrl.replace('https://', 'http://');
    await expect(downloadReferenceImage(httpUrl, userId)).rejects.toThrow(/HTTPS/);
    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it.each([
    `https://evil.example/storage/v1/object/public/postflow-assets/${userId}/reference-images/ref.png`,
    `https://project.supabase.co/storage/v1/object/public/outro/${userId}/reference-images/ref.png`,
    `https://project.supabase.co/storage/v1/object/public/postflow-assets/outro/reference-images/ref.png`,
    `https://project.supabase.co/storage/v1/object/public/postflow-assets/${userId}/slide-images/ref.png`,
  ])('rejeita origem, bucket ou caminho inválido: %s', async (url) => {
    await expect(downloadReferenceImage(url, userId)).rejects.toThrow();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it('rejeita DNS do host permitido quando resolve para endereço privado', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.8', family: 4 }]);
    await expect(downloadReferenceImage(validUrl, userId)).rejects.toThrow(/privado/i);
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it('rejeita DNS IPv4-mapped IPv6 que aponta para loopback', async () => {
    mockLookup.mockResolvedValue([{ address: '0:0:0:0:0:ffff:7f00:1', family: 6 }]);
    await expect(downloadReferenceImage(validUrl, userId)).rejects.toThrow(/privado/i);
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it('não segue redirect', async () => {
    httpsResponse = {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
      chunks: [],
    };
    await expect(downloadReferenceImage(validUrl, userId)).rejects.toThrow(/redirect/i);
    expect(mockHttpsRequest).toHaveBeenCalledTimes(1);
  });

  it('rejeita conteúdo não-imagem e payload acima do limite', async () => {
    httpsResponse = {
      status: 200,
      headers: { 'content-type': 'text/html' },
      chunks: [Buffer.from('html')],
    };
    await expect(downloadReferenceImage(validUrl, userId)).rejects.toThrow(/MIME/i);

    httpsResponse = {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(10 * 1024 * 1024 + 1),
      },
      chunks: [Buffer.from([1])],
    };
    await expect(downloadReferenceImage(validUrl, userId)).rejects.toThrow(/tamanho/i);
  });

  it('pina a conexão no primeiro IP público validado, sem segundo DNS', async () => {
    mockLookup
      .mockResolvedValueOnce([
        { address: '203.0.114.10', family: 4 },
        { address: '2606:4700::1', family: 6 },
      ])
      .mockResolvedValueOnce([{ address: '10.0.0.8', family: 4 }]);

    await expect(downloadReferenceImage(validUrl, userId)).resolves.toMatchObject({ mime: 'image/png' });
    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(mockPinnedLookup).toHaveBeenCalledWith(null, '203.0.114.10', 4);
    expect(mockHttpsRequest).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        servername: 'project.supabase.co',
        headers: expect.objectContaining({ host: 'project.supabase.co' }),
      }),
      expect.any(Function)
    );
  });

  it('aplica o limite também a resposta chunked sem Content-Length', async () => {
    httpsResponse = {
      status: 200,
      headers: { 'content-type': 'image/webp' },
      chunks: [
        Buffer.alloc(6 * 1024 * 1024),
        Buffer.alloc(4 * 1024 * 1024 + 1),
      ],
    };
    await expect(downloadReferenceImage(validUrl, userId)).rejects.toThrow(/tamanho/i);
  });

  it('interrompe a conexão no timeout global', async () => {
    vi.useFakeTimers();
    mockHttpsRequest.mockImplementationOnce((_url, options) => {
      const requestEmitter = new EventEmitter() as EventEmitter & { end: () => void };
      requestEmitter.end = vi.fn();
      options.signal?.addEventListener('abort', () => {
        requestEmitter.emit('error', new Error('aborted'));
      }, { once: true });
      return requestEmitter;
    });
    const pending = downloadReferenceImage(validUrl, userId);
    const rejection = expect(pending).rejects.toThrow(/Timeout/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    vi.useRealTimers();
  });
});

describe('barreira e estorno de créditos', () => {
  it('sem aprovação de requireCredits não faz fetch nem chama OpenAI', async () => {
    mockRequireCredits.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Sem créditos' }, { status: 402 }),
    });
    expect((await POST(request(validUrl))).status).toBe(402);
    expect(mockHttpsRequest).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it('falha após o débito reembolsa exatamente uma vez', async () => {
    httpsResponse = {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      chunks: [Buffer.from('não é imagem')],
    };
    expect((await POST(request(validUrl))).status).toBe(500);
    expect(mockRequireCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledWith(userId, expect.any(Number));
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('sucesso não reembolsa', async () => {
    expect((await POST(request(validUrl))).status).toBe(200);
    expect(mockRequireCredits).toHaveBeenCalledTimes(1);
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });
});
