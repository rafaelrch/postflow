'use client';

import { ReactNode, useState } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { panelLabelCls } from './tokens';

/**
 * Uma linha de painel da barra lateral: ícone, rótulo, chevron, em card.
 *
 * Substitui o `Section` antigo, que era só um título e um triângulo. As
 * diferenças que importam:
 *
 * - **ícone obrigatório** — o usuário passa a achar o painel pela forma antes
 *   de ler o rótulo, que é como ele acha no MyPostFlow;
 * - **`disabled` exige `disabledReason`** — o botão de restaurar ficava cinza
 *   sem dizer por quê, e o usuário não tinha como saber que "cinza" queria
 *   dizer "este slide ainda segue o template";
 * - **estado aberto/fechado continua local**, então quem renderiza PRECISA
 *   passar `key` estável (o id do painel, nunca o índice): sem isso, ao trocar
 *   a composição do grupo o React reaproveita o componente pela posição e o
 *   aberto/fechado migra de um painel para outro.
 */
export default function SidebarPanel({
  id,
  icon: Icon,
  label,
  badge,
  defaultOpen = false,
  disabled = false,
  disabledReason,
  children,
}: {
  /** Identidade do painel. Use o mesmo valor no `key` do elemento. */
  id: string;
  icon: LucideIcon;
  label: string;
  /** Sinal curto à direita do rótulo — "3 alterações". */
  badge?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  /** Obrigatório quando `disabled`: vira o tooltip que explica o cinza. */
  disabledReason?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = open && !disabled;

  return (
    <div
      data-panel={id}
      className={cn(
        'mx-3 mb-1.5 rounded-xl border transition-colors',
        isOpen
          ? 'border-black/[0.09] dark:border-white/[0.09] bg-[var(--surface-elevated)]'
          : 'border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.14] dark:hover:border-white/[0.14]',
        disabled && 'opacity-40'
      )}
    >
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-expanded={isOpen}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        <Icon className="w-4 h-4 shrink-0 text-gray-900/45 dark:text-white/40" />
        <span className={cn(panelLabelCls, 'flex-1 truncate')}>{label}</span>
        {badge && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-blue-500/12 text-blue-500 text-[10px] font-semibold tabular-nums">
            {badge}
          </span>
        )}
        <ChevronRight
          className={cn(
            'w-4 h-4 shrink-0 text-gray-900/25 dark:text-white/25 transition-transform',
            isOpen && 'rotate-90'
          )}
        />
      </button>

      {isOpen && <div className="px-3 pb-3 pt-0.5 flex flex-col gap-3">{children}</div>}
    </div>
  );
}
