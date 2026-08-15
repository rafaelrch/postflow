import AppShell from '@/components/AppShell';
import { isCurrentUserAdmin } from '@/lib/admin-auth';

/**
 * Shell do produto. Server Component por UM motivo: decidir se esta sessão vê o
 * atalho para /admin sem que a regra viaje para o navegador.
 *
 * `ADMIN_EMAILS` é env de servidor (nunca NEXT_PUBLIC_). A decisão roda aqui,
 * reusando `decideAdminAccess` via `isCurrentUserAdmin()`, e o que desce para o
 * cliente é um booleano — nem a lista, nem o e-mail que casou com ela.
 *
 * ⚠️ E o booleano NÃO é controle de acesso: ele decide um item de menu. /admin
 * é protegido no servidor, em cada página e cada route handler. Ver
 * lib/admin-auth.ts.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isCurrentUserAdmin();

  return <AppShell isAdmin={isAdmin}>{children}</AppShell>;
}
