import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/subscription';
import { getEntitlement } from '@/lib/entitlements';
import { CREDIT_COSTS, getUserCredits } from '@/lib/credits';

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

  const [sub, credits, plan] = user
    ? await Promise.all([
        getActiveSubscription(supabase, user.id),
        getUserCredits(supabase, user.id),
        getEntitlement(supabase, user.id),
      ])
    : [null, null, 'free' as const];

  const isPro = plan === 'pro';

  return (
    <div className="p-8 max-w-2xl mx-auto w-full overflow-y-auto">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Conta</h1>
      <p className="mt-1 text-sm text-[var(--ink-dim)]">{user?.email}</p>
      <span
        className="chip filled mt-3 inline-flex text-[11px]"
        data-testid="plan-badge"
      >
        {isPro ? 'Plano Pago' : 'Plano Grátis'}
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
            {sub.cancel_at_period_end && (
              <p className="text-[var(--warn)]">Cancelamento agendado — não haverá nova cobrança.</p>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-[var(--ink-dim)]">
              Você está no <strong className="text-[var(--foreground)]">plano Grátis</strong>: editor e
              templates manuais completos, export sem marca d’água e até 5 carrosséis salvos. Os recursos
              de IA (carrosséis e imagens geradas por IA) são exclusivos dos planos pagos.
            </p>
            <Link
              href="/precos"
              className="brand-btn accent mt-4 inline-flex"
            >
              Fazer upgrade
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
              Notícia não tem custo — tem TETO, e só no plano Grátis
              (FREE_NEWS_DAILY_LIMIT, lib/news-quota.ts); quem vê esta caixa é
              assinante, para quem a notícia é ilimitada. "Thread do X" é estilo
              de carrossel (FORMATO B em lib/openai.ts), não um item à parte.
              Não há CTA de upgrade aqui: quem tem assinatura ativa leva 409
              `alreadySubscribed` no checkout (app/api/abacatepay/checkout/route.ts).
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
