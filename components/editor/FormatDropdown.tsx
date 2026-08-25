'use client';

import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  ChevronDownIcon,
  RectangleVerticalIcon,
  SmartphoneIcon,
  SquareIcon,
  Tick01Icon,
} from '@hugeicons/core-free-icons';
import { FORMAT_LIST, getFormat } from '@/lib/formats';
import type { SlideFormat } from '@/types';

interface FormatDropdownProps {
  value?: SlideFormat;
  onChange: (format: SlideFormat) => void;
}

// Ícone que melhor representa a forma de cada formato — mapeado aqui, sem
// acoplar ícone ao módulo de dados (lib/formats.ts).
const FORMAT_ICON: Record<SlideFormat, IconSvgElement> = {
  '4:5': RectangleVerticalIcon,
  '1:1': SquareIcon,
  '9:16': SmartphoneIcon,
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
        // Caixa do desenho: 175 × 40, branca, borda fina, raio 10. O rótulo fica
        // à esquerda e o chevron encostado na direita.
        className="w-[175px] h-[40px] flex items-center gap-2.5 text-[14px] rounded-[10px] pl-[21px] pr-3 transition-[box-shadow,transform] active:translate-x-[1px] active:translate-y-[1px]"
        style={{
          background: 'var(--studio-surface)',
          color: 'var(--ink)',
          border: `1px solid ${open ? 'var(--ink)' : 'var(--studio-line)'}`,
          boxShadow: open ? 'var(--sh-1)' : 'none',
        }}
      >
        <HugeiconsIcon icon={ActiveIcon} size={18} strokeWidth={1.75} aria-hidden />
        {/* Só o NOME no gatilho ("Carrossel"), como no desenho: a proporção
            passou a viver na barra de status, em "1080 × 1350px". Na lista
            aberta o `menuLabel` completo continua — lá ela desempata. */}
        <span className="flex-1 text-left truncate">{active.menuLabel.replace(/\s*\(.*\)$/, '')}</span>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 transition-transform duration-150 motion-reduce:transition-none"
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
                  <HugeiconsIcon icon={Icon} size={16} strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{f.menuLabel}</span>
                  {selected && <HugeiconsIcon icon={Tick01Icon} size={14} strokeWidth={1.75} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
