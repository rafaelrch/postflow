import Link from 'next/link';
import Shell from '../Shell';

export const metadata = {
  title: 'Pagamento cancelado — Creatools',
  description: 'Você saiu do checkout antes de concluir o pagamento.',
};

/**
 * Volta do checkout hospedado quando o comprador desiste (callback.cancelUrl).
 *
 * Nada foi cobrado e nada precisa ser desfeito: o checkout do Asaas expira
 * sozinho. O lead já foi gravado antes do redirect, então esta pessoa continua
 * no funil — o texto assume isso e não pede os dados de novo.
 */
export default function CheckoutCanceladoPage() {
  return (
    <Shell
      title="Você saiu antes de concluir"
      cta={
        <>
          <Link
            href="/precos"
            className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--on-accent)]"
          >
            Escolher um plano
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-medium text-[var(--ink)]"
          >
            Voltar para o início
          </Link>
        </>
      }
    >
      <p>
        Nenhuma cobrança foi feita. Se foi sem querer, é só escolher o plano de novo — leva menos
        de um minuto.
      </p>
      <p className="text-sm">
        Se o pagamento não passou, vale tentar outro cartão — o checkout aceita cartão de
        crédito.
      </p>
    </Shell>
  );
}
