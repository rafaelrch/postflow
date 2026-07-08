import Link from 'next/link';
import { Check, ArrowLeft } from 'lucide-react';
import CheckoutButton from '@/components/billing/CheckoutButton';

export const metadata = {
  title: 'Planos e preços — Creatools',
  description: 'Assine o Creatools: plano mensal ou anual.',
};

const MONTHLY_PRICE = 'R$ 59,50';
const YEARLY_PRICE = 'R$ 499';
const YEARLY_MONTHLY_EQUIV = 'R$ 41,58/mês';

const FEATURES = [
  'Créditos de IA todo mês (200 no mensal, 300 no anual)',
  'Editor visual de carrosséis com export PNG/ZIP',
  'Cards de notícias e editorial',
  'Calendário de conteúdo',
  'Imagens com IA (OpenAI gpt-image-2) — 5 créditos cada',
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

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
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
              3 meses grátis
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
          Pagamento via cartão de crédito processado com segurança pela Stripe. Você pode cancelar ou
          trocar de plano a qualquer momento no portal de assinatura.
        </p>
      </div>
    </main>
  );
}
