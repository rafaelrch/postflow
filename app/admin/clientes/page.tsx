import { requireAdminPage } from '@/lib/admin-page-guard';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { loadAdminCustomers, parseAdminCustomerQuery } from '@/lib/admin-customers';
import CustomersShell from '@/components/admin/CustomersShell';

/**
 * A guarda roda AQUI, mesmo a página não lendo nada: /admin/clientes existir
 * sem checagem é uma rota interna aberta esperando ganhar conteúdo. Quando a
 * Fatia 2 encher esta tela, a barreira já estará no lugar.
 */
export default async function AdminClientesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const query = parseAdminCustomerQuery(await searchParams);
  try {
    const data = await loadAdminCustomers(createAdminSupabaseClient(), query);
    return <div className="admin-page"><CustomersShell query={query} data={data} /></div>;
  } catch (error) {
    console.error('[admin/clientes]', error);
    return <div className="admin-page"><CustomersShell query={query} data={null} failed /></div>;
  }
}
