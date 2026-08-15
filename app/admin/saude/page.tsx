import { requireAdminPage } from '@/lib/admin-page-guard';
import UnderConstruction from '@/components/admin/UnderConstruction';

export default async function AdminSaudePage() {
  await requireAdminPage();

  return (
    <UnderConstruction
      title="Saúde"
      summary="Webhook parado, assinatura ativa sem current_period_end, intent de cadastro expirado e cobrança em atraso já existem no banco e viram alerta numa fatia própria. Ficam de fora daqui porque alerta operacional precisa de regra de severidade e de ação sugerida — um número solto na Visão geral não ajuda a consertar nada."
      pending={[
        'Regras de severidade: a partir de quanto tempo um webhook sem processed_at é incidente.',
        'Ação ao lado de cada alerta (reprocessar, conferir no Asaas, contatar o cliente).',
        'Falhas de geração de IA, que hoje só existem no log e não em fonte consultável.',
      ]}
    />
  );
}
