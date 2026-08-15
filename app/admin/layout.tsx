import type { Metadata } from 'next';
import ThemeProvider from '@/components/ThemeProvider';
import AdminTabs from '@/components/admin/AdminTabs';
import AdminThemeToggle from '@/components/admin/AdminThemeToggle';

/**
 * Moldura do painel administrativo.
 *
 * ── POR QUE NÃO REAPROVEITA A SHELL DO CLIENTE ──────────────────────────────
 * A shell de `(app)` tem AppSidebar, AuthProvider e o modal de créditos: ela
 * é a navegação de QUEM USA o produto. Aqui a pessoa não cria carrossel nem
 * gasta crédito — ela olha o negócio. Reaproveitar a sidebar do cliente
 * significaria carregar estado de assinatura/créditos que o admin não usa e
 * misturar dois contextos que devem ficar separados até visualmente. Os
 * TOKENS e os componentes de marca (brand-card, chip, brand-btn) são
 * reaproveitados inteiros — o que não se reaproveita é a navegação.
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-[var(--paper-2)] text-[var(--ink)]">
        <header className="border-b-[1.5px] border-[var(--ink)] bg-[var(--paper)]">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-5 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="section-kicker">Creatools · interno</p>
                <h1 className="section-title">Painel administrativo</h1>
              </div>
              <AdminThemeToggle />
            </div>

            <AdminTabs />
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </ThemeProvider>
  );
}
