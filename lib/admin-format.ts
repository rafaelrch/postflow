import { ADMIN_TIMEZONE } from './admin-period';

/**
 * Formatação do painel: pt-BR, BRL, fuso de São Paulo — em UM lugar.
 *
 * Os formatters do Intl são criados uma vez no módulo de propósito: instanciar
 * `Intl.NumberFormat` dentro do render de cada card é caro e é justamente o
 * tipo de coisa que só aparece quando a tela tem vinte cards.
 */

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: ADMIN_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatMoney(value: number): string {
  return brl.format(value);
}

export function formatCount(value: number): string {
  return integer.format(value);
}

export function formatDateTime(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? dateTime.format(new Date(parsed)) : '—';
}

/** "+12,5%" / "−8,0%" / null quando não dá para comparar com honestidade. */
export function formatVariation(value: number | null): string | null {
  if (value === null) return null;
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
