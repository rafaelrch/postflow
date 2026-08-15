'use client';

import { useTheme } from '@/components/ThemeProvider';
import { Moon, Sun } from 'lucide-react';

/** Mesmo contrato de tema do resto do produto (classe `dark` + localStorage). */
export default function AdminThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
      className="admin-theme-toggle"
      data-testid="admin-tema"
    >
      {theme === 'dark' ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
      <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
    </button>
  );
}
