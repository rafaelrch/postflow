/**
 * Cliente HTTP do Asaas.
 *
 * ⚠️ SERVIDOR APENAS. Este módulo lê ASAAS_API_KEY do ambiente e NUNCA pode ser
 * importado por componente client — um `'use client'` que importe daqui vaza a
 * chave para o bundle do browser. Nada aqui usa (nem pode usar) NEXT_PUBLIC_.
 * Se precisar de algo do Asaas no client, passe pelo servidor via rota.
 *
 * Nada é validado no import, só no primeiro uso de verdade. Se validássemos no
 * topo, `next build` quebraria ao coletar dados das rotas em ambiente sem env —
 * foi assim que o cliente do provedor anterior quebrou o build, e o padrão
 * sobreviveu à troca porque a causa continua a mesma.
 */

import type { AsaasErrorItem } from './types';

export type AsaasEnv = 'sandbox' | 'production';

const BASE_URLS: Record<AsaasEnv, string> = {
  production: 'https://api.asaas.com/v3',
  sandbox: 'https://api-sandbox.asaas.com/v3',
};

/** Prefixo esperado da chave em cada ambiente. É isso que a trava confere. */
const KEY_PREFIXES: Record<AsaasEnv, string> = {
  production: '$aact_prod_',
  sandbox: '$aact_hmlg_',
};

/**
 * A doc recomenda 60s. Não é folga: é proteção. Desistir cedo e tentar de novo
 * pode gerar COBRANÇA DUPLICADA, porque a primeira requisição pode ter sido
 * processada mesmo sem a gente ter lido a resposta.
 */
export const ASAAS_TIMEOUT_MS = 60_000;

/** User-Agent é OBRIGATÓRIO para contas criadas depois de 13/06/2024. */
export const ASAAS_USER_AGENT = 'creatools';

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

/**
 * Erro devolvido pelo Asaas, já desempacotado do envelope
 * { errors: [{ code, description }] }.
 *
 * Não engolimos nem traduzimos: quem chamou é que sabe se um
 * `invalid_environment` deve virar 500 ou um `invalid_cpfCnpj` deve virar 422.
 */
export class AsaasError extends Error {
  readonly status: number;
  /** `code` do primeiro erro da lista — o caller decide pelo código, não pelo texto. */
  readonly code: string | null;
  readonly description: string | null;
  readonly errors: AsaasErrorItem[];

  constructor(status: number, errors: AsaasErrorItem[], fallbackMessage?: string) {
    const first = errors[0];
    const description = first?.description ?? fallbackMessage ?? null;
    super(description ?? `Asaas request failed with status ${status}`);
    this.name = 'AsaasError';
    this.status = status;
    this.code = first?.code ?? null;
    this.description = description;
    this.errors = errors;
  }
}

/** Erro de configuração (env). Separado do AsaasError: não veio da API. */
export class AsaasConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AsaasConfigError';
  }
}

export interface AsaasConfig {
  env: AsaasEnv;
  baseUrl: string;
  apiKey: string;
}

function readEnvName(): AsaasEnv {
  const raw = (process.env.ASAAS_ENV ?? '').trim().toLowerCase();
  // Default sandbox de propósito: se alguém esquecer de setar, o pior caso é
  // não cobrar — nunca cobrar de verdade sem querer.
  if (!raw) return 'sandbox';
  if (raw !== 'sandbox' && raw !== 'production') {
    throw new AsaasConfigError(
      `ASAAS_ENV inválido: "${raw}". Use "sandbox" ou "production".`,
    );
  }
  return raw;
}

/**
 * Resolve e VALIDA a configuração. Chamada no primeiro uso, nunca no import.
 *
 * A conferência de prefixo é a trava contra o pior acidente possível desta
 * migração: rodar com chave de produção achando que está em sandbox e cobrar
 * de verdade o cartão de alguém. Chave trocada também falharia no Asaas (401
 * `invalid_environment`), mas aí a requisição já teria saído — melhor barrar
 * antes de sair da nossa máquina.
 *
 * Não há cache: ler process.env é barato e cachear só criaria config velha
 * entre testes e entre recargas de dev.
 */
export function getAsaasConfig(): AsaasConfig {
  const env = readEnvName();
  const apiKey = (process.env.ASAAS_API_KEY ?? '').trim();

  if (!apiKey) {
    throw new AsaasConfigError('Missing ASAAS_API_KEY env var');
  }

  const expected = KEY_PREFIXES[env];
  const other: AsaasEnv = env === 'sandbox' ? 'production' : 'sandbox';

  if (!apiKey.startsWith(expected)) {
    const looksLikeOther = apiKey.startsWith(KEY_PREFIXES[other]);
    throw new AsaasConfigError(
      looksLikeOther
        ? `ASAAS_ENV="${env}" mas ASAAS_API_KEY tem prefixo de ${other} ("${KEY_PREFIXES[other]}"). ` +
          `Corrija uma das duas antes de continuar — com essa combinação você cobraria no ambiente errado.`
        : `ASAAS_API_KEY não tem o prefixo esperado para ASAAS_ENV="${env}" (esperado "${expected}").`,
    );
  }

  return { env, baseUrl: BASE_URLS[env], apiKey };
}

/** URL base do ambiente atual. Nunca escreva a URL literal fora deste módulo. */
export function asaasBaseUrl(): string {
  return getAsaasConfig().baseUrl;
}

export interface AsaasRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Serializado como JSON. Ignorado em GET (ver comentário abaixo). */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  /** Base do backoff exponencial. Existe para o teste não esperar de verdade. */
  retryBaseMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: AsaasRequestOptions['query'],
): string {
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Extrai a lista de erros do envelope do Asaas, tolerando corpo fora do padrão. */
function parseErrors(payload: unknown): AsaasErrorItem[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { errors?: unknown }).errors)) {
    return (payload as { errors: AsaasErrorItem[] }).errors;
  }
  return [];
}

/**
 * Só 5xx e 429 merecem nova tentativa.
 *
 * 4xx (fora 429) NUNCA: é erro nosso — payload inválido, chave errada, recurso
 * inexistente. Repetir só multiplica o mesmo erro e, num POST de cobrança,
 * arrisca duplicar a intenção de cobrança.
 */
function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Faz a requisição, com timeout, retry limitado e erro tipado.
 *
 * REGRA DE OURO DO RETRY: erro de REDE (timeout, conexão caída) em qualquer
 * método que não seja GET NÃO é repetido. Nesse caso a requisição pode ter
 * chegado e sido processada — só a resposta se perdeu. Repetir um
 * POST /checkouts nessa situação cria uma segunda cobrança, e cobrança
 * duplicada é muito pior para o usuário do que um erro visível na tela.
 */
export async function asaasRequest<T>(
  path: string,
  options: AsaasRequestOptions = {},
): Promise<T> {
  const { baseUrl, apiKey } = getAsaasConfig();
  const method = options.method ?? 'GET';
  const url = buildUrl(baseUrl, path, options.query);
  const timeoutMs = options.timeoutMs ?? ASAAS_TIMEOUT_MS;
  const retryBaseMs = options.retryBaseMs ?? RETRY_BASE_MS;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;

  // A doc é explícita: "Requisições GET devem ser enviadas com o body vazio.
  // Caso contrário, a API poderá retornar erro 403 Forbidden."
  const sendBody = method !== 'GET' && options.body !== undefined;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': ASAAS_USER_AGENT,
    access_token: apiKey,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: sendBody ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      // Rede/timeout: só GET pode repetir (idempotente por definição).
      if (method === 'GET' && attempt < maxRetries) {
        await sleep(retryBaseMs * 2 ** attempt);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }

    const raw = await response.text();
    let payload: unknown = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }

    if (response.ok) {
      return payload as T;
    }

    if (isRetriableStatus(response.status) && attempt < maxRetries) {
      lastError = new AsaasError(response.status, parseErrors(payload), raw || undefined);
      await sleep(retryBaseMs * 2 ** attempt);
      continue;
    }

    throw new AsaasError(response.status, parseErrors(payload), raw || undefined);
  }

  // Só chega aqui se o loop esgotou as tentativas — lastError sempre existe.
  throw lastError instanceof Error
    ? lastError
    : new Error('Asaas request failed after retries');
}
