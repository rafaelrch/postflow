import MetricHint from './MetricHint';

/**
 * Card de métrica do painel.
 *
 * O `hint` é OBRIGATÓRIO. Um número sem definição exata é onde o painel começa
 * a mentir: "assinaturas ativas" pode significar cinco coisas, e a pessoa que
 * lê o card seis meses depois não vai abrir o código para descobrir qual. O
 * texto do "?" é o contrato do número, então ele não é opcional — e existe um
 * teste que reprova card sem definição.
 *
 * Server Component: só o "?" é cliente (MetricHint), porque só ele tem estado.
 */

export type MetricTone = 'default' | 'accent' | 'warn';

const TONE_RING: Record<MetricTone, string> = {
  default: 'border-[var(--ink)]',
  accent: 'border-[var(--accent)]',
  warn: 'border-[var(--warn)]',
};

const TONE_VALUE: Record<MetricTone, string> = {
  default: 'text-[var(--ink)]',
  accent: 'text-[var(--accent)]',
  warn: 'text-[var(--ink)]',
};

export interface MetricCardProps {
  label: string;
  value: string;
  /** Definição exata da métrica — vira o texto do "?". */
  hint: string;
  /** Linha de apoio embaixo do número (recorte, composição, ressalva). */
  detail?: string;
  /** Variação já formatada contra o período anterior, quando é honesta. */
  variation?: string | null;
  tone?: MetricTone;
  testId?: string;
}

export default function MetricCard({
  label,
  value,
  hint,
  detail,
  variation,
  tone = 'default',
  testId,
}: MetricCardProps) {
  return (
    <article
      data-testid={testId}
      // A definição também fica no DOM como atributo: é o que permite o teste
      // afirmar "nenhum card sem contrato" sem depender de abrir cada "?".
      data-hint={hint}
      className={`brand-card flex flex-col gap-2 p-4 sm:p-5 ${TONE_RING[tone]}`}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="section-kicker leading-tight">{label}</h3>
        <MetricHint label={label} hint={hint} />
      </header>

      <p className={`font-mono text-3xl leading-none font-medium tabular-nums ${TONE_VALUE[tone]}`}>
        {value}
      </p>

      {(detail || variation) && (
        <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--ink-dim)]">
          {variation && <span className="font-mono text-[var(--ink-2)]">{variation}</span>}
          {variation && detail && <span aria-hidden className="text-[var(--line-strong)]">·</span>}
          {detail && <span>{detail}</span>}
        </footer>
      )}
    </article>
  );
}
