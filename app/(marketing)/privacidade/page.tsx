import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Política de Privacidade — Creatools',
  description: 'Como o Creatools coleta, usa e protege seus dados pessoais, em conformidade com a LGPD.',
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Controlador dos dados',
    body: (
      <p>
        O Creatools é o controlador dos dados pessoais tratados nesta plataforma, nos termos da Lei
        Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD). O Creatools ainda está em fase de
        desenvolvimento e não possui, no momento, um e-mail oficial de contato — assim que o
        serviço entrar em operação comercial, o canal oficial para dúvidas e solicitações sobre
        dados pessoais (acesso, correção, exclusão etc.) será publicado nesta seção.
      </p>
    ),
  },
  {
    title: '2. Dados que coletamos',
    body: (
      <p>
        Coletamos: (a) dados de cadastro — nome, e-mail e telefone; (b) dados de pagamento —
        processados diretamente pela Stripe, nossa processadora de pagamentos (o Creatools não
        armazena números de cartão de crédito); (c) dados de uso da plataforma, incluindo prompts,
        conteúdos gerados e histórico de créditos; (d) dados técnicos, como endereço IP e
        identificadores de sessão, coletados via cookies.
      </p>
    ),
  },
  {
    title: '3. Finalidades do tratamento',
    body: (
      <p>
        Usamos seus dados para: viabilizar a criação e autenticação da sua conta; processar
        pagamentos e cobrança recorrente; fornecer o serviço de geração de conteúdo com IA; prestar
        suporte; comunicar avisos sobre a conta, cobrança e mudanças no serviço; prevenir fraude e
        garantir a segurança da plataforma; e melhorar o produto.
      </p>
    ),
  },
  {
    title: '4. Base legal',
    body: (
      <p>
        Tratamos seus dados com base em: execução de contrato (art. 7º, V, LGPD), para prestar o
        serviço contratado; cumprimento de obrigação legal ou regulatória (ex.: fiscal); legítimo
        interesse, para prevenção a fraude e segurança da plataforma; e consentimento, quando
        aplicável (ex.: comunicações de marketing opcionais).
      </p>
    ),
  },
  {
    title: '5. Compartilhamento com terceiros e transferência internacional',
    body: (
      <p>
        Compartilhamos dados com prestadores essenciais ao funcionamento do serviço: Stripe
        (processamento de pagamentos) e Supabase (banco de dados e autenticação).{' '}
        <strong className="text-[var(--ink)]">
          Os prompts e conteúdos que você envia para gerar carrosséis, textos e imagens são
          processados pela OpenAI, L.L.C., empresa sediada nos Estados Unidos — isso envolve
          transferência internacional de dados.
        </strong>{' '}
        Essas transferências seguem as hipóteses e salvaguardas previstas no art. 33 da LGPD. Não
        vendemos seus dados pessoais a terceiros.
      </p>
    ),
  },
  {
    title: '6. Cookies',
    body: (
      <p>
        Usamos cookies essenciais para manter sua sessão autenticada e garantir o funcionamento
        básico da plataforma. Você pode gerenciar cookies nas configurações do seu navegador, mas
        desativar cookies essenciais pode impedir o uso do Creatools.
      </p>
    ),
  },
  {
    title: '7. Retenção dos dados',
    body: (
      <p>
        Mantemos seus dados enquanto sua conta estiver ativa e pelo período adicional necessário
        para cumprir obrigações legais, fiscais ou regulatórias, ou para exercício regular de
        direitos em processos judiciais ou administrativos. Após o encerramento da conta e o
        cumprimento desses prazos, os dados são eliminados ou anonimizados.
      </p>
    ),
  },
  {
    title: '8. Seus direitos como titular (LGPD art. 18)',
    body: (
      <p>
        Você tem direito a: confirmação da existência de tratamento; acesso aos seus dados;
        correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou
        eliminação de dados desnecessários ou excessivos; portabilidade a outro fornecedor;
        eliminação dos dados tratados com consentimento; informação sobre entidades públicas e
        privadas com as quais compartilhamos dados; e revogação do consentimento, quando aplicável.
        Para exercer qualquer um desses direitos, entre em contato pelos canais de suporte da
        plataforma ou pelo contato do controlador indicado na seção 1.
      </p>
    ),
  },
  {
    title: '9. Segurança',
    body: (
      <p>
        Adotamos medidas técnicas e administrativas razoáveis para proteger seus dados contra
        acessos não autorizados, perda, alteração ou vazamento, incluindo controle de acesso e
        criptografia em trânsito.
      </p>
    ),
  },
  {
    title: '10. Alterações desta política',
    body: (
      <p>
        Podemos atualizar esta política periodicamente. Mudanças relevantes serão comunicadas por
        e-mail ou aviso na plataforma antes de entrarem em vigor.
      </p>
    ),
  },
];

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)] px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] mb-10">
          <ArrowLeft size={16} /> Voltar
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Política de Privacidade</h1>
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
