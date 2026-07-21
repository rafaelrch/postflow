/**
 * URL base pública do app (usada em return/completion URLs de checkout e
 * redirects de auth). Em produção, NEXT_PUBLIC_APP_URL é obrigatória e não
 * pode apontar para localhost — falha ruidosamente em vez de gerar redirects
 * quebrados. Em dev, cai em http://localhost:3000.
 *
 * Vivia em lib/stripe.ts (fix B4); foi extraída pra cá antes de o Stripe ser
 * removido. Hoje é a única casa dela — usada pela migração AbacatePay.
 */
export function appUrl(path = ''): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === 'production') {
    if (!envUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(envUrl)) {
      throw new Error(
        'NEXT_PUBLIC_APP_URL deve estar definida com a URL pública de produção ' +
          `(ex.: https://seu-dominio.com). Valor atual: ${envUrl ?? '(ausente)'}.`
      );
    }
  }
  const base = (envUrl ?? 'http://localhost:3000').replace(/\/$/, '');
  // Sem path, retorna a base pura (sem barra final) — casa com o header Origin
  // do navegador (RFC 6454 nunca traz barra final). Com path, garante uma única
  // barra inicial.
  return path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base;
}
