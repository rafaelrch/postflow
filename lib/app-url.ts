/**
 * URL base pública do app (usada em return/completion URLs de checkout e
 * redirects de auth). Em produção, NEXT_PUBLIC_APP_URL é obrigatória e não
 * pode apontar para localhost — falha ruidosamente em vez de gerar redirects
 * quebrados. Em dev, cai em http://localhost:3000.
 *
 * Vivia em lib/stripe.ts (fix B4). Foi extraída pra cá porque a migração
 * AbacatePay precisa dela e lib/stripe.ts vai ser deletado no corte final —
 * lib/stripe.ts reexporta daqui, então tests/app-url.test.ts segue válido.
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
  const base = envUrl ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
