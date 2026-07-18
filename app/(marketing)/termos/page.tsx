import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Termos de Uso — Creatools',
  description: 'Termos de uso do Creatools: assinatura, pagamento, uso aceitável e responsabilidades.',
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Objeto do serviço',
    body: (
      <p>
        O Creatools é uma plataforma (SaaS) que auxilia criadores e empresas a produzir carrosséis,
        posts e imagens para redes sociais com apoio de inteligência artificial, incluindo a API da
        OpenAI. O serviço é oferecido mediante assinatura paga, conforme os planos descritos em{' '}
        <Link href="/precos" className="underline underline-offset-4">
          /precos
        </Link>
        .
      </p>
    ),
  },
  {
    title: '2. Conta e responsabilidades',
    body: (
      <p>
        Você é responsável por manter a veracidade dos dados cadastrados, pela guarda de suas
        credenciais de acesso e por toda atividade realizada em sua conta, inclusive por terceiros
        autorizados por você. Avise imediatamente o suporte em caso de uso não autorizado.
      </p>
    ),
  },
  {
    title: '3. Planos, pagamento e renovação automática',
    body: (
      <p>
        O Creatools é vendido por assinatura recorrente, processada pela Stripe: plano mensal
        (R$ 59,50/mês) ou plano anual (R$ 499,00/ano, com 3 meses de teste grátis para novos
        assinantes). A assinatura renova automaticamente ao fim de cada ciclo até que seja
        cancelada. Você pode cancelar a renovação a qualquer momento pelo portal de assinatura,
        com efeito ao término do período já pago — sem cobranças futuras. Consulte também a nossa{' '}
        <Link href="/reembolso" className="underline underline-offset-4">
          Política de Reembolso
        </Link>
        , que trata do direito de arrependimento de 7 dias.
      </p>
    ),
  },
  {
    title: '4. Uso aceitável',
    body: (
      <p>
        Ao usar o Creatools, você concorda em não: (a) utilizar o serviço para fins ilegais ou para
        gerar conteúdo que viole direitos de terceiros (autorais, de imagem, de propriedade
        intelectual); (b) enviar spam ou conteúdo enganoso; (c) tentar burlar limites de créditos,
        engenhar reversamente a plataforma ou comprometer sua segurança; (d) revender ou
        redistribuir o acesso ao serviço sem autorização.
      </p>
    ),
  },
  {
    title: '5. Propriedade do conteúdo gerado',
    body: (
      <p>
        Você é o titular do conteúdo que cria usando o Creatools, respeitados os termos de uso da
        OpenAI e a legislação aplicável. O Creatools não reivindica propriedade sobre os
        carrosséis, textos ou imagens gerados por você. Você é responsável por revisar e validar o
        conteúdo antes de publicá-lo, inclusive quanto à precisão factual e à conformidade com
        direitos de terceiros — conteúdo gerado por IA pode conter imprecisões.
      </p>
    ),
  },
  {
    title: '6. Limitação de responsabilidade',
    body: (
      <p>
        O serviço é fornecido &quot;como está&quot;, sem garantia de resultados de marketing,
        engajamento ou vendas. Na máxima extensão permitida por lei, a responsabilidade total do
        Creatools por danos relacionados ao uso do serviço fica limitada ao valor efetivamente pago
        por você nos 12 meses anteriores ao evento, excluídos danos indiretos, lucros cessantes ou
        perda de dados de terceiros.
      </p>
    ),
  },
  {
    title: '7. Rescisão',
    body: (
      <p>
        Você pode encerrar sua conta e cancelar a assinatura a qualquer momento pelo portal de
        assinatura. O Creatools pode suspender ou encerrar contas que violem estes termos,
        mediante aviso quando possível, sem prejuízo dos valores já devidos até a data do
        encerramento.
      </p>
    ),
  },
  {
    title: '8. Alterações destes termos',
    body: (
      <p>
        Podemos atualizar estes termos periodicamente para refletir mudanças no serviço ou na
        legislação. Alterações relevantes serão comunicadas por e-mail ou aviso na plataforma antes
        de entrarem em vigor.
      </p>
    ),
  },
  {
    title: '9. Foro',
    body: (
      <p>
        Este contrato é regido pelas leis do Brasil. Fica eleito o foro do domicílio do consumidor
        para dirimir eventuais controvérsias decorrentes destes termos, conforme o art. 101, I, do
        Código de Defesa do Consumidor.
      </p>
    ),
  },
];

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)] px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] mb-10">
          <ArrowLeft size={16} /> Voltar
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Termos de Uso</h1>
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
