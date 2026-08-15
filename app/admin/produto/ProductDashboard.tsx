import { AlertTriangle, BarChart3, Box, Download, ImageIcon, Newspaper, Sparkles, Users, WalletCards } from 'lucide-react';
import { displayObservedCount, type AdminProduct, type CountPoint } from '@/lib/admin-product';
import type { ResolvedPeriod } from '@/lib/admin-period';
import { formatCount, formatDateTime } from '@/lib/admin-format';
import MetricCard from '@/components/admin/MetricCard';
import MetricRetryButton from '@/components/admin/MetricRetryButton';

const FEATURE_LABEL: Record<string, string> = { carousel: 'Carrossel', image: 'Imagem', news: 'Notícias', schedule: 'Agenda', session: 'Sessão', onboarding: 'Onboarding', checkout: 'Checkout' };
const MODE_LABEL: Record<string, string> = { ai: 'IA', manual: 'Manual', json: 'JSON', unknown: 'Não identificado' };

function Failure({ label }: { label: string }) {
  return <div className="admin-product-failure"><AlertTriangle size={16} /><div><strong>{label} não carregou</strong><p>Os outros blocos continuam válidos; nenhum valor foi convertido em zero.</p></div><MetricRetryButton /></div>;
}

function List({ rows, empty }: { rows: { label: string; value: string; detail?: string }[]; empty: string }) {
  if (!rows.length) return <p className="admin-product-empty">{empty}</p>;
  return <div className="admin-product-list">{rows.map((row) => <div key={row.label}><span><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}</span><b>{row.value}</b></div>)}</div>;
}

function Series({ points, value }: { points: CountPoint[]; value: (point: CountPoint) => number }) {
  if (!points.length) return <p className="admin-product-empty">Nenhum evento no período.</p>;
  const max = Math.max(...points.map(value), 1);
  return <div className="admin-product-series" aria-label="Série diária">{points.map((point) => <div key={point.bucket}><time>{new Date(point.bucket).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}</time><span><i style={{ width: `${Math.max(3, value(point) / max * 100)}%` }} /></span><b>{formatCount(value(point))}</b></div>)}</div>;
}

export default function ProductDashboard({ data, period }: { data: AdminProduct; period: ResolvedPeriod }) {
  // A coleta começa no primeiro evento, não na criação da tabela. Antes disso,
  // 0 seria uma afirmação falsa; depois disso, 0 é um resultado observável.
  const collectedSince = data.activity.ok ? data.activity.value.collectedSince : null;
  const observedCount = (value: number) => {
    const displayed = displayObservedCount(value, collectedSince);
    return displayed === null ? '—' : formatCount(displayed);
  };
  const failureRate = data.creditsAi.ok
    ? data.creditsAi.value.aiSucceeded + data.creditsAi.value.aiFailed === 0 ? 0 : data.creditsAi.value.aiFailed / (data.creditsAi.value.aiSucceeded + data.creditsAi.value.aiFailed) * 100
    : 0;
  return <div className="admin-product-sections">
    <p className="admin-collection-note">{!data.activity.ok
      ? 'Não foi possível verificar o estado da coleta de eventos agora.'
      : collectedSince
        ? `Dados de evento coletados a partir de ${formatDateTime(collectedSince)}.`
        : 'A tabela de eventos está disponível, mas nenhum evento foi coletado ainda. A coleta começa quando o primeiro evento chegar.'}</p>

    <section className="admin-metric-section" aria-labelledby="product-activity">
      <div className="admin-group-heading"><div><h2 id="product-activity">Atividade</h2><p>Usuários distintos, nunca sessões</p></div><span className="admin-scope-badge">Janela até {period.toDate}</span></div>
      {!data.activity.ok ? <Failure label="Atividade" /> : <>
        <div className="admin-metrics-grid">
          <MetricCard icon={Users} label="DAU" value={observedCount(data.activity.value.dau)} hint="Usuários distintos com evento nas últimas 24 horas do recorte." featured />
          <MetricCard icon={Users} label="WAU" value={observedCount(data.activity.value.wau)} hint="Usuários distintos com evento nos últimos 7 dias até o fim do recorte." />
          <MetricCard icon={Users} label="MAU" value={observedCount(data.activity.value.mau)} hint="Usuários distintos com evento nos últimos 30 dias até o fim do recorte." />
          <MetricCard icon={BarChart3} label="Stickiness DAU ÷ MAU" value={data.activity.value.mau ? `${(data.activity.value.dau / data.activity.value.mau * 100).toFixed(1)}%` : '—'} hint="Só existe quando há MAU. Sessões repetidas não aumentam o numerador." />
        </div>
        <div className="admin-product-grid"><article className="admin-product-panel"><h3>Usuários ativos por dia</h3><Series points={data.activity.value.series.map((x) => ({ bucket: x.bucket, count: x.users }))} value={(x) => x.count} /></article><article className="admin-product-panel"><h3>Conteúdo existente hoje</h3><List rows={[{ label: 'Carrosséis ainda existentes', value: formatCount(data.activity.value.existingCarousels) }, { label: 'Cards de notícia ainda existentes', value: formatCount(data.activity.value.existingNews) }]} empty="Nenhum conteúdo existente." /><p className="admin-data-note">Foto atual, não total histórico: itens apagados não entram.</p></article></div>
      </>}
    </section>

    <section className="admin-metric-section" aria-labelledby="product-creation">
      <div className="admin-group-heading"><div><h2 id="product-creation">Criação e saída</h2><p>Eventos observados em {period.label.toLowerCase()}</p></div></div>
      {!data.creation.ok ? <Failure label="Criação e exportação" /> : <>
        <div className="admin-metrics-grid">
          <MetricCard icon={Download} label="Exportações" value={observedCount(data.creation.value.exportsSingle + data.creation.value.exportsAll)} detail={collectedSince ? `${formatCount(data.creation.value.exportsSingle)} avulsa(s) · ${formatCount(data.creation.value.exportsAll)} ZIP(s)` : 'Ainda não há coleta para separar os tipos'} hint="Exportação concluída no navegador." featured />
          <MetricCard icon={ImageIcon} label="Imagens geradas" value={observedCount(data.creation.value.images)} hint="Gerações de imagem concluídas." />
          <MetricCard icon={Newspaper} label="Lotes de notícias" value={observedCount(data.creation.value.newsBatches)} hint="Lotes criados; não soma cada card do lote." />
          <MetricCard icon={Box} label="Agendamentos" value={observedCount(data.creation.value.schedules)} hint="Novos agendamentos criados no período." />
        </div>
        <div className="admin-product-grid">
          <article className="admin-product-panel"><h3>Conteúdo criado por dia</h3><Series points={data.creation.value.contentSeries} value={(x) => x.count} /></article>
          <article className="admin-product-panel"><h3>Carrossel por origem</h3><List rows={data.creation.value.carouselModes.map((x) => ({ label: MODE_LABEL[x.mode] ?? x.mode, value: formatCount(x.count) }))} empty="Nenhum carrossel persistido no período." /></article>
          <article className="admin-product-panel"><h3>Estilos e templates usados</h3><List rows={data.creation.value.styles.map((x) => ({ label: x.style, value: formatCount(x.count) }))} empty="Nenhum estilo observado." /></article>
          <article className="admin-product-panel"><h3>Estrutura dos carrosséis</h3><strong className="admin-product-big">{data.creation.value.averageSlides === null ? '—' : data.creation.value.averageSlides.toLocaleString('pt-BR')}</strong><p className="admin-data-note">Média de slides dos carrosséis criados no período.</p></article>
        </div>
      </>}
    </section>

    <section className="admin-metric-section" aria-labelledby="product-features">
      <div className="admin-group-heading"><div><h2 id="product-features">Adoção</h2><p>Volume de eventos e alcance em usuários únicos</p></div></div>
      {!data.features.ok ? <Failure label="Adoção de features" /> : <div className="admin-product-grid">
        <article className="admin-product-panel"><h3>Features mais usadas</h3><List rows={data.features.value.features.map((x) => ({ label: FEATURE_LABEL[x.feature] ?? x.feature, value: formatCount(x.events), detail: `${formatCount(x.users)} usuário(s) único(s)` }))} empty="Nenhum uso observado." /></article>
        <article className="admin-product-panel"><h3>Funis incompletos</h3><List rows={[{ label: 'Criou e nunca exportou', value: formatCount(data.features.value.createdNeverExported) }, { label: 'Pagou e nunca criou', value: formatCount(data.features.value.paidNeverCreated) }]} empty="Nenhuma lacuna observada." /><p className="admin-data-note">“Nunca” significa desde o começo da coleta de eventos.</p></article>
        <article className="admin-product-panel admin-product-disabled"><h3>Reels</h3><p>Feature desativada. O histórico futuro será preservado separado; reels não entram nas features vivas.</p></article>
      </div>}
    </section>

    <section className="admin-metric-section" aria-labelledby="product-ai">
      <div className="admin-group-heading"><div><h2 id="product-ai">Créditos e IA</h2><p>Ledger e insumos brutos retornados pelo provedor</p></div><span className="admin-scope-badge">Não é custo monetário</span></div>
      {!data.creditsAi.ok ? <Failure label="Créditos e IA" /> : <>
        <div className="admin-metrics-grid">
          <MetricCard icon={Sparkles} label="Gerações de IA" value={formatCount(data.creditsAi.value.aiSucceeded)} detail={`${formatCount(data.creditsAi.value.aiFailed)} falha(s)`} hint="Tentativas instrumentadas nas rotas de carrossel e imagem." featured />
          <MetricCard icon={AlertTriangle} label="Taxa de falha" value={`${failureRate.toFixed(1)}%`} hint="Falhas divididas por todas as tentativas instrumentadas." tone={failureRate > 0 ? 'warn' : 'default'} />
          <MetricCard icon={WalletCards} label="Usuários sem créditos" value={formatCount(data.creditsAi.value.zeroCredits)} hint="Foto atual do saldo; não é limitado pelo período." tone={data.creditsAi.value.zeroCredits ? 'warn' : 'default'} />
          <MetricCard icon={WalletCards} label="Créditos consumidos" value={formatCount(data.creditsAi.value.creditsByFeature.reduce((sum, x) => sum + x.credits, 0))} hint="Soma do ledger de consumo no período." />
        </div>
        <div className="admin-product-grid"><article className="admin-product-panel"><h3>Créditos por feature</h3><List rows={data.creditsAi.value.creditsByFeature.map((x) => ({ label: FEATURE_LABEL[x.feature] ?? x.feature, value: formatCount(x.credits) }))} empty="Nenhum consumo registrado." /></article><article className="admin-product-panel"><h3>Insumos brutos por modelo</h3><List rows={data.creditsAi.value.models.map((x) => ({ label: x.model, value: `${formatCount(x.generations)} geração(ões)`, detail: x.inputTokens === null && x.outputTokens === null ? 'Tokens não retornados pelo provedor' : `${formatCount(x.inputTokens ?? 0)} entrada · ${formatCount(x.outputTokens ?? 0)} saída` }))} empty="Nenhum modelo observado." /><p className="admin-data-note">Tokens ajudam a estimar custo depois; não são apresentados como reais ou dólares.</p></article></div>
      </>}
    </section>
  </div>;
}
