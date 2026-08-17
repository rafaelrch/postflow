import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/subscription';
import { CREDIT_COSTS, getUserCredits } from '@/lib/credits';
import CancelSubscriptionButton from '@/components/billing/CancelSubscriptionButton';

/**
 * Aba "Assinatura" das Configurações — a antiga /conta, movida para cá.
 *
 * MIGRAÇÃO, não reescrita: o conteúdo é o mesmo (assinatura, créditos, botão de
 * cancelar), incluindo a formatação de data. /conta virou um redirect para esta
 * URL — link antigo em e-mail ou aba aberta de cliente continua funcionando.
 *
 * timeZone fixo em São Paulo, e não é detalhe: o fim do período pago é gravado
 * como o fim do dia em Brasília (ver endOfDayBrasilia em lib/asaas-webhook.ts),
 * que em UTC já é o dia SEGUINTE. Sem fixar o fuso, esta página — renderizada
 * no servidor, em UTC — mostraria um dia a mais que o popup de confirmação,
 * renderizado no navegador do usuário.
 */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Em período de teste',
};

export default async function ConfiguracoesAssinaturaPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [sub, credits] = user
    ? await Promise.all([
        getActiveSubscription(supabase, user.id),
        getUserCredits(supabase, user.id),
      ])
    : [null, null];

  return (
    <div>
      <span
        className="chip filled mt-6 inline-flex text-[11px]"
        data-testid="plan-badge"
      >
        {sub ? `Plano ${sub.plan_interval === 'year' ? 'Anual' : 'Mensal'}` : 'Sem assinatura'}
      </span>

      <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Assinatura</h2>

        {sub ? (
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--ink-dim)]">Status</span>
              <span className="font-medium">{STATUS_LABEL[sub.status] ?? sub.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-dim)]">Plano</span>
              <span className="font-medium">{sub.plan_interval === 'year' ? 'Anual' : 'Mensal'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-dim)]">
                {sub.cancel_at_period_end ? 'Acesso até' : 'Renova em'}
              </span>
              <span className="font-medium">{fmtDate(sub.current_period_end)}</span>
            </div>
            {/*
              O botão de cancelar (com o popup de confirmação) é client
              component porque esta página é server. Quando já existe
              cancelamento agendado, ele mostra o ESTADO no lugar do botão —
              um botão que não faz nada é pior que nenhum botão.
            */}
            <CancelSubscriptionButton
              currentPeriodEnd={sub.current_period_end}
              cancelAtPeriodEnd={sub.cancel_at_period_end}
            />
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-[var(--ink-dim)]">
              Não encontramos uma assinatura ativa nesta conta. O acesso ao Creatools
              começa pela assinatura.
            </p>
            <Link
              href="/precos"
              className="brand-btn accent mt-4 inline-flex"
            >
              Ver planos
            </Link>
          </div>
        )}
      </section>

      {sub && (
        <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Créditos</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--ink-dim)]">Disponíveis</span>
              <span className="font-medium">
                {credits?.balance ?? 0}
                <span className="text-[var(--ink-dim)]"> / {credits?.monthly_allowance ?? 0}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-dim)]">Próxima recarga</span>
              <span className="font-medium">{fmtDate(credits?.period_end ?? null)}</span>
            </div>
            {/*
              O custo vem de CREDIT_COSTS (lib/credits.ts) interpolado, não
              digitado, para a copy não divergir do objeto numa próxima edição.
              Hoje só a IMAGEM consome crédito: carrossel é ilimitado para
              assinante (CREDIT_COSTS.carousel = 0) e por isso não tem número
              para interpolar — "custa 0 créditos" seria pior que dizer que não
              consome. Se ele voltar a custar, volte a interpolar aqui; o teste
              credits-copy-coherence cobra as duas pontas.
              Notícia não tem custo nem teto: o plano gratuito, único que tinha
              limite diário, saiu do produto.
              Não há CTA de upgrade aqui: quem tem assinatura ativa leva 409
              `alreadySubscribed` no checkout (app/api/asaas/checkout/route.ts).
            */}
            <p className="text-xs text-[var(--ink-dim)]">
              Carrossel com IA não consome créditos: você gera quantos quiser enquanto a
              assinatura estiver ativa. Crédito é da imagem com IA, que custa {CREDIT_COSTS.image} por
              imagem gerada. Notícias e o editor manual também não consomem. Os créditos
              recarregam todo mês.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
