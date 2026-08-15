import type { Metadata } from 'next';
import ThemeProvider from '@/components/ThemeProvider';
import AdminTabs from '@/components/admin/AdminTabs';
import { requireAdminPage } from '@/lib/admin-page-guard';
import './admin.css';

/**
 * Moldura do painel administrativo.
 *
 * ── POR QUE NÃO REAPROVEITA A SHELL DO CLIENTE ──────────────────────────────
 * A shell de `(app)` tem AppSidebar, AuthProvider e o modal de créditos: ela
 * é a navegação de QUEM USA o produto. Aqui a pessoa não cria carrossel nem
 * gasta crédito — ela olha o negócio. Reaproveitar a sidebar do cliente
 * significaria carregar estado de assinatura/créditos que o admin não usa e
 * misturar dois contextos que devem ficar separados até visualmente. O admin
 * usa tokens próprios em admin.css, todos sob `.admin-root`, para a linguagem
 * de painel não alterar nenhuma superfície do produto.
 *
 * ── ESTE LAYOUT NÃO É O CONTROLE DE ACESSO ──────────────────────────────────
 * Ele é só cromo. A autorização mora em requireAdmin() dentro de CADA página e
 * CADA route handler sob /admin, que é onde o dado é lido. Layout que autoriza
 * dá uma falsa sensação de barreira: ele não roda em route handler nenhum, e
 * um `page.tsx` novo esquecido entraria protegido "por herança" até alguém
 * mexer na árvore.
 */

export const metadata: Metadata = {
  title: 'Painel administrativo — Creatools',
  // O painel não tem nada a fazer em índice de busca.
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // A guarda continua obrigatória em cada page. Aqui ela roda uma segunda vez
  // apenas para entregar a identidade da sessão ao rodapé da navegação.
  const admin = await requireAdminPage();

  return (
    <ThemeProvider>
      <div className="admin-root">
        <AdminTabs email={admin.email} />
        <main className="admin-main" data-testid="admin-conteudo">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
