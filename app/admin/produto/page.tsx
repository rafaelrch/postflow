import { requireAdminPage } from '@/lib/admin-page-guard';
import UnderConstruction from '@/components/admin/UnderConstruction';

export default async function AdminProdutoPage() {
  await requireAdminPage();

  return (
    <UnderConstruction
      title="Produto"
      summary="Uso de feature, exportações, criação por IA × manual e retenção não são mensuráveis hoje: o produto não registra evento nenhum. Contar linhas de carousels ou news_entries mediria “conteúdo que ainda existe”, não uso — registros apagados somem do histórico, e exportação acontece no navegador sem deixar rastro."
      pending={[
        'Tabela append-only de eventos de produto (usuário, evento, feature, timestamp), sem conteúdo gerado.',
        'Marcar a data de início da coleta, para o painel não fingir histórico anterior a ela.',
        'Ledger de créditos, para saber o consumo por feature em vez do saldo atual.',
      ]}
    />
  );
}
