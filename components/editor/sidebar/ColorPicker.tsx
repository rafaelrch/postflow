'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { labelCls } from './tokens';

interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

/**
 * Swatch nativo + campo hex.
 *
 * O hex é estado local porque o usuário digita caractere a caractere: só
 * propaga quando vira uma cor válida, senão o slide piscaria a cada tecla.
 */
export default function ColorPicker({ label, value, onChange, className }: ColorPickerProps) {
  const [hex, setHex] = useState(value);
  useEffect(() => { setHex(value); }, [value]);

  const handleHex = (raw: string) => {
    setHex(raw);
    if (/^#[0-9A-Fa-f]{6}$/.test(raw)) onChange(raw);
  };

  const validHex = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : value;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && <span className={cn(labelCls, 'shrink-0')}>{label}</span>}
      <label className="relative shrink-0 cursor-pointer group">
        <span
          className="block w-7 h-7 rounded-lg border border-[var(--line-strong)] shadow-sm group-hover:scale-105 transition-transform"
          style={{ background: validHex }}
        />
        <input
          type="color"
          value={validHex}
          onChange={(e) => { onChange(e.target.value); setHex(e.target.value); }}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>
      <input
        type="text"
        value={hex}
        onChange={(e) => handleHex(e.target.value)}
        className="w-[82px] px-2 py-1.5 rounded-lg bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] text-[11px] font-mono focus:outline-none focus:border-black/20 dark:focus:border-white/20 transition-colors"
        placeholder="#000000"
        maxLength={7}
      />
    </div>
  );
}
