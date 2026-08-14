/**
 * POST /api/auth/recuperar-senha — o pedido de "esqueci minha senha".
 *
 * A regra que estes testes protegem é de SEGURANÇA, não de conforto: a resposta
 * tem de ser idêntica exista a conta ou não. Uma resposta diferente para
 * "e-mail não encontrado" transforma a rota num verificador de clientes — dá
 * para varrer uma lista de endereços e descobrir quem paga pelo Creatools.
 *
 * O outro teste obrigatório é o rate limit: sem ele o formulário vira ferramenta
 * de encher a caixa de entrada de alguém, e ainda queima a cota do Resend.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimit } from '../lib/rate-limit';

const { mockReset } = vi.hoisted(() => ({ mockReset: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail: mockReset } }),
}));

function req(body: unknown, ip = '10.0.0.1') {
  return new Request('https://creatools.com.br/api/auth/recuperar-senha', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  __resetRateLimit();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://projeto.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://creatools.com.br');
  mockReset.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('resposta idêntica — não vaza quem é cliente', () => {
  it('e-mail QUE EXISTE e e-mail QUE NÃO EXISTE devolvem exatamente o mesmo', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');

    const existe = await POST(req({ email: 'cliente@example.com' }, '10.0.0.1'));
    // O Supabase devolve erro para endereço sem conta em algumas configurações;
    // a rota não pode transformar isso em resposta diferente.
    mockReset.mockResolvedValue({ error: { message: 'User not found' } });
    const naoExiste = await POST(req({ email: 'ninguem@example.com' }, '10.0.0.2'));

    expect(existe.status).toBe(naoExiste.status);
    expect(await existe.json()).toEqual(await naoExiste.json());
  });

  it('e-mail malformado também devolve o mesmo, sem chamar o provedor', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');

    const bom = await POST(req({ email: 'cliente@example.com' }, '10.0.0.1'));
    const ruim = await POST(req({ email: 'nao-e-email' }, '10.0.0.2'));
    const vazio = await POST(req({}, '10.0.0.3'));

    const corpo = await bom.json();
    expect(await ruim.json()).toEqual(corpo);
    expect(await vazio.json()).toEqual(corpo);
    expect(ruim.status).toBe(200);
    // Só o e-mail com cara de e-mail chega ao Supabase.
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('a mensagem é condicional ("se existir"), nunca uma afirmação', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');
    const body = await (await POST(req({ email: 'cliente@example.com' }))).json();

    expect(body.message).toMatch(/se existir/i);
    expect(body.message).not.toMatch(/enviamos para|conta encontrada|não encontrado/i);
  });
});

describe('o link do e-mail', () => {
  it('aponta para /redefinir-senha via appUrl, nunca escrito à mão', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');
    await POST(req({ email: 'cliente@example.com' }));

    expect(mockReset).toHaveBeenCalledWith('cliente@example.com', {
      redirectTo: 'https://creatools.com.br/redefinir-senha',
    });
  });

  it('normaliza o e-mail (espaços e maiúsculas) antes de mandar', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');
    await POST(req({ email: '  Cliente@Example.COM ' }));

    expect(mockReset.mock.calls[0][0]).toBe('cliente@example.com');
  });
});

describe('rate limit', () => {
  it('corta a rajada do MESMO IP', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');

    // Endereços diferentes de propósito: o que está sendo testado é o balde do
    // IP, e não o do e-mail.
    const respostas = [];
    for (let i = 0; i < 7; i += 1) {
      respostas.push((await POST(req({ email: `pessoa${i}@example.com` }, '203.0.113.9'))).status);
    }

    expect(respostas.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(respostas.slice(5)).toEqual([429, 429]);
    expect(mockReset).toHaveBeenCalledTimes(5);
  });

  it('corta o bombardeio do MESMO E-MAIL vindo de IPs diferentes', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');

    const alvo = 'alvo@example.com';
    const respostas = [];
    for (let i = 0; i < 5; i += 1) {
      // IP novo a cada volta: sem o balde por e-mail, trocar de rede burlaria o
      // limite e a caixa de entrada do alvo receberia tudo.
      respostas.push((await POST(req({ email: alvo }, `198.51.100.${i}`))).status);
    }

    expect(respostas).toEqual([200, 200, 200, 429, 429]);
    expect(mockReset).toHaveBeenCalledTimes(3);
  });

  it('o 429 não denuncia se a conta existe — o balde nasce antes de perguntar', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');

    // Endereço que o provedor recusa (conta inexistente) leva o MESMO 429
    // depois do mesmo número de tentativas.
    mockReset.mockResolvedValue({ error: { message: 'User not found' } });
    const respostas = [];
    for (let i = 0; i < 4; i += 1) {
      respostas.push((await POST(req({ email: 'fantasma@example.com' }, `192.0.2.${i}`))).status);
    }

    expect(respostas).toEqual([200, 200, 200, 429]);
  });

  it('resposta 429 traz Retry-After e não fala de conta nenhuma', async () => {
    const { POST } = await import('../app/api/auth/recuperar-senha/route');
    let res = await POST(req({ email: 'x@example.com' }, '198.51.100.77'));
    for (let i = 0; i < 5; i += 1) {
      res = await POST(req({ email: `x${i}@example.com` }, '198.51.100.77'));
    }

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect((await res.json()).message).not.toMatch(/conta|e-mail|cadastr/i);
  });
});

describe('resiliência', () => {
  it('Supabase mal configurado não vira 500 nem muda a resposta', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('../app/api/auth/recuperar-senha/route');

    const res = await POST(req({ email: 'cliente@example.com' }));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/se existir/i);
  });

  it('erro do provedor é registrado SEM o e-mail', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockReset.mockResolvedValue({ error: { message: 'smtp down' } });
    const { POST } = await import('../app/api/auth/recuperar-senha/route');

    await POST(req({ email: 'cliente@example.com' }));

    expect(err).toHaveBeenCalled();
    const logado = err.mock.calls.flat().join(' ');
    expect(logado).not.toContain('cliente@example.com');
  });
});
