import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveSubscription } from '@/lib/subscription';
import { getUserCredits } from '@/lib/credits';
import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';

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

  const sub = user ? await getActiveSubscription(supabase, user.id) : null;
  const credits = user ? await getUserCredits(supabase, user.id) : null;

  return (
    <div className="p-8 max-w-2xl mx-auto w-full overflow-y-auto">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Conta</h1>
      <p className="mt-1 text-sm text-[var(--ink-dim)]">{user?.email}</p>

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
            <div className="pt-4">
              <ManageSubscriptionButton />
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-[var(--ink-dim)]">Você ainda não tem uma assinatura ativa.</p>
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
            <p className="text-xs text-[var(--ink-dim)]">
              Carrossel custa 5 · Notícias e Threads custam 3 · Imagem com IA custa 5. Refinar slide é grátis.
              Os créditos recarregam todo mês; para mais, faça upgrade do plano.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
