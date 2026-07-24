'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, RectangleVertical, Square, Smartphone } from 'lucide-react';
import { FORMAT_LIST, getFormat } from '@/lib/formats';
import type { SlideFormat } from '@/types';

interface FormatDropdownProps {
  value?: SlideFormat;
  onChange: (format: SlideFormat) => void;
}

// Ícone que melhor representa a forma de cada formato — mapeado aqui, sem
// acoplar ícone ao módulo de dados (lib/formats.ts).
const FORMAT_ICON: Record<SlideFormat, React.ComponentType<{ className?: string }>> = {
  '4:5': RectangleVertical,
  '1:1': Square,
  '9:16': Smartphone,
};

/**
 * Dropdown de formato no estilo neo-brutalista do Creatools (tokens --paper /
 * --ink / --line / --sh-1). Substitui o <select> nativo. Só o visual muda — a
 * troca de formato continua via setFormat/FORMAT_LIST.
 */
export default function FormatDropdown({ value, onChange }: FormatDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const active = getFormat(value);
  const ActiveIcon = FORMAT_ICON[active.id];

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Escape fecha e devolve o foco ao botão.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const select = (f: SlideFormat) => {
    onChange(f);
    setOpen(false);
    btnRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Formato do carrossel"
        className="flex items-center gap-1.5 text-xs font-semibold rounded-[10px] px-2.5 py-1 transition-[box-shadow,transform] active:translate-x-[1px] active:translate-y-[1px]"
        style={{
          background: 'var(--paper)',
          color: 'var(--ink)',
          border: `1.5px solid ${open ? 'var(--ink)' : 'var(--line-strong)'}`,
          boxShadow: open ? 'var(--sh-1)' : 'none',
        }}
      >
        <ActiveIcon className="w-3.5 h-3.5" />
        <span>{active.menuLabel}</span>
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none', color: 'var(--ink-dim)' }}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Formato do carrossel"
          className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] p-1 rounded-[10px] overflow-hidden"
          style={{
            background: 'var(--paper)',
            border: '1.5px solid var(--ink)',
            boxShadow: 'var(--sh-1)',
          }}
        >
          {FORMAT_LIST.map((f) => {
            const selected = f.id === active.id;
            const Icon = FORMAT_ICON[f.id];
            return (
              <li key={f.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => select(f.id)}
                  className="w-full flex items-center gap-2.5 text-left text-xs font-medium rounded-[7px] px-2.5 py-2 transition-colors"
                  style={{
                    background: selected ? 'var(--ink)' : 'transparent',
                    color: selected ? 'var(--paper)' : 'var(--ink)',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.background = 'var(--paper-3)';
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{f.menuLabel}</span>
                  {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
