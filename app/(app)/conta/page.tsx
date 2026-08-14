import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/subscription';
import { CREDIT_COSTS, getUserCredits } from '@/lib/credits';
import CancelSubscriptionButton from '@/components/billing/CancelSubscriptionButton';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Em período de teste',
};

export default async function ContaPage() {
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
    <div className="p-8 max-w-2xl mx-auto w-full overflow-y-auto">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Conta</h1>
      <p className="mt-1 text-sm text-[var(--ink-dim)]">{user?.email}</p>
      <span
        className="chip filled mt-3 inline-flex text-[11px]"
        data-testid="plan-badge"
      >
        {sub ? `Plano ${sub.plan_interval === 'year' ? 'Anual' : 'Mensal'}` : 'Sem assinatura'}
      </span>

      <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
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
              Custos vêm de CREDIT_COSTS (lib/credits.ts) interpolados, não
              digitados: só o carrossel e a imagem consomem crédito, e a copy não
              pode divergir do objeto numa próxima edição de texto.
              Notícia não tem custo nem teto: o plano gratuito, único que tinha
              limite diário, saiu do produto. "Thread do X" é estilo
              de carrossel (FORMATO B em lib/openai.ts), não um item à parte.
              Não há CTA de upgrade aqui: quem tem assinatura ativa leva 409
              `alreadySubscribed` no checkout (app/api/asaas/checkout/route.ts).
            */}
            <p className="text-xs text-[var(--ink-dim)]">
              Carrossel com IA custa {CREDIT_COSTS.carousel} créditos — o mesmo nos 3 estilos,
              incluindo Thread do X. Imagem com IA custa {CREDIT_COSTS.image}. Notícias e o editor
              manual não consomem créditos. Os créditos recarregam todo mês.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
