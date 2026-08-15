'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Abas do painel.
 *
 * As abas ainda vazias continuam navegáveis de propósito — elas levam a uma
 * página que diz honestamente o que falta, em vez de sumirem e darem a
 * impressão de que o painel já está completo.
 *
 * Não carrega o filtro de período na query de propósito: nesta fatia só a
 * Visão geral lê período, e arrastar `?periodo=…` para abas que o ignoram
 * criaria uma URL que promete um recorte que a tela não aplica.
 */

export const ADMIN_TABS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/financeiro', label: 'Financeiro' },
  { href: '/admin/produto', label: 'Produto' },
  { href: '/admin/saude', label: 'Saúde' },
] as const;

export default function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções do painel" className="-mx-1 overflow-x-auto">
      <ul className="flex w-max min-w-full items-center gap-2 px-1 pb-1">
        {ADMIN_TABS.map((tab) => {
          const current = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                data-testid={`admin-tab-${tab.href}`}
                className={`chip ${current ? 'filled' : ''} px-3 py-2 transition-transform hover:-translate-y-px`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
