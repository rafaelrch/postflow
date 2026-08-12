import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AsaasConfigError,
  AsaasError,
  asaasBaseUrl,
  asaasRequest,
  getAsaasConfig,
} from '../lib/asaas/client';

const SANDBOX_KEY = '$aact_hmlg_FAKE_NAO_E_CHAVE_REAL';
const PROD_KEY = '$aact_prod_FAKE_NAO_E_CHAVE_REAL';

/** Resposta JSON pronta, para não repetir o boilerplate do Response. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Sequência de respostas: uma por chamada, na ordem. */
function fetchSequence(...responses: Response[]) {
  const mock = vi.fn();
  for (const response of responses) mock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Backoff zerado: o teste verifica QUANTAS tentativas, não quanto esperou. */
const NO_WAIT = { retryBaseMs: 0 } as const;

/** Captura o erro rejeitado já tipado, para poder inspecionar status/code. */
async function rejection(promise: Promise<unknown>): Promise<AsaasError> {
  return promise.then(
    () => {
      throw new Error('esperava rejeição, mas resolveu');
    },
    (error: AsaasError) => error,
  );
}

beforeEach(() => {
  vi.stubEnv('ASAAS_ENV', 'sandbox');
  vi.stubEnv('ASAAS_API_KEY', SANDBOX_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('configuração de ambiente', () => {
  it('sandbox usa a base de sandbox', () => {
    expect(asaasBaseUrl()).toBe('https://api-sandbox.asaas.com/v3');
    expect(getAsaasConfig().env).toBe('sandbox');
  });

  it('production usa a base de produção', () => {
    vi.stubEnv('ASAAS_ENV', 'production');
    vi.stubEnv('ASAAS_API_KEY', PROD_KEY);
    expect(asaasBaseUrl()).toBe('https://api.asaas.com/v3');
    expect(getAsaasConfig().env).toBe('production');
  });

  it('sem ASAAS_ENV assume sandbox (nunca cobrar sem querer)', () => {
    vi.stubEnv('ASAAS_ENV', '');
    expect(getAsaasConfig().env).toBe('sandbox');
    expect(asaasBaseUrl()).toBe('https://api-sandbox.asaas.com/v3');
  });

  it('ASAAS_ENV com valor inesperado lança', () => {
    vi.stubEnv('ASAAS_ENV', 'staging');
    expect(() => getAsaasConfig()).toThrow(AsaasConfigError);
  });

  it('sem ASAAS_API_KEY lança', () => {
    vi.stubEnv('ASAAS_API_KEY', '');
    expect(() => getAsaasConfig()).toThrow(/ASAAS_API_KEY/);
  });

  it('TRAVA: chave de produção com ASAAS_ENV=sandbox lança', () => {
    vi.stubEnv('ASAAS_ENV', 'sandbox');
    vi.stubEnv('ASAAS_API_KEY', PROD_KEY);
    expect(() => getAsaasConfig()).toThrow(AsaasConfigError);
    expect(() => getAsaasConfig()).toThrow(/prefixo de production/);
  });

  it('TRAVA: chave de sandbox com ASAAS_ENV=production lança', () => {
    vi.stubEnv('ASAAS_ENV', 'production');
    vi.stubEnv('ASAAS_API_KEY', SANDBOX_KEY);
    expect(() => getAsaasConfig()).toThrow(/prefixo de sandbox/);
  });

  it('a trava barra ANTES de qualquer requisição sair', async () => {
    const fetchMock = fetchSequence(jsonResponse(200, { id: 'cus_1' }));
    vi.stubEnv('ASAAS_API_KEY', PROD_KEY);
    await expect(asaasRequest('/customers/cus_1')).rejects.toThrow(AsaasConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('headers obrigatórios', () => {
  it('manda Content-Type, User-Agent e access_token', async () => {
    const fetchMock = fetchSequence(jsonResponse(200, { id: 'cus_1' }));
    await asaasRequest('/customers/cus_1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-sandbox.asaas.com/v3/customers/cus_1');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      // Obrigatório para contas criadas depois de 13/06/2024.
      'User-Agent': 'creatools',
      access_token: SANDBOX_KEY,
    });
  });

  it('GET vai sem body (a doc devolve 403 se houver)', async () => {
    const fetchMock = fetchSequence(jsonResponse(200, {}));
    await asaasRequest('/customers/cus_1', { body: { nao: 'deve ir' } });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('POST serializa o body em JSON', async () => {
    const fetchMock = fetchSequence(jsonResponse(200, { id: 'chk_1' }));
    await asaasRequest('/checkouts', { method: 'POST', body: { items: [] } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ items: [] });
  });

  it('query string ignora valores vazios', async () => {
    const fetchMock = fetchSequence(jsonResponse(200, { data: [] }));
    await asaasRequest('/subscriptions/sub_1/payments', {
      query: { status: 'CONFIRMED', offset: undefined },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api-sandbox.asaas.com/v3/subscriptions/sub_1/payments?status=CONFIRMED',
    );
  });
});

describe('erro do Asaas', () => {
  it('{ errors: [...] } vira AsaasError com code e description', async () => {
    fetchSequence(
      jsonResponse(400, {
        errors: [
          { code: 'invalid_cpfCnpj', description: 'O CPF/CNPJ informado é inválido.' },
        ],
      }),
    );

    const error = await rejection(
      asaasRequest('/customers', { method: 'POST', body: {}, ...NO_WAIT }),
    );
    expect(error).toBeInstanceOf(AsaasError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_cpfCnpj');
    expect(error.description).toBe('O CPF/CNPJ informado é inválido.');
    expect(error.errors).toHaveLength(1);
    expect(error.message).toBe('O CPF/CNPJ informado é inválido.');
  });

  it('401 invalid_environment chega inteiro ao caller', async () => {
    fetchSequence(
      jsonResponse(401, {
        errors: [{ code: 'invalid_environment', description: 'Chave de ambiente inválida.' }],
      }),
    );
    const error = await rejection(asaasRequest('/payments/pay_1', NO_WAIT));
    expect(error).toBeInstanceOf(AsaasError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('invalid_environment');
  });

  it('corpo fora do padrão ainda vira AsaasError com status', async () => {
    // Um Response novo por chamada: 502 é retriável e o body só pode ser lido
    // uma vez — reaproveitar a mesma instância quebraria na segunda tentativa.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 502 })),
    );
    const error = await rejection(asaasRequest('/payments/pay_1', NO_WAIT));
    expect(error).toBeInstanceOf(AsaasError);
    expect(error.status).toBe(502);
    expect(error.code).toBeNull();
    expect(error.errors).toEqual([]);
  });
});

describe('retry', () => {
  it('500 é repetido e o sucesso seguinte é devolvido', async () => {
    const fetchMock = fetchSequence(
      jsonResponse(500, { errors: [{ code: 'internal', description: 'boom' }] }),
      jsonResponse(200, { id: 'pay_1' }),
    );
    await expect(asaasRequest('/payments/pay_1', NO_WAIT)).resolves.toEqual({ id: 'pay_1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 é repetido', async () => {
    const fetchMock = fetchSequence(
      jsonResponse(429, { errors: [{ code: 'rate_limit', description: 'devagar' }] }),
      jsonResponse(200, { id: 'pay_1' }),
    );
    await asaasRequest('/payments/pay_1', NO_WAIT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('esgotadas as tentativas, o último erro sobe', async () => {
    const fetchMock = fetchSequence(
      jsonResponse(503, {}),
      jsonResponse(503, {}),
      jsonResponse(503, {}),
    );
    const error = await rejection(asaasRequest('/payments/pay_1', NO_WAIT));
    expect(error).toBeInstanceOf(AsaasError);
    expect(error.status).toBe(503);
    // 1 tentativa + 2 retries
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('400 NÃO é repetido', async () => {
    const fetchMock = fetchSequence(jsonResponse(400, { errors: [{ code: 'invalid' }] }));
    await expect(asaasRequest('/checkouts', { method: 'POST', body: {}, ...NO_WAIT })).rejects.toThrow(
      AsaasError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('422 NÃO é repetido', async () => {
    const fetchMock = fetchSequence(jsonResponse(422, { errors: [{ code: 'unprocessable' }] }));
    await expect(asaasRequest('/checkouts', { method: 'POST', body: {}, ...NO_WAIT })).rejects.toThrow(
      AsaasError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('404 NÃO é repetido', async () => {
    const fetchMock = fetchSequence(jsonResponse(404, { errors: [{ code: 'not_found' }] }));
    await expect(asaasRequest('/payments/pay_x', NO_WAIT)).rejects.toThrow(AsaasError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('erro de REDE em POST NÃO é repetido — cobrança duplicada é pior que erro visível', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      asaasRequest('/checkouts', { method: 'POST', body: { items: [] }, ...NO_WAIT }),
    ).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('erro de rede em GET é repetido (idempotente)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'pay_1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(asaasRequest('/payments/pay_1', NO_WAIT)).resolves.toEqual({ id: 'pay_1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('timeout', () => {
  it('aborta a requisição quando estoura o prazo', async () => {
    // Nunca responde: só termina quando o AbortController dispara.
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      asaasRequest('/payments/pay_1', { timeoutMs: 20, maxRetries: 0, ...NO_WAIT }),
    ).rejects.toThrow(/abort/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passa um AbortSignal para o fetch mesmo no caminho feliz', async () => {
    const fetchMock = fetchSequence(jsonResponse(200, {}));
    await asaasRequest('/payments/pay_1');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
