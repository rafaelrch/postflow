import Link from 'next/link';
import { AlertCircle, CheckCircle2, CircleAlert, ShieldAlert, TriangleAlert } from 'lucide-react';
import { HEALTH_CHECKS, type HealthAlert, type HealthCheckResult, type HealthSeverity } from '@/lib/admin-health';
import { formatCount, formatDateTime } from '@/lib/admin-format';
import MetricRetryButton from '@/components/admin/MetricRetryButton';

const severityLabel: Record<HealthSeverity, string> = {
  critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo',
};

function affectedHref(alert: HealthAlert, row: HealthAlert['rows'][number]): string {
  if (row.linkKind === 'finance') return '/admin/financeiro?periodo=30d';
  const query = new URLSearchParams({ periodo: '30d' });
  if (row.email) query.set('q', row.email);
  else if (alert.key === 'paid_without_account' || alert.key === 'unconfirmed_subscription') query.set('f', 'paid_without_account');
  return `/admin/clientes?${query}`;
}

function AlertCard({ alert }: { alert: HealthAlert }) {
  const clean = alert.count === 0;
  const Icon = alert.severity === 'critical' ? ShieldAlert : alert.severity === 'high' ? TriangleAlert : CircleAlert;

  return (
    <article className="admin-health-card" data-severity={alert.severity} data-clean={clean ? 'true' : 'false'}>
      <header>
        <span className="admin-health-icon">{clean ? <CheckCircle2 size={17} /> : <Icon size={17} />}</span>
        <div><h2>{alert.title}</h2><p>{alert.description}</p></div>
        <span className="admin-health-severity">{clean ? 'Limpo' : severityLabel[alert.severity]}</span>
      </header>

      <div className="admin-health-summary">
        <strong>{formatCount(alert.count)}</strong>
        <span>{clean ? 'Nenhuma ocorrência' : alert.count === 1 ? 'ocorrência' : 'ocorrências'}</span>
        {!clean && <dl><div><dt>Primeira</dt><dd>{alert.firstAt ? formatDateTime(alert.firstAt) : '—'}</dd></div><div><dt>Última</dt><dd>{alert.lastAt ? formatDateTime(alert.lastAt) : '—'}</dd></div></dl>}
      </div>

      {!clean && alert.rows.length > 0 && (
        <div className="admin-health-list">
          {alert.rows.map((row) => (
            <Link key={`${alert.key}-${row.recordKey}`} href={affectedHref(alert, row)}>
              <span><strong>{row.email ?? row.recordKey}</strong><small>{row.detail}</small></span>
              <time>{row.occurredAt ? formatDateTime(row.occurredAt) : '—'}</time>
            </Link>
          ))}
          {alert.count > alert.rows.length && <p>Mais {formatCount(alert.count - alert.rows.length)} ocorrência(s) fora desta amostra.</p>}
        </div>
      )}

      <footer><strong>Ação sugerida</strong><span>{alert.suggestedAction}</span></footer>
    </article>
  );
}

export default function HealthDashboard({ checks }: { checks: HealthCheckResult[] }) {
  return (
    <div className="admin-health-sections">
      <section className="admin-metric-section" aria-labelledby="health-alerts-title">
        <div className="admin-group-heading">
          <div><h2 id="health-alerts-title">Verificações operacionais</h2><p>Somente leitura · nenhuma ação é executada automaticamente</p></div>
          <span className="admin-scope-badge">{HEALTH_CHECKS.length} regras ativas</span>
        </div>
        <div className="admin-health-grid">
          {checks.map((check, index) => check.ok
            ? <AlertCard key={check.value.key} alert={check.value} />
            : <article key={HEALTH_CHECKS[index].key} className="admin-health-failure" role="status"><AlertCircle size={18} /><div><strong>{HEALTH_CHECKS[index].title} não carregou</strong><p>Esta regra falhou isoladamente. Nenhuma ocorrência foi convertida em zero.</p></div><MetricRetryButton /></article>)}
        </div>
      </section>
    </div>
  );
}
