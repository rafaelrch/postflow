/**
 * Rate limiter em memória, janela fixa por chave (tipicamente IP). Simples de
 * propósito: o projeto não usa Redis/Upstash e o pedido é "N requisições por
 * minuto por IP" em rotas públicas de escrita (/api/leads, /api/abacatepay/checkout).
 *
 * CAVEAT serverless: o contador vive no processo. Com várias instâncias
 * (ex.: Vercel) cada uma tem o seu, então o teto efetivo é N × instâncias.
 * Ainda assim corta abuso trivial de uma origem — que é a proteção pedida. Um
 * limite distribuído (Redis) seria o passo seguinte se precisar de rigor.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

/**
 * Registra uma tentativa em `key` e diz se ela passa. `now` é injetável para
 * teste determinístico (simular expiração da janela sem esperar tempo real).
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);

  // Sem bucket ou janela expirada → começa uma nova.
  if (!existing || now >= existing.resetAt) {
    const resetAt = now + opts.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: opts.limit - 1, resetAt, retryAfterSec: 0 };
  }

  if (existing.count >= opts.limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: opts.limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSec: 0,
  };
}

/** Zera o estado — só para isolar casos de teste. */
export function __resetRateLimit(): void {
  buckets.clear();
}

/**
 * IP do cliente a partir dos headers de proxy. `x-forwarded-for` pode ser uma
 * lista "cliente, proxy1, proxy2" — o primeiro é a origem. Fallback para
 * `x-real-ip` e, por último, 'unknown' (nunca lança).
 */
export function clientIp(req: { headers?: { get(name: string): string | null } }): string {
  const get = req.headers?.get?.bind(req.headers);
  if (!get) return 'unknown';
  const xff = get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim() || 'unknown';
  return get('x-real-ip')?.trim() || 'unknown';
}
