import Link from 'next/link';
import { Check, ArrowLeft } from 'lucide-react';
import CheckoutButton from '@/components/billing/CheckoutButton';
import { PLANS } from '@/lib/plans';

export const metadata = {
  title: 'Planos e preços — Creatools',
  description: 'Assine o Creatools: plano mensal ou anual.',
};

// Preço vem de lib/plans.ts, a MESMA fonte que a rota de checkout usa para
// montar items[].value. Escrever o número aqui de novo é como se anuncia um
// valor e se cobra outro.
const MONTHLY_PRICE = PLANS.month.priceLabel;
const YEARLY_PRICE = PLANS.year.priceLabel;
const YEARLY_MONTHLY_EQUIV = 'R$ 41,58/mês';

// Plano gratuito: editor e templates manuais completos, sem IA.
const FREE_FEATURES = [
  'Editor visual completo (4:5, 1:1, 9:16)',
  'Todos os templates manuais: carrossel, News, Reels e Editorial',
  'Export PNG, ZIP e MP4 — sem marca d’água',
  'Até 5 carrosséis salvos',
  'Sem recursos de IA',
];

// Planos pagos: o que é EXCLUSIVO deles é a IA e a agenda; o resto o Free já dá.
const FEATURES = [
  'Carrosséis completos gerados por IA (texto + layout)',
  'Imagens com IA (OpenAI gpt-image-2) — 5 créditos cada',
  'Créditos de IA todo mês (200 no mensal, 300 no anual)',
  'Calendário de conteúdo',
  'Projetos ilimitados',
  'Tudo do plano Grátis incluído',
];

export default function PrecosPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)] px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] mb-10">
          <ArrowLeft size={16} /> Voltar
        </Link>

        <header className="text-center mb-14">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Escolha seu plano</h1>
          <p className="mt-4 text-[var(--ink-dim)] text-lg">
            Tudo do PostFlow, sem limites. Cancele quando quiser.
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Grátis */}
          <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--paper-2)] p-8 shadow-[var(--sh-2)]">
            <div className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-dim)]">Grátis</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold">R$ 0</span>
              <span className="text-[var(--ink-dim)]">/sempre</span>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-dim)]">Editor e templates manuais completos.</p>
            <ul className="mt-6 space-y-3">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check size={18} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link
                href="/cadastro?plan=free"
                className="brand-btn outline w-full justify-center"
              >
                Começar grátis
              </Link>
            </div>
          </div>

          {/* Mensal */}
          <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--paper-2)] p-8 shadow-[var(--sh-2)]">
            <div className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-dim)]">Mensal</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold">{MONTHLY_PRICE}</span>
              <span className="text-[var(--ink-dim)]">/mês</span>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-dim)]">Flexível. Cobrado mês a mês.</p>
            <ul className="mt-6 space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check size={18} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <CheckoutButton interval="month" variant="outline" className="w-full justify-center">
                Assinar mensal
              </CheckoutButton>
            </div>
          </div>

          {/* Anual — destaque */}
          <div className="relative rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-8 shadow-[var(--sh-3)]">
            <div className="absolute -top-3 left-8 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white">
              Economize ~30%
            </div>
            <div className="text-sm font-semibold uppercase tracking-wide text-[var(--accent-ink)]">Anual</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold">{YEARLY_PRICE}</span>
              <span className="text-[var(--ink-dim)]">/ano</span>
            </div>
            <p className="mt-2 text-sm text-[var(--accent-ink)]">
              Equivale a {YEARLY_MONTHLY_EQUIV} — economize ~30%.
            </p>
            <ul className="mt-6 space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check size={18} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <CheckoutButton interval="year" variant="accent" className="w-full justify-center">
                Assinar anual
              </CheckoutButton>
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-[var(--ink-muted)]">
          Pagamento via cartão de crédito, processado com segurança. Para cancelar ou trocar de plano,
          entre em contato com nosso suporte. Ao assinar, você concorda com os{' '}
          <Link href="/termos" className="underline underline-offset-4">
            Termos de Uso
          </Link>
          , a{' '}
          <Link href="/privacidade" className="underline underline-offset-4">
            Política de Privacidade
          </Link>{' '}
          e a{' '}
          <Link href="/reembolso" className="underline underline-offset-4">
            Política de Reembolso
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
