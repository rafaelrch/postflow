import toast from 'react-hot-toast';
import type { PlanInterval } from '@/lib/stripe';

/**
 * Inicia o checkout Stripe a partir do client: chama POST /api/stripe/checkout
 * e redireciona para a sessão hospedada. Trata 401 (manda pro login) e 409
 * (já assina → manda pra conta). Lança em outros erros para o caller exibir.
 *
 * Usado tanto na página /precos quanto nos botões de plano da landing page.
 */
export async function startStripeCheckout(
  interval: PlanInterval,
  opts: { nextPath?: string } = {},
): Promise<void> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interval }),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    toast.error('Faça login para assinar.');
    window.location.href = `/login?next=${encodeURIComponent(opts.nextPath ?? '/precos')}`;
    return;
  }
  if (res.status === 409 && data.alreadySubscribed) {
    toast('Você já tem uma assinatura ativa.');
    window.location.href = '/dashboard';
    return;
  }
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Não foi possível iniciar o checkout');
  }
  window.location.href = data.url as string;
}
