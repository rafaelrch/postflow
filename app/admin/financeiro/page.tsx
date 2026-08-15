import { requireAdminPage } from '@/lib/admin-page-guard';
import UnderConstruction from '@/components/admin/UnderConstruction';

export default async function AdminFinanceiroPage() {
  await requireAdminPage();

  return (
    <UnderConstruction
      title="Financeiro"
      summary="Receita recebida, reembolso, chargeback e histórico por pagamento são a Fatia 3. Hoje o banco guarda o ESTADO atual da assinatura e o payload cru do webhook — o mesmo pagamento gera vários eventos, então somar payload dobraria o valor."
      pending={[
        'Tabela normalizada de transações: uma linha por provider_payment_id, atualizada pelo webhook.',
        'Distinguir PAYMENT_CONFIRMED (venda) de PAYMENT_RECEIVED (dinheiro na conta).',
        'Taxas do Asaas para separar bruto de líquido.',
        'Histórico de status da assinatura, sem o qual churn e MRR perdido não são calculáveis.',
      ]}
    />
  );
}
