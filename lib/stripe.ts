import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Lazily-instantiated Stripe client. Não lança no import (senão `next build`
 * quebra ao coletar dados das rotas sem env). Lança só quando realmente usado
 * sem STRIPE_SECRET_KEY configurada.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY env var');
  _stripe = new Stripe(key, {
    typescript: true,
    appInfo: { name: 'PostFlow', version: '0.1.0' },
  });
  return _stripe;
}

/** Proxy de conveniência: `stripe.checkout.sessions.create(...)` funciona normalmente. */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    const client = getStripe();
    // @ts-expect-error indexação dinâmica
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY ?? '';
export const STRIPE_PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY ?? '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

/**
 * Dias de teste grátis aplicados ao plano ANUAL (badge "3 meses grátis" na
 * página de preços). Defina STRIPE_TRIAL_DAYS_YEARLY=0 para desativar o trial.
 */
export const STRIPE_TRIAL_DAYS_YEARLY =
  Number.isFinite(Number(process.env.STRIPE_TRIAL_DAYS_YEARLY))
    ? Number(process.env.STRIPE_TRIAL_DAYS_YEARLY)
    : 90;

export type PlanInterval = 'month' | 'year';

export function priceIdForInterval(interval: PlanInterval): string {
  return interval === 'year' ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
}

export function appUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
