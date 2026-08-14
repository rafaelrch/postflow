'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * As abas de /configuracoes.
 *
 * SÃO LINKS, e a aba escolhida está na URL — não em estado de componente. Dois
 * motivos práticos, os dois pedidos: dá para mandar link direto de uma aba
 * (suporte, e-mail) e recarregar não joga a pessoa de volta na primeira.
 * Estado local aqui pareceria funcionar e falharia nos dois.
 */

export const SETTINGS_TABS = [
  { href: '/configuracoes/conta', label: 'Conta' },
  { href: '/configuracoes/assinatura', label: 'Assinatura' },
] as const;

export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções das configurações"
      data-testid="configuracoes-abas"
      className="mt-6 flex items-center gap-2 border-b pb-3"
      style={{ borderColor: 'var(--line)' }}
    >
      {SETTINGS_TABS.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            data-testid={`aba-${label.toLowerCase()}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn('brand-btn sm', isActive ? '' : 'ghost')}
            style={isActive ? undefined : { color: 'var(--ink-dim)' }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
