import Link from 'next/link';
import Shell from '../Shell';

export const metadata = {
  title: 'Link de pagamento expirado — Creatools',
  description: 'O link de pagamento venceu. Gere um novo para concluir a assinatura.',
};

/**
 * Volta do checkout hospedado quando o link venceu (callback.expiredUrl).
 *
 * O prazo é o `minutesToExpire` que a rota de checkout define. Expirar é
 * proposital: um link antigo que continuasse pagável criaria assinatura para
 * quem já desistiu — ou para quem já assinou por outro link — e o webhook não
 * teria como distinguir os dois casos.
 */
export default function CheckoutExpiradoPage() {
  return (
    <Shell
      title="Esse link de pagamento venceu"
      cta={
        <Link
          href="/precos"
          className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--on-accent)]"
        >
          Gerar um novo link
        </Link>
      }
    >
      <p>
        Links de pagamento têm prazo por segurança. Nenhuma cobrança foi feita — escolha o plano
        de novo e um link novo é gerado na hora.
      </p>
      <p className="text-sm">
        Se você chegou a pagar por este link antes de ele vencer, não pague de novo: fale com a
        gente antes, para não gerar cobrança duplicada.
      </p>
    </Shell>
  );
}
