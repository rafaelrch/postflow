import Link from 'next/link';
import { verifySignupToken } from '@/lib/signup-token';
import Shell from '../Shell';

export const metadata = {
  title: 'Confirmando seu pagamento — Creatools',
  description: 'Estamos confirmando seu pagamento com a operadora.',
};

// O token vem na query string; nada aqui pode ser pré-renderizado.
export const dynamic = 'force-dynamic';

/**
 * Volta do checkout hospedado do Asaas (callback.successUrl).
 *
 * ⚠️ ESTA PÁGINA NÃO LIBERA NADA. Chegar aqui significa apenas "o Asaas
 * redirecionou de volta" — e isso acontece antes de a cobrança ser confirmada,
 * inclusive num PIX que o comprador ainda não pagou. Quem cria a assinatura é
 * o webhook (PAYMENT_CONFIRMED), e o cadastro exige essa linha no banco. Se um
 * dia alguém for tentado a "adiantar" o acesso a partir daqui: é exatamente
 * assim que se dá acesso de graça a quem fechou o checkout sem pagar.
 *
 * O token só responde "de qual lead é esta volta" (ver lib/signup-token.ts).
 * Token ausente ou adulterado não é erro do comprador — provavelmente ele
 * chegou aqui de um link velho —, então o texto é o mesmo; o que muda é não
 * seguirmos para o cadastro.
 */
export default async function CheckoutSucessoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const leadId = verifySignupToken(t);

  return (
    <Shell
      title="Estamos confirmando seu pagamento"
      cta={
        leadId ? (
          <Link
            href={`/cadastro?t=${encodeURIComponent(t ?? '')}`}
            className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--on-accent)]"
          >
            Criar minha conta
          </Link>
        ) : (
          <Link
            href="/precos"
            className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--on-accent)]"
          >
            Ver os planos
          </Link>
        )
      }
    >
      <p>
        Recebemos o retorno da operadora e estamos confirmando o pagamento. Isso costuma levar
        alguns segundos no cartão de crédito, e pode levar alguns minutos no PIX.
      </p>
      <p>
        {leadId
          ? 'Assim que a confirmação chegar, você já consegue criar sua conta com o mesmo e-mail que usou no pagamento.'
          : 'Se você acabou de pagar, volte para a página de planos e siga o link que enviamos por e-mail para criar sua conta.'}
      </p>
      <p className="text-sm">
        Não feche esta página achando que deu errado: a confirmação chega mesmo que você saia
        daqui, e o acesso é liberado sozinho.
      </p>
    </Shell>
  );
}
