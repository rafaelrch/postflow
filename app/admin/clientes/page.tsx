import { requireAdminPage } from '@/lib/admin-page-guard';
import UnderConstruction from '@/components/admin/UnderConstruction';

/**
 * A guarda roda AQUI, mesmo a página não lendo nada: /admin/clientes existir
 * sem checagem é uma rota interna aberta esperando ganhar conteúdo. Quando a
 * Fatia 2 encher esta tela, a barreira já estará no lugar.
 */
export default async function AdminClientesPage() {
  await requireAdminPage();

  return (
    <UnderConstruction
      title="Clientes"
      summary="A lista de clientes com busca, plano, saldo de créditos e estado do cadastro é a Fatia 2. Ela mexe com dado pessoal (e-mail, telefone, documento), então precisa de decisão explícita sobre o que aparece e o que fica mascarado — não é coisa para improvisar aqui."
      pending={[
        'Definir quais campos pessoais aparecem na tabela e quais ficam mascarados.',
        'Paginação no servidor: auth.users não pode ser puxada inteira.',
        'Junção honesta entre auth.users, profiles, subscriptions e user_credits, mostrando divergência em vez de escondê-la.',
      ]}
    />
  );
}
