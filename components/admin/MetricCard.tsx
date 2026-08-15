import MetricHint from './MetricHint';
import MetricRetryButton from './MetricRetryButton';
import type { LucideIcon } from 'lucide-react';

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

export interface MetricCardProps {
  label: string;
  value?: string;
  /** Definição exata da métrica — vira o texto do "?". */
  hint: string;
  /** Linha de apoio embaixo do número (recorte, composição, ressalva). */
  detail?: string;
  /** Variação já formatada contra o período anterior, quando é honesta. */
  variation?: string | null;
  tone?: MetricTone;
  icon: LucideIcon;
  featured?: boolean;
  /** Falha isolada: nunca renderiza zero/traço como substituto. */
  failed?: boolean;
  testId?: string;
}

export default function MetricCard({
  label,
  value,
  hint,
  detail,
  variation,
  tone = 'default',
  icon: Icon,
  featured = false,
  failed = false,
  testId,
}: MetricCardProps) {
  return (
    <article
      data-testid={testId}
      // A definição também fica no DOM como atributo: é o que permite o teste
      // afirmar "nenhum card sem contrato" sem depender de abrir cada "?".
      data-hint={hint}
      data-tone={tone}
      data-featured={featured ? 'true' : 'false'}
      data-failed={failed ? 'true' : 'false'}
      className="admin-metric-card"
    >
      <header>
        <span className="admin-metric-icon"><Icon size={15} strokeWidth={1.75} aria-hidden /></span>
        <h3>{label}</h3>
        <MetricHint label={label} hint={hint} />
      </header>

      {failed ? (
        <div className="admin-metric-failure" role="status">
          <p>Não deu para ler</p>
          <MetricRetryButton />
        </div>
      ) : (
        <p className="admin-metric-value">{value}</p>
      )}

      {!failed && (detail || variation) && (
        <footer>
          {variation && <span className={`admin-metric-variation ${variation.trim().startsWith('-') ? 'negative' : 'positive'}`}>{variation}</span>}
          {variation && detail && <span aria-hidden>·</span>}
          {detail && <span>{detail}</span>}
        </footer>
      )}
    </article>
  );
}
