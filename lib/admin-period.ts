/**
 * Filtro de período do painel administrativo.
 *
 * ── POR QUE FUSO EXPLÍCITO ──────────────────────────────────────────────────
 * O servidor da Vercel roda em UTC. "Hoje" calculado em UTC começa às 21h de
 * ontem em Brasília: às 22h de um sábado o painel mostraria os leads de
 * domingo. Todo recorte de dia aqui é o dia CIVIL de São Paulo, convertido
 * para o instante UTC correspondente antes de virar filtro no Postgres.
 *
 * O `from` é INCLUSIVO e o `to` é EXCLUSIVO (`gte` / `lt`). Com `lte` no fim
 * do dia, um registro gravado no último milissegundo cairia nos dois períodos
 * vizinhos ao mesmo tempo.
 */

export const ADMIN_TIMEZONE = 'America/Sao_Paulo';

export type PeriodKey = 'hoje' | '7d' | '30d' | '90d' | 'custom';

export interface PeriodRange {
  /** Instante ISO inclusivo. */
  from: string;
  /** Instante ISO exclusivo. */
  to: string;
}

export interface ResolvedPeriod extends PeriodRange {
  key: PeriodKey;
  label: string;
  /** Dia civil inicial (YYYY-MM-DD, São Paulo) — o que os inputs mostram. */
  fromDate: string;
  /** Dia civil final INCLUSIVO (YYYY-MM-DD, São Paulo). */
  toDate: string;
  /**
   * Mesma duração imediatamente antes de `from`. É o único período anterior
   * comparável com honestidade; quando o custom é aberto ele continua valendo
   * porque a duração é conhecida.
   */
  previous: PeriodRange;
  /** True quando `de`/`ate` vieram inválidos e caímos no padrão de 30 dias. */
  customInvalid: boolean;
}

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PRESET_DAYS: Record<Exclude<PeriodKey, 'custom'>, number> = {
  hoje: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const PRESET_LABEL: Record<Exclude<PeriodKey, 'custom'>, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
};

export const PERIOD_PRESETS: { key: Exclude<PeriodKey, 'custom'>; label: string }[] = [
  { key: 'hoje', label: PRESET_LABEL.hoje },
  { key: '7d', label: PRESET_LABEL['7d'] },
  { key: '30d', label: PRESET_LABEL['30d'] },
  { key: '90d', label: PRESET_LABEL['90d'] },
];

const zoneFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ADMIN_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function zoneParts(instant: Date) {
  const parts = zoneFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  // `hour` sai como 24 na virada em alguns runtimes com hour12: false.
  const hour = get('hour') % 24;
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute'), second: get('second') };
}

/** Dia civil em São Paulo (YYYY-MM-DD) do instante dado. */
export function civilDate(instant: Date): string {
  const { year, month, day } = zoneParts(instant);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Instante UTC do começo (00:00) de um dia civil de São Paulo.
 *
 * Descobre o deslocamento do fuso comparando o mesmo instante formatado no
 * fuso e em UTC, em vez de assumir -03:00 na mão. O Brasil não tem horário de
 * verão desde 2019, mas hardcodar o número seria uma bomba-relógio silenciosa
 * se ele voltar.
 */
export function startOfCivilDay(dateStr: string): Date {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const { year, month, day, hour, minute, second } = zoneParts(guess);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

function addDays(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T00:00:00Z`);
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function isRealDate(dateStr: string): boolean {
  if (!ISO_DATE.test(dateStr)) return false;
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateStr;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function build(key: PeriodKey, label: string, fromDate: string, toDate: string, customInvalid: boolean): ResolvedPeriod {
  const from = startOfCivilDay(fromDate);
  // `to` exclusivo: começo do dia SEGUINTE ao último dia do intervalo.
  const to = startOfCivilDay(addDays(toDate, 1));
  const durationMs = to.getTime() - from.getTime();
  return {
    key,
    label,
    fromDate,
    toDate,
    from: from.toISOString(),
    to: to.toISOString(),
    previous: {
      from: new Date(from.getTime() - durationMs).toISOString(),
      to: from.toISOString(),
    },
    customInvalid,
  };
}

/**
 * Traduz a query string (`?periodo=&de=&ate=`) em um intervalo concreto.
 * Entrada desconhecida cai no padrão de 30 dias — o painel nunca deixa de
 * responder por causa de uma URL torta.
 */
export function resolvePeriod(
  searchParams: Record<string, string | string[] | undefined> = {},
  now: Date = new Date(),
): ResolvedPeriod {
  const today = civilDate(now);
  const rawKey = firstValue(searchParams.periodo);

  if (rawKey === 'custom') {
    const de = firstValue(searchParams.de) ?? '';
    const ate = firstValue(searchParams.ate) ?? '';
    if (isRealDate(de) && isRealDate(ate) && de <= ate) {
      return build('custom', `${formatCivil(de)} — ${formatCivil(ate)}`, de, ate, false);
    }
    return build('30d', PRESET_LABEL['30d'], addDays(today, -(PRESET_DAYS['30d'] - 1)), today, true);
  }

  const key: Exclude<PeriodKey, 'custom'> =
    rawKey === 'hoje' || rawKey === '7d' || rawKey === '90d' || rawKey === '30d' ? rawKey : '30d';

  // "Últimos 7 dias" inclui hoje: 6 dias atrás até hoje.
  return build(key, PRESET_LABEL[key], addDays(today, -(PRESET_DAYS[key] - 1)), today, false);
}

/** DD/MM/AAAA a partir de YYYY-MM-DD, sem passar por Date (nada de fuso). */
export function formatCivil(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}
