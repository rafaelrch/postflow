'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap, LayoutDashboard, Sun, Moon, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.623L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
  </svg>
);

const navItems = [
  {
    href: '/dashboard',
    label: 'Carrosséis',
    icon: LayoutDashboard,
  },
  {
    href: '/twitter',
    label: 'Twitter / X',
    icon: XIcon,
  },
  {
    href: '/news',
    label: 'Notícias',
    icon: Newspaper,
  },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="w-[220px] shrink-0 h-screen flex flex-col bg-[var(--surface)] border-r border-black/[0.06] dark:border-white/[0.06]">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gray-900 dark:bg-white flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white dark:text-black" />
          </div>
          <span className="font-bold text-gray-900 dark:text-white text-sm tracking-tight">PostFlow</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold text-gray-900/30 dark:text-white/30 uppercase tracking-wider px-2 mb-1">
          Ferramentas
        </p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-black'
                  : 'text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer: Theme toggle */}
      <div className="shrink-0 px-2 py-3 border-t border-black/[0.06] dark:border-white/[0.06]">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-4 h-4 shrink-0" />
              Tema escuro
            </>
          ) : (
            <>
              <Sun className="w-4 h-4 shrink-0" />
              Tema claro
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
