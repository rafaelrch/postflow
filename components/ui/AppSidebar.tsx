'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Newspaper,
  Calendar,
  Palette,
  CreditCard,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';
import { createClient } from '@/lib/supabase';
import { useCreditsStore } from '@/hooks/useCreditsStore';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Rotas extras que mantêm o item ativo (além do próprio href). */
  match?: string[];
}

const navItems: NavItem[] = [
  { href: '/dashboard',  label: 'Carrosséis',  icon: LayoutGrid, match: ['/generator'] },
  { href: '/news',       label: 'Notícias',     icon: Newspaper },
  { href: '/agenda',     label: 'Agenda',       icon: Calendar },
  { href: '/onboarding', label: 'Onboarding',   icon: Palette },
  { href: '/conta',      label: 'Assinatura',   icon: CreditCard },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const credits = useCreditsStore((s) => s.balance);
  const fetchCredits = useCreditsStore((s) => s.fetch);
  const [collapsed, setCollapsed] = useState(false);

  // No editor (/generator) a sidebar entra colapsada por padrão pra dar espaço
  // ao canvas. Isso NÃO grava no localStorage — a preferência das outras páginas
  // fica intacta e o botão de expandir continua funcionando (colapso efêmero).
  const isGenerator = pathname === '/generator' || pathname.startsWith('/generator/');

  useEffect(() => {
    try {
      if (localStorage.getItem('sidebar_collapsed') === '1') setCollapsed(true);
    } catch { /* localStorage unavailable */ }
  }, []);

  // Ao entrar no editor, força o colapso (sem persistir).
  useEffect(() => {
    if (isGenerator) setCollapsed(true);
  }, [isGenerator]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      // Só persiste fora do editor, pra não sobrescrever a preferência global.
      if (!isGenerator) {
        try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch {}
      }
      return next;
    });
  };

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }: { data: { session: { user: { id: string; email?: string; user_metadata?: { name?: string } } } | null } }) => {
      const user = data.session?.user;
      if (!user || !active) return;

      setUserEmail(user.email || '');
      const metaName = user.user_metadata?.name?.trim();
      if (metaName) setUserName(metaName);

      supabase
        .from('profiles')
        .select('name, brand_name')
        .eq('id', user.id)
        .single()
        .then(({ data: profile }: { data: { name: string | null; brand_name: string | null } | null }) => {
          if (!active) return;
          const resolved = profile?.name?.trim() || metaName || profile?.brand_name?.trim() || '';
          if (resolved) setUserName(resolved);
        });

      supabase
        .from('user_active_subscription')
        .select('plan_interval')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }: { data: { plan_interval: string | null } | null }) => {
          if (active && data?.plan_interval) setPlanLabel(data.plan_interval === 'year' ? 'Anual' : 'Mensal');
        });

      fetchCredits();
    });

    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const initial = (userName || userEmail || '?').trim().charAt(0).toUpperCase();

  return (
    <aside
      className={cn(
        'shrink-0 h-screen flex flex-col border-r relative transition-[width] duration-200 ease-out',
        collapsed ? 'w-[76px]' : 'w-[240px]'
      )}
      style={{
        background: 'var(--paper-2)',
        borderColor: 'var(--line)',
      }}
    >
      {/* Brand */}
      <div
        className={cn(
          'h-24 flex items-center border-b relative',
          collapsed ? 'justify-center px-2' : 'px-5'
        )}
        style={{ borderColor: 'var(--line)' }}
      >
        <Link
          href="/dashboard"
          className={cn('flex items-center group', collapsed ? '' : 'w-full')}
          aria-label="Creatools"
        >
          {collapsed ? (
            <Image
              src="/ICON_SEMFUNDO.png"
              alt="Creatools"
              width={48}
              height={48}
              priority
              className="h-10 w-10 object-contain dark:invert"
            />
          ) : (
            <Image
              src="/LOGO_SEMFUNDO.png"
              alt="Creatools"
              width={268}
              height={80}
              priority
              className="h-20 w-auto object-contain dark:invert"
            />
          )}
        </Link>

        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          className="absolute top-1/2 -translate-y-1/2 -right-3 z-10 grid place-items-center w-6 h-6 rounded-full transition-colors hover:opacity-100 opacity-80"
          style={{
            background: 'var(--paper-2)',
            border: '1.5px solid var(--line-strong, var(--line))',
            color: 'var(--ink-dim)',
          }}
        >
          {collapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto py-5 flex flex-col gap-0.5',
          collapsed ? 'px-2' : 'px-3'
        )}
      >
        {navItems.map(({ href, label, icon: Icon, match }) => {
          const routes = [href, ...(match ?? [])];
          const isActive = routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                'group relative flex items-center rounded-[10px] text-[13.5px] font-medium transition-all duration-150',
                collapsed ? 'justify-center h-11 w-11 mx-auto' : 'gap-3 px-3 py-2.5',
                isActive ? 'brand-card interactive' : 'hover:translate-x-[-1px]'
              )}
              style={{
                background: isActive ? 'white' : 'transparent',
                color: isActive ? 'black' : 'var(--ink-dim)',
                border: isActive ? '1.5px solid black' : '1.5px solid transparent',
                boxShadow: isActive ? '3px 3px 0 0 black' : 'none',
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="flex-1">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer: theme toggle */}
      <div
        className={cn('shrink-0 py-3 border-t', collapsed ? 'px-2' : 'px-3')}
        style={{ borderColor: 'var(--line)' }}
      >
        <Link
          href="/conta"
          className={cn(
            'flex items-center mb-2 rounded-[10px] transition-colors hover:border-[var(--ink)]',
            collapsed ? 'justify-center p-1.5' : 'gap-3 px-2 py-2.5'
          )}
          style={{ background: 'var(--paper)', border: '1.5px solid var(--line)' }}
          title={collapsed ? `Conta — ${userName || 'Usuário'}` : 'Ver conta e assinatura'}
        >
          <span
            className="grid place-items-center w-8 h-8 rounded-full shrink-0 font-semibold text-[13px]"
            style={{
              background: 'var(--ink)',
              color: 'var(--paper)',
            }}
            aria-hidden
          >
            {initial}
          </span>
          {!collapsed && (
            <div className="flex flex-col min-w-0 leading-tight">
              <span
                className="text-[13px] font-semibold truncate"
                style={{ color: 'var(--ink)' }}
                title={userName || 'Usuário'}
              >
                {userName || 'Usuário'}
              </span>
              <span
                className="text-[11px] truncate"
                style={{ color: 'var(--ink-dim)' }}
                title={userEmail}
              >
                {userEmail || '—'}
              </span>
              {planLabel && (
                <span className="mt-1.5 flex items-center gap-1.5">
                  <span className="chip filled text-[9px] py-[1px] px-[6px]">{planLabel}</span>
                  {credits !== null && (
                    <span className="font-mono text-[10px]" style={{ color: 'var(--ink-dim)' }}>
                      {credits} créditos
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </Link>
        <button
          onClick={handleSignOut}
          className={cn('brand-btn ghost w-full mb-2', collapsed ? 'justify-center' : 'justify-start')}
          style={{ padding: '9px 12px', color: 'var(--ink-dim)' }}
          title={collapsed ? 'Sair' : undefined}
          aria-label="Sair"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={toggleTheme}
          className={cn('brand-btn outline w-full', collapsed ? 'justify-center' : 'justify-between')}
          style={{ padding: '9px 12px' }}
          title={collapsed ? (theme === 'light' ? 'Tema escuro' : 'Tema claro') : undefined}
          aria-label={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
        >
          {collapsed ? (
            theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />
          ) : (
            <>
              <span className="flex items-center gap-2">
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                <span>{theme === 'light' ? 'Tema escuro' : 'Tema claro'}</span>
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-dim)' }}>
                ⌘ .
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
