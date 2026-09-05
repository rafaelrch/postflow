import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * Porta de entrada do /setup. A guarda mora aqui, e não em page.tsx, pelo
 * mesmo motivo do /reels: este layout é o ponto MAIS ALTO da rota, decide
 * antes de a página client rodar seus hooks.
 *
 * Não dá para mover a checagem para dentro de page.tsx sem tocar no arquivo
 * (que é 'use client' e chama /api/check-db, hoje protegida por admin) — e a
 * página não muda: sem a guarda aqui, um usuário comum abriria /setup, o
 * fetch bateria 403 e ele veria a tela de erro genérica em vez de ser
 * desviado antes de a página aparecer.
 *
 * `redirect()`, não `requireAdminPage()`: aquela chama unauthorized()/
 * forbidden(), interrupts do Next que precisam de um boundary
 * unauthorized.tsx/forbidden.tsx acima na árvore — e esses só existem em
 * app/admin/. /setup é diagnóstico interno, não painel: desviar para
 * /dashboard é o mesmo comportamento do /reels.
 */
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdmin();
  if (!access.ok) {
    redirect('/dashboard');
  }
  return <>{children}</>;
}
