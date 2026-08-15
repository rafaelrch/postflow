import Link from 'next/link';
import { AlertTriangle, BadgeDollarSign, CalendarClock, CircleDollarSign, ReceiptText, RotateCcw, ShieldAlert, Users } from 'lucide-react';
import type { AdminFinance, FinanceIssue, FinanceRevenue, FinanceSubscriptionRow } from '@/lib/admin-finance';
import type { ResolvedPeriod } from '@/lib/admin-period';
import { formatCount, formatDateTime, formatMoney } from '@/lib/admin-format';
import MetricCard from '@/components/admin/MetricCard';
import MetricRetryButton from '@/components/admin/MetricRetryButton';
import SplitBar from '@/components/admin/SplitBar';

function BlockFailure({ label }: { label: string }) {
  return <div className="admin-finance-failure" role="status"><AlertTriangle size={16} /><div><strong>{label} não carregou</strong><p>Os outros blocos continuam válidos. Nenhum valor foi substituído por zero.</p></div><MetricRetryButton /></div>;
}

function RevenueChart({ revenue }: { revenue: FinanceRevenue }) {
  if (revenue.received.count === 0 || revenue.series.length === 0) {
    return (
      <article className="admin-finance-panel admin-revenue-empty" data-testid="finance-received-empty">
        <ReceiptText size={17} aria-hidden />
        <div>
          <h3>Nenhuma receita recebida no período</h3>
          <p>
            {revenue.confirmed.count > 0
              ? revenue.confirmed.count === 1
                ? '1 pagamento confirmado ainda não aparece como recebido.'
                : `${formatCount(revenue.confirmed.count)} pagamentos confirmados ainda não aparecem como recebidos.`
              : 'Não houve liquidação registrada neste recorte.'}
          </p>
        </div>
      </article>
    );
  }

  const values = revenue.series.map((point) => point.amount);
  const max = Math.max(...values, 1);
  const points = revenue.series.map((point, index) => {
    const x = revenue.series.length === 1 ? 50 : (index / (revenue.series.length - 1)) * 100;
    return `${x},${94 - (point.amount / max) * 82}`;
  }).join(' ');
  return (
    <article className="admin-finance-panel admin-revenue-chart">
      <header><div><h3>Receita recebida</h3><p>Série por {revenue.grain === 'day' ? 'dia' : revenue.grain === 'week' ? 'semana' : 'mês'}</p></div><strong>{formatMoney(revenue.received.amount)}</strong></header>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Série de receita recebida bruta">
        <line x1="0" y1="94" x2="100" y2="94" />
        {points && <polyline points={points} />}
      </svg>
      <footer><span>{revenue.series[0]?.bucket ?? '—'}</span><span>{revenue.series.at(-1)?.bucket ?? '—'}</span></footer>
    </article>
  );
}

function customerHref(period: ResolvedPeriod, email: string | null): string {
  const query = new URLSearchParams({ periodo: period.key });
  if (period.key === 'custom') { query.set('de', period.fromDate); query.set('ate', period.toDate); }
  if (email) query.set('q', email); else query.set('f', 'paid_without_account');
  return `/admin/clientes?${query}`;
}

function IssueRows({ rows, period }: { rows: FinanceIssue[]; period: ResolvedPeriod }) {
  if (!rows.length) return <p className="admin-finance-empty">Nenhum pagamento exige atenção neste período.</p>;
  return <div className="admin-finance-list">{rows.map((row) => <Link key={`${row.providerPaymentId}-${row.issueType}`} href={customerHref(period, row.email)}><span><strong>{row.email ?? 'Conta não vinculada'}</strong><small>{row.issueType} · {formatDateTime(row.issueAt)}</small></span><b>{row.grossValue === null ? 'Valor ausente' : formatMoney(row.grossValue)}</b></Link>)}</div>;
}

function SubscriptionRows({ rows, empty, period }: { rows: FinanceSubscriptionRow[]; empty: string; period: ResolvedPeriod }) {
  if (!rows.length) return <p className="admin-finance-empty">{empty}</p>;
  return <div className="admin-finance-list">{rows.map((row) => <Link key={row.id} href={customerHref(period, row.email)}><span><strong>{row.email ?? 'Conta não vinculada'}</strong><small>{row.planInterval ?? 'Plano não identificado'} · {row.currentPeriodEnd ? formatDateTime(row.currentPeriodEnd) : 'Sem data de renovação'}</small></span><b>{row.value === null ? 'Valor ausente' : formatMoney(row.value)}</b></Link>)}</div>;
}

export default function FinanceDashboard({ data, period }: { data: AdminFinance; period: ResolvedPeriod }) {
  const noTransactions = data.revenue.ok && data.revenue.value.received.count + data.revenue.value.confirmed.count + data.revenue.value.refunded.count + data.revenue.value.chargeback.count === 0;
  return (
    <div className="admin-finance-sections">
      <section className="admin-metric-section" aria-labelledby="finance-revenue">
        <div className="admin-group-heading"><div><h2 id="finance-revenue">Receita</h2><p>{period.label} · confirmado e recebido são eventos diferentes</p></div><span className="admin-scope-badge">Histórico normalizado</span></div>
        {!data.revenue.ok ? <BlockFailure label="Receita do período" /> : <>
          <div className="admin-metrics-grid" data-testid="finance-revenue-cards">
            <MetricCard icon={CircleDollarSign} label="Receita recebida bruta" value={formatMoney(data.revenue.value.received.amount)} detail={`${formatCount(data.revenue.value.received.count)} cobrança(s)`} hint="Pagamentos com evento PAYMENT_RECEIVED no período. Valor bruto: a taxa do Asaas não está disponível e nenhuma receita líquida é inferida." featured />
            <MetricCard icon={BadgeDollarSign} label="Pagamentos confirmados" value={formatMoney(data.revenue.value.confirmed.amount)} detail={`${formatCount(data.revenue.value.confirmed.count)} cobrança(s)`} hint="Pagamentos confirmados no período que ainda não aparecem como recebidos. Confirmado é venda aprovada; recebido é dinheiro efetivamente registrado como recebido." />
            <MetricCard icon={RotateCcw} label="Reembolsos" value={formatMoney(data.revenue.value.refunded.amount)} detail={`${formatCount(data.revenue.value.refunded.count)} cobrança(s)`} hint="Cobranças com evento de reembolso no período. Uma cobrança reembolsada é excluída da receita confirmada e recebida para evitar receita fictícia." tone={data.revenue.value.refunded.count ? 'warn' : 'default'} />
            <MetricCard icon={ShieldAlert} label="Chargebacks" value={formatMoney(data.revenue.value.chargeback.amount)} detail={`${formatCount(data.revenue.value.chargeback.count)} cobrança(s)`} hint="Cobranças com chargeback no período. São excluídas da receita confirmada e recebida." tone={data.revenue.value.chargeback.count ? 'accent' : 'default'} />
          </div>
          {noTransactions ? <div className="admin-finance-zero" data-testid="finance-empty-state"><ReceiptText size={18} /><div><strong>Nenhuma transação no período</strong><p>Não houve confirmação, recebimento, reembolso nem chargeback neste recorte.</p></div></div> : <RevenueChart revenue={data.revenue.value} />}
          <div className="admin-finance-two">
            <article className="admin-finance-panel"><h3>Origem da receita recebida</h3><dl className="admin-finance-stats"><div><dt>Novas assinaturas observadas</dt><dd>{formatCount(data.revenue.value.newSubscriptions)}</dd></div><div><dt>Renovações observadas</dt><dd>{formatCount(data.revenue.value.renewals)}</dd></div></dl><p className="admin-data-note">A classificação usa a primeira cobrança observada da assinatura. O histórico começa em {data.revenue.value.historyStartedAt ? formatDateTime(data.revenue.value.historyStartedAt) : 'nenhuma transação registrada'}.</p></article>
            <article className="admin-finance-panel"><h3>Receita recebida por plano</h3>{data.revenue.value.byPlan.length ? <div className="admin-finance-stats">{data.revenue.value.byPlan.map((row) => <div key={row.plan}><dt>{row.plan === 'month' ? 'Mensal' : row.plan === 'year' ? 'Anual' : 'Não identificado'}</dt><dd>{formatMoney(row.amount)} <small>· {row.count}</small></dd></div>)}</div> : <p className="admin-finance-empty">Sem receita recebida para distribuir.</p>}</article>
          </div>
        </>}
      </section>

      <section className="admin-metric-section" aria-labelledby="finance-recurring">
        <div className="admin-group-heading"><div><h2 id="finance-recurring">Receita recorrente atual</h2><p>Foto da base ativa; não muda com o período</p></div><span className="admin-scope-badge">Sem série histórica confiável</span></div>
        {!data.current.ok ? <BlockFailure label="MRR e ARR atuais" /> : <>
          <div className="admin-metrics-grid">
            <MetricCard icon={CircleDollarSign} label="MRR atual" value={formatMoney(data.current.value.mrr)} hint="Receita recorrente mensal normalizada da base ativa atual. Planos anuais são divididos por 12. Não é dinheiro recebido." featured />
            <MetricCard icon={BadgeDollarSign} label="ARR atual" value={formatMoney(data.current.value.arr)} hint="MRR atual multiplicado por 12. É projeção da base atual, não faturamento histórico." />
            <MetricCard icon={Users} label="Assinantes mensais" value={formatCount(data.current.value.monthly.count)} detail={formatMoney(data.current.value.monthly.value)} hint="Assinaturas mensais ativas e o valor contratado atual." />
            <MetricCard icon={Users} label="Assinantes anuais" value={formatCount(data.current.value.yearly.count)} detail={formatMoney(data.current.value.yearly.value)} hint="Assinaturas anuais ativas e o valor contratado atual, sem normalização mensal nesta linha." />
          </div>
          <article className="admin-distribution-card"><h3>Distribuição mensal × anual</h3><SplitBar parts={[{ label: 'Mensal', value: data.current.value.monthly.count, className: 'admin-split-monthly' }, { label: 'Anual', value: data.current.value.yearly.count, className: 'admin-split-annual' }]} />{data.current.value.missingValue > 0 && <p>{formatCount(data.current.value.missingValue)} assinatura(s) ativa(s) sem valor ficaram fora do MRR/ARR.</p>}</article>
          <p className="admin-data-note">Não existe snapshot histórico de assinatura para reconstruir MRR e ARR passados com confiança. A série de transações só existe a partir do primeiro evento normalizado; o painel não fabrica o passado.</p>
        </>}
      </section>

      <section className="admin-metric-section" aria-labelledby="finance-attention">
        <div className="admin-group-heading"><div><h2 id="finance-attention">Atenção</h2><p>Falhas, devoluções e vínculos que pedem acompanhamento</p></div></div>
        {!data.attention.ok ? <BlockFailure label="Itens de atenção" /> : <div className="admin-finance-grid">
          <article className="admin-finance-panel admin-finance-panel--wide"><h3>Pagamentos no período</h3><IssueRows rows={data.attention.value.issues} period={period} /></article>
          <article className="admin-finance-panel"><h3>Cancelamento agendado · {formatCount(data.attention.value.scheduledCancellations.count)}</h3><SubscriptionRows rows={data.attention.value.scheduledCancellations.rows} empty="Nenhum cancelamento agendado." period={period} /></article>
          <article className="admin-finance-panel"><h3>Pagou sem conta · {formatCount(data.attention.value.paidWithoutAccount.count)}</h3><SubscriptionRows rows={data.attention.value.paidWithoutAccount.rows} empty="Nenhuma assinatura paga sem conta." period={period} /></article>
          <aside className="admin-finance-caveat"><AlertTriangle size={16} /><p><strong>Churn histórico não é exibido.</strong> <code>canceled_at</code> mistura pedido, fim de acesso, troca de plano, reembolso e chargeback. Sem um histórico inequívoco de status, uma taxa pareceria precisa e estaria errada.</p></aside>
        </div>}
      </section>

      <section className="admin-metric-section" aria-labelledby="finance-forecast">
        <div className="admin-group-heading"><div><h2 id="finance-forecast">Cobranças previstas</h2><p>Lista da base ativa; previsão não é recebimento garantido</p></div><span className="admin-scope-badge">Foto de agora</span></div>
        {!data.forecast.ok ? <BlockFailure label="Cobranças previstas" /> : <div className="admin-finance-two">
          <article className="admin-finance-panel"><header className="admin-finance-card-title"><div><h3>Próximos 7 dias</h3><p>{formatCount(data.forecast.value.next7.count)} cobrança(s)</p></div><strong>{formatMoney(data.forecast.value.next7.amount)}</strong></header>{data.forecast.value.next7.missingValue > 0 && <p className="admin-finance-warning">Valor é um piso: {formatCount(data.forecast.value.next7.missingValue)} cobrança(s) sem valor.</p>}<SubscriptionRows rows={data.forecast.value.next7.rows} empty="Nenhuma cobrança prevista nesta janela." period={period} /></article>
          <article className="admin-finance-panel"><header className="admin-finance-card-title"><div><h3>Próximos 30 dias</h3><p>{formatCount(data.forecast.value.next30.count)} cobrança(s)</p></div><strong>{formatMoney(data.forecast.value.next30.amount)}</strong></header>{data.forecast.value.next30.missingValue > 0 && <p className="admin-finance-warning">Valor é um piso: {formatCount(data.forecast.value.next30.missingValue)} cobrança(s) sem valor.</p>}<SubscriptionRows rows={data.forecast.value.next30.rows} empty="Nenhuma cobrança prevista nesta janela." period={period} /></article>
          {data.forecast.value.undated > 0 && <p className="admin-finance-warning admin-finance-wide"><CalendarClock size={14} /> {formatCount(data.forecast.value.undated)} assinatura(s) ativa(s) sem data de renovação ficaram fora das duas previsões.</p>}
        </div>}
      </section>
    </div>
  );
}
