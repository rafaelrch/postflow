import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { loadAdminOverview, variation, CHECKOUT_LEADS_CAP } from '@/lib/admin-metrics';
import { formatCount, formatDateTime, formatMoney, formatVariation } from '@/lib/admin-format';
import { formatCivil, type ResolvedPeriod } from '@/lib/admin-period';
import { PLANS } from '@/lib/plans';
import MetricCard from '@/components/admin/MetricCard';
import MetricRetryButton from '@/components/admin/MetricRetryButton';
import SplitBar from '@/components/admin/SplitBar';
import RetryPanel from '@/components/admin/RetryPanel';
import {
  BadgeDollarSign,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Gauge,
  LogIn,
  ReceiptText,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-react';

/**
 * Os números da Visão geral.
 *
 * Arquivo separado da página para manter a leitura do banco longe da guarda de
 * acesso: page.tsx decide QUEM entra, este decide O QUE se mostra.
 *
 * 🔴 NÃO envolva isto em <Suspense> nem crie um `loading.tsx` para a rota. No
 * Next 16 o boundary não resolve quando o Server Component faz fetch e a tela
 * fica no esqueleto para sempre — docs/bug-loading-fetch-next16.md. O esqueleto
 * vem da transição do cliente, em components/admin/OverviewShell.tsx.
 *
 * ⚠️ Este componente só é renderizado depois de requireAdminPage() na página.
 * O client service_role nasce aqui dentro e não sai daqui: nada deste módulo
 * cruza para o browser.
 */

function periodDescription(period: ResolvedPeriod): string {
  return `${formatCivil(period.fromDate)} a ${formatCivil(period.toDate)}, fuso de São Paulo`;
}

export default async function OverviewMetrics({ period }: { period: ResolvedPeriod }) {
  let data;
  try {
    data = await loadAdminOverview(createAdminSupabaseClient(), period);
  } catch (error) {
    console.error('[admin/visao-geral]', error);
    return <RetryPanel />;
  }

  const { accounts, profiles, subscriptions, recurring, renewals, funnel, credits } = data;
  const janela = periodDescription(period);
  const renewalDetail = (window: typeof renewals.next7) => {
    if (!window.ok) return undefined;
    const base = `${formatCount(window.value.count)} assinatura(s) · ${window.value.monthly} mensal · ${window.value.yearly} anual`;
    return window.value.undated > 0
      ? `${base} · ${formatCount(window.value.undated)} sem data de renovação — não entram nesta conta`
      : base;
  };

  return (
    <div className="admin-metric-sections">
      <section aria-labelledby="secao-receita" className="admin-metric-section">
        <div className="admin-group-heading">
          <div>
            <h2 id="secao-receita">Receita</h2>
            <p>Compromisso recorrente e caixa previsto da base atual</p>
          </div>
          <span className="admin-scope-badge">Foto de agora · não muda com o filtro</span>
        </div>

        <div className="admin-metrics-grid" data-testid="admin-primeira-fileira">
          <MetricCard
            testId="card-mrr"
            icon={CircleDollarSign}
            featured
            label="MRR normalizado"
            failed={!recurring.ok}
            value={recurring.ok ? formatMoney(recurring.value.mrr) : undefined}
            hint={`Mensais ativas × ${PLANS.month.priceLabel} + anuais ativas × ${PLANS.year.priceLabel} ÷ 12. Preços lidos de lib/plans.ts. É compromisso recorrente contratado — NÃO é dinheiro recebido.`}
            detail={recurring.ok ? `${recurring.value.monthly} mensais · ${recurring.value.yearly} anuais` : undefined}
          />
          <MetricCard
            testId="card-arr"
            icon={BadgeDollarSign}
            featured
            label="ARR estimado"
            failed={!recurring.ok}
            value={recurring.ok ? formatMoney(recurring.value.arr) : undefined}
            hint="MRR normalizado × 12. Projeção do que a base atual renderia em doze meses se nada mudasse. Não é histórico nem receita reconhecida."
          />
          <MetricCard
            testId="card-renovacoes-7"
            icon={CalendarClock}
            featured
            label="Renovações · 7 dias"
            failed={!renewals.next7.ok}
            value={renewals.next7.ok ? formatMoney(renewals.next7.value.amount) : undefined}
            hint="Assinaturas ativas, SEM cancelamento agendado, cujo current_period_end cai nos próximos 7 dias. A mensal cobra um mês e a anual cobra o ano inteiro — por isso o valor aqui não é dividido por 12."
            detail={renewalDetail(renewals.next7)}
          />
          <MetricCard
            testId="card-renovacoes-30"
            icon={ReceiptText}
            featured
            label="Renovações · 30 dias"
            failed={!renewals.next30.ok}
            value={renewals.next30.ok ? formatMoney(renewals.next30.value.amount) : undefined}
            hint="Mesma regra da janela de 7 dias, estendida para 30. Caixa previsto, não garantido: uma cobrança pode falhar."
            detail={renewalDetail(renewals.next30)}
          />
        </div>
      </section>

      <section aria-labelledby="secao-assinaturas" className="admin-metric-section">
        <div className="admin-group-heading">
          <div>
            <h2 id="secao-assinaturas">Assinaturas</h2>
            <p>Estado atual da base pagante</p>
          </div>
          <span className="admin-scope-badge">Foto de agora</span>
        </div>

        <div className="admin-metrics-grid">
          <MetricCard
            testId="card-assinaturas-ativas"
            icon={WalletCards}
            label="Assinaturas ativas"
            failed={!subscriptions.active.ok}
            value={subscriptions.active.ok ? formatCount(subscriptions.active.value) : undefined}
            hint="Linhas em subscriptions com status active ou trialing, com ou sem conta vinculada. Não é o mesmo que “usuário ativo”: mede pagamento, não uso."
          />
          <MetricCard
            testId="card-assinantes-com-conta"
            icon={UserCheck}
            label="Assinantes com conta"
            failed={!subscriptions.withAccount.ok}
            value={subscriptions.withAccount.ok ? formatCount(subscriptions.withAccount.value) : undefined}
            hint="Assinaturas ativas com user_id preenchido — quem pagou E já criou/vinculou a conta."
          />
          <MetricCard
            testId="card-pagou-sem-conta"
            icon={TriangleAlert}
            tone={subscriptions.withoutAccount.ok && subscriptions.withoutAccount.value > 0 ? 'accent' : 'default'}
            label="Pagou e não criou conta"
            failed={!subscriptions.withoutAccount.ok}
            value={subscriptions.withoutAccount.ok ? formatCount(subscriptions.withoutAccount.value) : undefined}
            hint="Assinaturas ativas com user_id nulo. O pagamento entrou antes da conta existir e o cadastro nunca foi concluído. Cada linha aqui é dinheiro parado esperando uma ação sua."
            detail={subscriptions.withoutAccount.ok ? (subscriptions.withoutAccount.value > 0 ? 'Precisa de ação: cliente pagou e está sem acesso.' : 'Ninguém pendurado no momento.') : undefined}
          />
          <MetricCard
            testId="card-cancelamentos-agendados"
            icon={CalendarClock}
            tone={subscriptions.scheduledCancellation.ok && subscriptions.scheduledCancellation.value > 0 ? 'warn' : 'default'}
            label="Cancelamentos agendados"
            failed={!subscriptions.scheduledCancellation.ok}
            value={subscriptions.scheduledCancellation.ok ? formatCount(subscriptions.scheduledCancellation.value) : undefined}
            hint="Assinaturas ainda ativas com cancel_at_period_end = true: já pediram cancelamento e mantêm acesso até o fim do período pago. Não é churn consumado."
          />
        </div>

        <article className="admin-distribution-card" data-testid="card-distribuicao">
          <h3>Distribuição mensal × anual</h3>
          {subscriptions.monthly.ok && subscriptions.yearly.ok ? (
            <>
              <SplitBar
                parts={[
                  { label: 'Mensal', value: subscriptions.monthly.value, className: 'admin-split-monthly' },
                  { label: 'Anual', value: subscriptions.yearly.value, className: 'admin-split-annual' },
                ]}
              />
              {subscriptions.monthly.value + subscriptions.yearly.value === 0 ? <p>Sem assinatura ativa para distribuir.</p> : null}
            </>
          ) : (
            <div className="admin-inline-failure"><span>Não deu para ler a distribuição.</span><MetricRetryButton /></div>
          )}
        </article>
      </section>

      <section aria-labelledby="secao-aquisicao" className="admin-metric-section">
        <div className="admin-group-heading">
          <div>
            <h2 id="secao-aquisicao">Aquisição</h2>
            <p>Entrada e ativação de novos clientes</p>
          </div>
          <span className="admin-scope-badge">Do período quando indicado</span>
        </div>

        <div className="admin-metrics-grid">
          <MetricCard
            testId="card-leads"
            icon={UserPlus}
            label="Leads no período"
            failed={!funnel.leads.ok}
            value={funnel.leads.ok ? formatCount(funnel.leads.value) : undefined}
            hint="Linhas em leads com created_at no período. O e-mail é único: reenvio do mesmo endereço atualiza o lead, não cria outro."
            variation={funnel.leads.ok && funnel.leadsPrevious.ok ? formatVariation(variation(funnel.leads.value, funnel.leadsPrevious.value)) : undefined}
            detail={funnel.leadsPrevious.ok ? `Anterior: ${formatCount(funnel.leadsPrevious.value)}` : 'Comparação anterior indisponível'}
          />
          <MetricCard
            testId="card-checkouts"
            icon={CreditCard}
            label="Checkouts iniciados"
            failed={!funnel.checkoutLeads.ok}
            value={funnel.checkoutLeads.ok ? formatCount(funnel.checkoutLeads.value.count) : undefined}
            hint="PESSOAS distintas (lead_id) com ao menos um checkout aberto no período. Um mesmo lead pode abrir vários checkouts; contar tentativas como pessoas infla o funil."
            detail={funnel.checkoutLeads.ok ? (funnel.checkoutLeads.value.capped ? `Piso: leitura limitada a ${formatCount(CHECKOUT_LEADS_CAP)} checkouts` : funnel.checkoutAttempts.ok ? `${formatCount(funnel.checkoutAttempts.value)} tentativa(s) de checkout` : 'Tentativas indisponíveis') : undefined}
          />
          <MetricCard
            testId="card-contas"
            icon={Users}
            label="Contas cadastradas"
            failed={!accounts.total.ok}
            value={accounts.total.ok ? formatCount(accounts.total.value) : undefined}
            hint="Total de usuários no Supabase Auth, lido no servidor. É a contagem exata de contas — profiles pode divergir, porque o perfil nasce em outro passo do fluxo."
            detail="Total acumulado, não o período"
          />
          <MetricCard
            testId="card-perfis-periodo"
            icon={UserPlus}
            label="Perfis criados no período"
            failed={!profiles.createdInPeriod.ok}
            value={profiles.createdInPeriod.ok ? formatCount(profiles.createdInPeriod.value) : undefined}
            hint="Linhas em profiles com created_at dentro do período. Conta PERFIS, não contas do Auth: quem pagou e travou antes do onboarding pode ter conta sem perfil."
            detail={janela}
            variation={profiles.createdInPeriod.ok && profiles.createdInPreviousPeriod.ok ? formatVariation(variation(profiles.createdInPeriod.value, profiles.createdInPreviousPeriod.value)) : undefined}
          />
          <MetricCard
            testId="card-onboarding-concluido"
            icon={UserCheck}
            label="Onboarding concluído"
            failed={!profiles.onboardingCompleted.ok}
            value={profiles.onboardingCompleted.ok ? formatCount(profiles.onboardingCompleted.value) : undefined}
            hint="Perfis com onboarding_completed = true, acumulado até agora."
            detail={profiles.total.ok ? `${formatCount(profiles.total.value)} perfis no total` : 'Total de perfis indisponível'}
          />
          <MetricCard
            testId="card-onboarding-incompleto"
            icon={LogIn}
            tone={profiles.onboardingIncomplete.ok && profiles.onboardingIncomplete.value > 0 ? 'warn' : 'default'}
            label="Onboarding incompleto"
            failed={!profiles.onboardingIncomplete.ok}
            value={profiles.onboardingIncomplete.ok ? formatCount(profiles.onboardingIncomplete.value) : undefined}
            hint="Perfis com onboarding_completed = false. Entrou e não terminou de se apresentar — o produto rende pouco para essa pessoa."
          />
        </div>

        <p className="admin-data-note">
          Janela atual: {janela}.{' '}
          Não existe conversão de lead → pagamento nesta tela: a ponte só fecha quando o webhook
          resolve o checkout, e a taxa depende de janela de atribuição que ainda não foi definida.
          Sem isso, qualquer percentual aqui seria chute com cara de métrica.
        </p>
      </section>

      <section aria-labelledby="secao-uso" className="admin-metric-section">
        <div className="admin-group-heading">
          <div>
            <h2 id="secao-uso">Uso e limites</h2>
            <p>Sinais operacionais disponíveis hoje</p>
          </div>
          <span className="admin-scope-badge">Foto de agora</span>
        </div>
        <div className="admin-metrics-grid">
          <MetricCard
            testId="card-sem-creditos"
            icon={Gauge}
            tone={credits.zeroBalance.ok && credits.zeroBalance.value > 0 ? 'warn' : 'default'}
            label="Clientes com 0 créditos"
            failed={!credits.zeroBalance.ok}
            value={credits.zeroBalance.ok ? formatCount(credits.zeroBalance.value) : undefined}
            hint="Linhas em user_credits com balance = 0 agora. É saldo, não consumo histórico: não existe ledger de crédito para dizer quanto foi gasto em quê."
          />
        </div>
      </section>

      <footer className="admin-data-footer">
        <span className="admin-tabular">Lido em {formatDateTime(data.generatedAt)}</span>
        <span>
          Sem usuários online, DAU/WAU/MAU, uso de feature, exportações ou receita recebida: o
          produto não tem instrumentação para isso, e aproximar seria inventar.
        </span>
      </footer>
    </div>
  );
}
