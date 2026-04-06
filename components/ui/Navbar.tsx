'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap, LayoutDashboard, Sparkles, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';

interface NavbarProps {
  isEditor?: boolean;
  slideCount?: number;
  activeSlide?: number;
  onPrevSlide?: () => void;
  onNextSlide?: () => void;
  onAddSlide?: () => void;
  onDeleteSlide?: () => void;
  onGenerateCaption?: () => void;
}

export default function Navbar({
  isEditor = false,
  slideCount = 0,
  activeSlide = 0,
  onPrevSlide,
  onNextSlide,
  onAddSlide,
  onDeleteSlide,
  onGenerateCaption,
}: NavbarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-12 bg-[var(--background)] border-b border-black/[0.06] dark:border-white/[0.06] flex items-center px-4 gap-4 z-50 shrink-0">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
        <Zap className="w-5 h-5 text-gray-900 dark:text-white" />
        <span className="font-bold text-gray-900 dark:text-white text-sm">PostFlow</span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        <Link
          href="/dashboard"
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            pathname === '/dashboard'
              ? 'bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white'
              : 'text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
          )}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Dashboard
        </Link>
        <Link
          href="/generator"
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            pathname === '/generator'
              ? 'bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white'
              : 'text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Gerador
        </Link>
        {isEditor && (
          <button
            onClick={onGenerateCaption}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Gerar Legenda
          </button>
        )}
      </nav>

      {/* Editor slide controls */}
      {isEditor && slideCount > 0 && (
        <div className="flex items-center gap-2 ml-2">
          <div className="h-4 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={onPrevSlide}
            className="p-1 rounded text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs"
          >
            ←
          </button>
          <span className="text-xs text-gray-900/60 dark:text-white/60 min-w-[80px] text-center">
            Slide {activeSlide + 1} de {slideCount}
          </span>
          <button
            onClick={onNextSlide}
            className="p-1 rounded text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs"
          >
            →
          </button>
          <div className="h-4 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={onAddSlide}
            className="p-1 rounded text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Adicionar slide"
          >
            <span className="text-sm leading-none">+</span>
          </button>
          <button
            onClick={onDeleteSlide}
            className="p-1 rounded text-gray-900/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Deletar slide"
          >
            <span className="text-sm leading-none">🗑</span>
          </button>
        </div>
      )}

      <div className="flex-1" />

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="p-1.5 rounded-md text-gray-900/50 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        title={theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
      >
        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>
    </header>
  );
}
