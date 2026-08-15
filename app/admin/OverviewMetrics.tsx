import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { loadAdminOverview, variation, CHECKOUT_LEADS_CAP } from '@/lib/admin-metrics';
import { formatCount, formatDateTime, formatMoney, formatVariation } from '@/lib/admin-format';
import { formatCivil, type ResolvedPeriod } from '@/lib/admin-period';
import { PLANS } from '@/lib/plans';
import MetricCard from '@/components/admin/MetricCard';
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
            value={formatMoney(recurring.mrr)}
            hint={`Mensais ativas × ${PLANS.month.priceLabel} + anuais ativas × ${PLANS.year.priceLabel} ÷ 12. Preços lidos de lib/plans.ts. É compromisso recorrente contratado — NÃO é dinheiro recebido.`}
            detail={`${subscriptions.monthly} mensais · ${subscriptions.yearly} anuais`}
          />
          <MetricCard
            testId="card-arr"
            icon={BadgeDollarSign}
            featured
            label="ARR estimado"
            value={formatMoney(recurring.arr)}
            hint="MRR normalizado × 12. Projeção do que a base atual renderia em doze meses se nada mudasse. Não é histórico nem receita reconhecida."
          />
          <MetricCard
            testId="card-renovacoes-7"
            icon={CalendarClock}
            featured
            label="Renovações · 7 dias"
            value={formatMoney(renewals.next7.amount)}
            hint="Assinaturas ativas, SEM cancelamento agendado, cujo current_period_end cai nos próximos 7 dias. A mensal cobra um mês e a anual cobra o ano inteiro — por isso o valor aqui não é dividido por 12."
            detail={`${formatCount(renewals.next7.count)} assinatura(s) · ${renewals.next7.monthly} mensal · ${renewals.next7.yearly} anual`}
          />
          <MetricCard
            testId="card-renovacoes-30"
            icon={ReceiptText}
            featured
            label="Renovações · 30 dias"
            value={formatMoney(renewals.next30.amount)}
            hint="Mesma regra da janela de 7 dias, estendida para 30. Caixa previsto, não garantido: uma cobrança pode falhar."
            detail={`${formatCount(renewals.next30.count)} assinatura(s) · ${renewals.next30.monthly} mensal · ${renewals.next30.yearly} anual`}
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
            value={formatCount(subscriptions.active)}
            hint="Linhas em subscriptions com status active ou trialing, com ou sem conta vinculada. Não é o mesmo que “usuário ativo”: mede pagamento, não uso."
          />
          <MetricCard
            testId="card-assinantes-com-conta"
            icon={UserCheck}
            label="Assinantes com conta"
            value={formatCount(subscriptions.withAccount)}
            hint="Assinaturas ativas com user_id preenchido — quem pagou E já criou/vinculou a conta."
          />
          <MetricCard
            testId="card-pagou-sem-conta"
            icon={TriangleAlert}
            tone={subscriptions.withoutAccount > 0 ? 'accent' : 'default'}
            label="Pagou e não criou conta"
            value={formatCount(subscriptions.withoutAccount)}
            hint="Assinaturas ativas com user_id nulo. O pagamento entrou antes da conta existir e o cadastro nunca foi concluído. Cada linha aqui é dinheiro parado esperando uma ação sua."
            detail={subscriptions.withoutAccount > 0 ? 'Precisa de ação: cliente pagou e está sem acesso.' : 'Ninguém pendurado no momento.'}
          />
          <MetricCard
            testId="card-cancelamentos-agendados"
            icon={CalendarClock}
            tone={subscriptions.scheduledCancellation > 0 ? 'warn' : 'default'}
            label="Cancelamentos agendados"
            value={formatCount(subscriptions.scheduledCancellation)}
            hint="Assinaturas ainda ativas com cancel_at_period_end = true: já pediram cancelamento e mantêm acesso até o fim do período pago. Não é churn consumado."
          />
        </div>

        <article className="admin-distribution-card" data-testid="card-distribuicao">
          <h3>Distribuição mensal × anual</h3>
          <SplitBar
            parts={[
              { label: 'Mensal', value: subscriptions.monthly, className: 'admin-split-monthly' },
              { label: 'Anual', value: subscriptions.yearly, className: 'admin-split-annual' },
            ]}
          />
          {subscriptions.active === 0 && <p>Sem assinatura ativa para distribuir.</p>}
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
            value={formatCount(funnel.leads)}
            hint="Linhas em leads com created_at no período. O e-mail é único: reenvio do mesmo endereço atualiza o lead, não cria outro."
            variation={formatVariation(variation(funnel.leads, funnel.leadsPrevious))}
            detail={`Anterior: ${formatCount(funnel.leadsPrevious)}`}
          />
          <MetricCard
            testId="card-checkouts"
            icon={CreditCard}
            label="Checkouts iniciados"
            value={formatCount(funnel.checkoutLeads)}
            hint="PESSOAS distintas (lead_id) com ao menos um checkout aberto no período. Um mesmo lead pode abrir vários checkouts; contar tentativas como pessoas infla o funil."
            detail={funnel.checkoutLeadsCapped ? `Piso: leitura limitada a ${formatCount(CHECKOUT_LEADS_CAP)} checkouts` : `${formatCount(funnel.checkoutAttempts)} tentativa(s) de checkout`}
          />
          <MetricCard
            testId="card-contas"
            icon={Users}
            label="Contas cadastradas"
            value={formatCount(accounts.total)}
            hint="Total de usuários no Supabase Auth, lido no servidor. É a contagem exata de contas — profiles pode divergir, porque o perfil nasce em outro passo do fluxo."
            detail="Total acumulado, não o período"
          />
          <MetricCard
            testId="card-perfis-periodo"
            icon={UserPlus}
            label="Perfis criados no período"
            value={formatCount(profiles.createdInPeriod)}
            hint="Linhas em profiles com created_at dentro do período. Conta PERFIS, não contas do Auth: quem pagou e travou antes do onboarding pode ter conta sem perfil."
            detail={janela}
            variation={formatVariation(variation(profiles.createdInPeriod, profiles.createdInPreviousPeriod))}
          />
          <MetricCard
            testId="card-onboarding-concluido"
            icon={UserCheck}
            label="Onboarding concluído"
            value={formatCount(profiles.onboardingCompleted)}
            hint="Perfis com onboarding_completed = true, acumulado até agora."
            detail={`${formatCount(profiles.total)} perfis no total`}
          />
          <MetricCard
            testId="card-onboarding-incompleto"
            icon={LogIn}
            tone={profiles.onboardingIncomplete > 0 ? 'warn' : 'default'}
            label="Onboarding incompleto"
            value={formatCount(profiles.onboardingIncomplete)}
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
            tone={credits.zeroBalance > 0 ? 'warn' : 'default'}
            label="Clientes com 0 créditos"
            value={formatCount(credits.zeroBalance)}
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
