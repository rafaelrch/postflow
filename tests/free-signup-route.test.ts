import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateUser, mockResend, mockUpsert } = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockResend: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({
    auth: { admin: { createUser: mockCreateUser } },
    from: () => ({ upsert: mockUpsert }),
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { resend: mockResend } }),
}));

const ORIGIN = 'http://localhost:3000';
const GOOD_PW = 'segredo123';

function req(
  email: unknown,
  { origin = ORIGIN, ip = '9.9.9.9', password = GOOD_PW as unknown }: { origin?: string | null; ip?: string; password?: unknown } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGIN}/api/auth/free-signup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
}

async function freshRoute() {
  vi.resetModules();
  return import('../app/api/auth/free-signup/route');
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockResend.mockResolvedValue({ error: null });
  mockUpsert.mockResolvedValue({ error: null });
});

afterEach(() => vi.clearAllMocks());

describe('POST /api/auth/free-signup — cadastro com senha', () => {
  it('cria a conta NÃO confirmada, com a senha e o marcador free; confirma via /login', async () => {
    const { POST } = await freshRoute();
    const res = await POST(req('novo@email.com', { ip: '1.1.1.1' }) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'novo@email.com',
        password: GOOD_PW,
        email_confirm: false, // conta não confirmada NÃO loga
        user_metadata: { signup_kind: 'free' }, // marcador do trigger BEFORE INSERT
        app_metadata: { origin: 'free_signup' },
      }),
    );
    // Fluxo free NÃO passa mais por /definir-senha: confirma e cai no login.
    expect(mockResend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'signup',
        email: 'novo@email.com',
        options: { emailRedirectTo: 'http://localhost:3000/login' },
      }),
    );
    expect(mockResend.mock.calls[0][0].options.emailRedirectTo).not.toMatch(/definir-senha/);
  });

  it('provisiona entitlement FREE EXPLÍCITO no ato da criação (não no fim do onboarding)', async () => {
    const { POST } = await freshRoute();
    await POST(req('novo@email.com', { ip: '1.1.1.7' }) as never);

    // A conta recém-criada JÁ tem linha de entitlement free — não depende de
    // concluir o onboarding. Idempotente e nunca concede pro.
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', plan: 'free' },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
    const provisioned = JSON.stringify(mockUpsert.mock.calls[0] ?? []);
    expect(provisioned).toMatch(/"plan":"free"/);
    expect(provisioned).not.toMatch(/pro/);
  });

  it('não provisiona entitlement quando a conta já existe (backfill/DB cobre)', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } });
    const { POST } = await freshRoute();
    await POST(req('existe@email.com', { ip: '1.1.1.8' }) as never);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('NUNCA linka assinatura nem concede pro', async () => {
    const { POST } = await freshRoute();
    await POST(req('novo@email.com', { ip: '1.1.1.2' }) as never);
    const arg = JSON.stringify(mockCreateUser.mock.calls[0]?.[0] ?? {});
    expect(arg).not.toMatch(/subscription|price|\bpro\b|paid/i);
  });

  it('a senha NUNCA aparece na resposta (nem vaza)', async () => {
    const { POST } = await freshRoute();
    const res = await POST(req('novo@email.com', { ip: '1.1.1.9', password: 'super-secreta-xyz' }) as never);
    const text = await res.text();
    expect(text).not.toContain('super-secreta-xyz');
    expect(text).toBe(JSON.stringify({ ok: true }));
  });

  it('anti-enumeração: e-mail já existente responde IGUAL (200 ok), sem trocar a senha, e ainda reenvia', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } });
    const { POST } = await freshRoute();
    const res = await POST(req('existe@email.com', { ip: '1.1.1.3' }) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockResend).toHaveBeenCalledTimes(1); // dono legítimo ainda recebe o link
  });

  it('rejeita senha curta (400) sem criar usuário', async () => {
    const { POST } = await freshRoute();
    const res = await POST(req('x@email.com', { ip: '1.1.1.6', password: '123' }) as never);
    expect(res.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('rejeita origem estranha (403) sem criar usuário', async () => {
    const { POST } = await freshRoute();
    const res = await POST(req('x@email.com', { origin: 'https://evil.com', ip: '1.1.1.4' }) as never);
    expect(res.status).toBe(403);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('rejeita e-mail inválido (400) sem criar usuário', async () => {
    const { POST } = await freshRoute();
    const res = await POST(req('sem-arroba', { ip: '1.1.1.5' }) as never);
    expect(res.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('rate-limita a mesma origem (429) depois de 5 tentativas', async () => {
    const { POST } = await freshRoute();
    const ip = '5.5.5.5';
    for (let i = 0; i < 5; i++) {
      const ok = await POST(req(`a${i}@email.com`, { ip }) as never);
      expect(ok.status).toBe(200);
    }
    const blocked = await POST(req('a6@email.com', { ip }) as never);
    expect(blocked.status).toBe(429);
  });
});
