'use client';

import { useTheme } from '@/components/ThemeProvider';

/** Mesmo contrato de tema do resto do produto (classe `dark` + localStorage). */
export default function AdminThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
      className="brand-btn sm outline font-mono"
      data-testid="admin-tema"
    >
      {theme === 'dark' ? 'CLARO' : 'ESCURO'}
    </button>
  );
}
