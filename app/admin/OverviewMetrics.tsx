import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { loadAdminOverview, variation, CHECKOUT_LEADS_CAP } from '@/lib/admin-metrics';
import { formatCount, formatDateTime, formatMoney, formatVariation } from '@/lib/admin-format';
import { formatCivil, type ResolvedPeriod } from '@/lib/admin-period';
import { PLANS } from '@/lib/plans';
import MetricCard from '@/components/admin/MetricCard';
import SplitBar from '@/components/admin/SplitBar';
import RetryPanel from '@/components/admin/RetryPanel';

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
    <div className="flex flex-col gap-8">
      <section aria-labelledby="secao-assinaturas" className="flex flex-col gap-3">
        <h2 id="secao-assinaturas" className="section-kicker">
          Assinaturas e recorrência — retrato de agora, não do período
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            testId="card-assinaturas-ativas"
            label="Assinaturas ativas"
            value={formatCount(subscriptions.active)}
            hint="Linhas em subscriptions com status active ou trialing, com ou sem conta vinculada. Não é o mesmo que “usuário ativo”: mede pagamento, não uso."
          />
          <MetricCard
            testId="card-assinantes-com-conta"
            label="Assinantes com conta"
            value={formatCount(subscriptions.withAccount)}
            hint="Assinaturas ativas com user_id preenchido — quem pagou E já criou/vinculou a conta."
          />
          <MetricCard
            testId="card-pagou-sem-conta"
            // Acento só quando há alguém pendurado: um zero em coral grita
            // urgência que não existe, e alarme que sempre toca ninguém ouve.
            tone={subscriptions.withoutAccount > 0 ? 'accent' : 'default'}
            label="Pagou e não criou conta"
            value={formatCount(subscriptions.withoutAccount)}
            hint="Assinaturas ativas com user_id nulo. O pagamento entrou antes da conta existir e o cadastro nunca foi concluído. Cada linha aqui é dinheiro parado esperando uma ação sua."
            detail={
              subscriptions.withoutAccount > 0
                ? 'Precisa de ação: cliente pagou e está sem acesso.'
                : 'Ninguém pendurado no momento.'
            }
          />
          <MetricCard
            testId="card-cancelamentos-agendados"
            tone={subscriptions.scheduledCancellation > 0 ? 'warn' : 'default'}
            label="Cancelamentos agendados"
            value={formatCount(subscriptions.scheduledCancellation)}
            hint="Assinaturas ainda ativas com cancel_at_period_end = true: já pediram cancelamento e mantêm acesso até o fim do período pago. Não é churn consumado."
          />
          <MetricCard
            testId="card-mrr"
            label="MRR normalizado"
            value={formatMoney(recurring.mrr)}
            hint={`Mensais ativas × ${PLANS.month.priceLabel} + anuais ativas × ${PLANS.year.priceLabel} ÷ 12. Preços lidos de lib/plans.ts. É compromisso recorrente contratado — NÃO é dinheiro recebido.`}
            detail={`${subscriptions.monthly} mensais · ${subscriptions.yearly} anuais`}
          />
          <MetricCard
            testId="card-arr"
            label="ARR estimado"
            value={formatMoney(recurring.arr)}
            hint="MRR normalizado × 12. Projeção do que a base atual renderia em doze meses se nada mudasse. Não é histórico nem receita reconhecida."
          />
          <MetricCard
            testId="card-renovacoes-7"
            label="Renovações · 7 dias"
            value={formatMoney(renewals.next7.amount)}
            hint="Assinaturas ativas, SEM cancelamento agendado, cujo current_period_end cai nos próximos 7 dias. A mensal cobra um mês e a anual cobra o ano inteiro — por isso o valor aqui não é dividido por 12."
            detail={`${formatCount(renewals.next7.count)} assinatura(s) · ${renewals.next7.monthly} mensal · ${renewals.next7.yearly} anual`}
          />
          <MetricCard
            testId="card-renovacoes-30"
            label="Renovações · 30 dias"
            value={formatMoney(renewals.next30.amount)}
            hint="Mesma regra da janela de 7 dias, estendida para 30. Caixa previsto, não garantido: uma cobrança pode falhar."
            detail={`${formatCount(renewals.next30.count)} assinatura(s) · ${renewals.next30.monthly} mensal · ${renewals.next30.yearly} anual`}
          />
        </div>

        <article className="brand-card flex flex-col gap-3 p-4 sm:p-5" data-testid="card-distribuicao">
          <h3 className="section-kicker">Distribuição mensal × anual (assinaturas ativas)</h3>
          <SplitBar
            parts={[
              { label: 'Mensal', value: subscriptions.monthly, className: 'bg-[var(--ink)]' },
              { label: 'Anual', value: subscriptions.yearly, className: 'bg-[var(--accent)]' },
            ]}
          />
          {subscriptions.active === 0 && (
            <p className="text-[11px] text-[var(--ink-dim)]">Sem assinatura ativa para distribuir.</p>
          )}
        </article>
      </section>

      <section aria-labelledby="secao-contas" className="flex flex-col gap-3">
        <h2 id="secao-contas" className="section-kicker">
          Contas e onboarding
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            testId="card-contas"
            label="Contas cadastradas"
            value={formatCount(accounts.total)}
            hint="Total de usuários no Supabase Auth, lido no servidor. É a contagem exata de contas — profiles pode divergir, porque o perfil nasce em outro passo do fluxo."
            detail="Total acumulado, não o período"
          />
          <MetricCard
            testId="card-perfis-periodo"
            label="Perfis criados no período"
            value={formatCount(profiles.createdInPeriod)}
            hint="Linhas em profiles com created_at dentro do período. Conta PERFIS, não contas do Auth: quem pagou e travou antes do onboarding pode ter conta sem perfil."
            detail={janela}
            variation={formatVariation(variation(profiles.createdInPeriod, profiles.createdInPreviousPeriod))}
          />
          <MetricCard
            testId="card-onboarding-concluido"
            label="Onboarding concluído"
            value={formatCount(profiles.onboardingCompleted)}
            hint="Perfis com onboarding_completed = true, acumulado até agora."
            detail={`${formatCount(profiles.total)} perfis no total`}
          />
          <MetricCard
            testId="card-onboarding-incompleto"
            tone={profiles.onboardingIncomplete > 0 ? 'warn' : 'default'}
            label="Onboarding incompleto"
            value={formatCount(profiles.onboardingIncomplete)}
            hint="Perfis com onboarding_completed = false. Entrou e não terminou de se apresentar — o produto rende pouco para essa pessoa."
          />
          <MetricCard
            testId="card-sem-creditos"
            tone={credits.zeroBalance > 0 ? 'warn' : 'default'}
            label="Clientes com 0 créditos"
            value={formatCount(credits.zeroBalance)}
            hint="Linhas em user_credits com balance = 0 agora. É saldo, não consumo histórico: não existe ledger de crédito para dizer quanto foi gasto em quê."
          />
        </div>
      </section>

      <section aria-labelledby="secao-funil" className="flex flex-col gap-3">
        <h2 id="secao-funil" className="section-kicker">
          Funil no período — {janela}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            testId="card-leads"
            label="Leads no período"
            value={formatCount(funnel.leads)}
            hint="Linhas em leads com created_at no período. O e-mail é único: reenvio do mesmo endereço atualiza o lead, não cria outro."
            variation={formatVariation(variation(funnel.leads, funnel.leadsPrevious))}
            detail={`Período anterior: ${formatCount(funnel.leadsPrevious)}`}
          />
          <MetricCard
            testId="card-checkouts"
            label="Checkouts iniciados"
            value={formatCount(funnel.checkoutLeads)}
            hint="PESSOAS distintas (lead_id) com ao menos um checkout aberto no período. Um mesmo lead pode abrir vários checkouts; contar tentativas como pessoas infla o funil."
            detail={
              funnel.checkoutLeadsCapped
                ? `Piso: leitura limitada a ${formatCount(CHECKOUT_LEADS_CAP)} checkouts`
                : `${formatCount(funnel.checkoutAttempts)} tentativa(s) de checkout`
            }
          />
        </div>

        <p className="max-w-prose text-[11px] text-[var(--ink-dim)]">
          Não existe conversão de lead → pagamento nesta tela: a ponte só fecha quando o webhook
          resolve o checkout, e a taxa depende de janela de atribuição que ainda não foi definida.
          Sem isso, qualquer percentual aqui seria chute com cara de métrica.
        </p>
      </section>

      <footer className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-muted)]">
        <span className="font-mono">Lido em {formatDateTime(data.generatedAt)}</span>
        <span aria-hidden>·</span>
        <span>
          Sem usuários online, DAU/WAU/MAU, uso de feature, exportações ou receita recebida: o
          produto não tem instrumentação para isso, e aproximar seria inventar.
        </span>
      </footer>
    </div>
  );
}
