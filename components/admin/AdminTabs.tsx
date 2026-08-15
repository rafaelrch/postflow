'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Box,
  LayoutDashboard,
  Menu,
  Sparkles,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import AdminThemeToggle from './AdminThemeToggle';

/**
 * Abas do painel.
 *
 * As abas ainda vazias continuam navegáveis de propósito — elas levam a uma
 * página que diz honestamente o que falta, em vez de sumirem e darem a
 * impressão de que o painel já está completo.
 *
 * A query inteira acompanha os links. As seções futuras ainda não aplicam o
 * recorte, mas preservá-lo permite voltar à Visão geral sem perder o filtro.
 */

export const ADMIN_TABS = [
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard, ready: true },
  { href: '/admin/clientes', label: 'Clientes', icon: Users, ready: true },
  { href: '/admin/financeiro', label: 'Financeiro', icon: WalletCards, ready: false },
  { href: '/admin/produto', label: 'Produto', icon: Box, ready: false },
  { href: '/admin/saude', label: 'Saúde', icon: Activity, ready: false },
] as const;

export default function AdminTabs({ email }: { email: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const query = searchParams.toString();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

  return (
    <>
      <header className="admin-mobile-header">
        <div className="admin-brand admin-brand--mobile">
          <span className="admin-brand-mark"><Sparkles size={15} strokeWidth={1.8} /></span>
          <span>CreaTools</span>
          <span className="admin-internal-badge">Interno</span>
        </div>
        <button
          type="button"
          className="admin-icon-button"
          aria-label={open ? 'Fechar navegação' : 'Abrir navegação'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {open && <button className="admin-drawer-backdrop" aria-label="Fechar navegação" onClick={() => setOpen(false)} />}

      <aside className="admin-sidebar" data-open={open ? 'true' : 'false'} data-testid="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark"><Sparkles size={15} strokeWidth={1.8} /></span>
          <span>CreaTools</span>
          <span className="admin-internal-badge">Interno</span>
        </div>

        <nav aria-label="Seções do painel" className="admin-nav">
          <p className="admin-nav-label">Workspace</p>
          <ul>
            {ADMIN_TABS.map((tab) => {
              const current = pathname === tab.href;
              const href = query ? `${tab.href}?${query}` : tab.href;
              const Icon = tab.icon;
              return (
                <li key={tab.href}>
                  <Link
                    href={href}
                    aria-current={current ? 'page' : undefined}
                    data-testid={`admin-tab-${tab.href}`}
                    className="admin-nav-item"
                  >
                    <Icon size={16} strokeWidth={1.7} aria-hidden />
                    <span>{tab.label}</span>
                    {!tab.ready && <span className="admin-soon">Em breve</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <footer className="admin-sidebar-footer">
          <div className="admin-session">
            <span className="admin-avatar" aria-hidden>{email.slice(0, 1).toUpperCase()}</span>
            <span className="admin-session-copy">
              <span className="admin-session-label">Sessão administrativa</span>
              <span className="admin-session-email" title={email}>{email}</span>
            </span>
          </div>
          <AdminThemeToggle />
          <Link href="/dashboard" className="admin-back-link">
            <ArrowLeft size={15} strokeWidth={1.7} aria-hidden />
            Voltar ao produto
          </Link>
        </footer>
      </aside>
    </>
  );
}
