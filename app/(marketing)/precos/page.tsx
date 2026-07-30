import Link from 'next/link';
import { Check, ArrowLeft } from 'lucide-react';
import CheckoutButton from '@/components/billing/CheckoutButton';

export const metadata = {
  title: 'Planos e preços — Creatools',
  description: 'Assine o Creatools: plano mensal ou anual.',
};

/**
 * Canais oficiais de atendimento (decisão do Rafael, 30/07/2026): e-mail e
 * Instagram. São os ÚNICOS dois publicados — não há telefone nem WhatsApp, e
 * não existe portal de autoatendimento. Estes valores se repetem nas 5 páginas
 * públicas: mudou aqui, muda nas cinco.
 */
const SUPORTE_URL = 'https://instagram.com/creatools';
const SUPORTE_HANDLE = '@creatools';
const SUPORTE_EMAIL = 'contato@creatools.com';

/**
 * Os DOIS canais oficiais, sempre juntos. E-mail primeiro de propósito: onde o
 * texto manda cancelar ou pedir reembolso, ele deixa registro escrito dos dois
 * lados e não exige conta no Instagram. O DM continua oferecido — é mais
 * rápido —, nunca como via única.
 */
function Canais() {
  return (
    <>
      <a href={`mailto:${SUPORTE_EMAIL}`} className="underline underline-offset-4">
        {SUPORTE_EMAIL}
      </a>{' '}
      ou no Instagram{' '}
      <a
        href={SUPORTE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {SUPORTE_HANDLE}
      </a>
    </>
  );
}

const MONTHLY_PRICE = 'R$ 59,50';
const YEARLY_PRICE = 'R$ 499';
const YEARLY_MONTHLY_EQUIV = 'R$ 41,58/mês';

// Plano gratuito: Studio manual completo, sem nenhuma IA.
// Cada linha abaixo é verificável no código — não escreva nada aqui que você
// não consiga apontar num arquivo:
//   - formatos 4:5 / 1:1 / 9:16 .......... lib/formats.ts (FORMAT_LIST)
//   - 3 estilos de carrossel ............. types/index.ts (SlideStyle)
//   - teto de 5 projetos salvos .......... enforce_free_carousel_limit (>= 5)
//   - teto de 4 notícias por dia ......... FREE_NEWS_DAILY_LIMIT / trigger 24h
//   - sem IA ............................. as 2 rotas de IA exigem requirePlan 'pro'
//   - calendário ......................... /agenda não tem gate de plano: o proxy só
//     exige sessão, a policy scheduled_posts_owner só compara auth.uid() = user_id e
//     o único trigger da tabela é set_updated_at. Por isso ele aparece nos DOIS cards
//     — listar só no pago faria o free pagar por algo que já tem.
const FREE_FEATURES = [
  'Studio de edição completo (4:5, 1:1, 9:16)',
  'Carrosséis e notícias manuais, nos 3 estilos: Editorial, Minimalista e Thread do X',
  'Calendário de postagem',
  'Até 5 carrosséis salvos',
  'Até 4 notícias por dia',
  'Sem recursos de IA',
];

// Planos pagos: a IA é exclusividade daqui, e os tetos do Grátis somem.
// Referências: geração de carrossel e de imagem em app/api/generate-*/route.ts
// (ambas com requireEntitlement({ requirePlan: 'pro' })); custo de 5 créditos
// em lib/credits.ts (CREDIT_COSTS); mesada 200/300 em supabase/credits-and-flow.sql.
// "Ilimitado" aqui vale para o ACERVO (os triggers de limite dão `return new`
// quando o plano é 'pro'), NÃO para a geração por IA — essa é limitada pelos
// créditos do mês. Não escreva "carrosséis ilimitados por IA": seria falso.
const FEATURES = [
  'Carrosséis gerados por IA: texto dos slides, legenda e hashtags',
  'Imagens com IA',
  'Créditos de IA todo mês: 200 no mensal, 300 no anual (carrossel e imagem custam 5 cada)',
  'Projetos salvos ilimitados',
  'Notícias sem limite diário',
  'Studio de edição completo',
  'Calendário de postagem',
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
            O Grátis já tem o Studio completo. Os planos pagos somam IA e tiram os limites.
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
          Pagamento em cartão de crédito, processado com segurança. Para cancelar ou trocar de plano,
          fale com a gente pelo e-mail <Canais />. Ao assinar, você concorda com os{' '}
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
