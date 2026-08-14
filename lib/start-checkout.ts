import toast from 'react-hot-toast';
import type { PlanInterval } from '@/lib/plans';

/**
 * Inicia o checkout do Asaas a partir do client, com o lead JÁ gravado.
 *
 * Viaja o ID DO LEAD, não o e-mail. Duas razões: o e-mail (e o resto do
 * contato) o servidor busca sozinho a partir do id, então o client não precisa
 * ser fonte de verdade de nada; e o id é o que vira `externalReference` no
 * Asaas, a chave pela qual o webhook liga o pagamento de volta ao comprador.
 *
 * O CPF não é pedido em lugar nenhum daqui: o checkout hospedado do Asaas
 * coleta o documento na página dele.
 *
 * Trata 409 (já assina → dashboard). Lança nos demais erros para o popup exibir
 * sem fechar, preservando o que o usuário digitou.
 */
export async function startAsaasCheckout(
  interval: PlanInterval,
  leadId: string,
): Promise<void> {
  const res = await fetch('/api/asaas/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interval, leadId }),
  });
  const data = await res.json().catch(() => ({}));

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
