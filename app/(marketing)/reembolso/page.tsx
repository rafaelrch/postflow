import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Política de Reembolso — Creatools',
  description: 'Direito de arrependimento de 7 dias, prazos de estorno e cancelamento de assinatura no Creatools.',
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Direito de arrependimento (7 dias)',
    body: (
      <p>
        Como a contratação do Creatools é feita fora de estabelecimento comercial (pela internet),
        você tem o direito de se arrepender da compra em até <strong className="text-[var(--ink)]">7 dias corridos</strong>{' '}
        a partir da data da assinatura, conforme o art. 49 do Código de Defesa do Consumidor (CDC).
        Nesse prazo, o cancelamento dá direito a{' '}
        <strong className="text-[var(--ink)]">reembolso integral</strong>, sem necessidade de
        justificativa.
      </p>
    ),
  },
  {
    title: '2. Como solicitar',
    body: (
      <p>
        O Creatools ainda está em fase de desenvolvimento e não possui, no momento, um canal
        oficial de suporte por e-mail — assim que o serviço entrar em operação comercial, o e-mail
        de suporte para solicitações de reembolso será publicado nesta seção. A solicitação deve
        informar o e-mail usado na assinatura e o pedido de reembolso/desistência dentro dos 7
        dias; confirmamos por e-mail assim que o reembolso for iniciado.
      </p>
    ),
  },
  {
    title: '3. Prazos de estorno',
    body: (
      <p>
        O reembolso é processado pela Stripe em poucos dias úteis após a aprovação do pedido. Como
        a assinatura é paga por cartão de crédito, o prazo para o valor aparecer na sua fatura
        depende da operadora do cartão e do banco emissor, podendo levar até 1 ou 2 ciclos de
        faturamento.
      </p>
    ),
  },
  {
    title: '4. Após os 7 dias',
    body: (
      <p>
        Passado o prazo de arrependimento, não há mais reembolso incondicional. Você pode cancelar
        a renovação automática a qualquer momento pelo portal de assinatura — o cancelamento evita
        cobranças futuras, mas o acesso permanece ativo até o fim do ciclo já pago, sem reembolso
        proporcional do período em curso, salvo exigência legal em contrário.
      </p>
    ),
  },
  {
    title: '5. Cancelamento da renovação automática',
    body: (
      <p>
        Para cancelar a renovação, acesse sua conta e abra o portal de assinatura (gerenciamento de
        plano). O cancelamento é imediato para fins de renovação futura: você não será cobrado no
        próximo ciclo, mesmo mantendo acesso até o fim do período vigente.
      </p>
    ),
  },
  {
    title: '6. Casos excepcionais',
    body: (
      <p>
        Cobranças duplicadas, erros técnicos de faturamento ou falhas comprovadas do serviço são
        avaliados individualmente e podem ser reembolsados mesmo fora do prazo padrão de 7 dias, a
        critério do Creatools. Entre em contato pelo canal de suporte informado na seção 2.
      </p>
    ),
  },
];

export default function ReembolsoPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)] px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] mb-10">
          <ArrowLeft size={16} /> Voltar
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Política de Reembolso</h1>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">Última atualização: 17 de julho de 2026.</p>
        </header>

        <div
          className="mb-10 rounded-xl border-2 px-5 py-4 text-sm font-medium"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'var(--accent-soft)' }}
        >
          Documento em revisão — versão preliminar. Este rascunho ainda não passou por revisão
          jurídica final e pode ser alterado antes da publicação definitiva.
        </div>

        <div className="space-y-8 text-[15px] leading-relaxed text-[var(--ink-dim)]">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold text-[var(--ink)] mb-2">{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
