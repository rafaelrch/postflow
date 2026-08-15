'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * A definição da métrica, atrás de um "?".
 *
 * ── POR QUE NÃO É TOOLTIP DE CSS (hover) ────────────────────────────────────
 * Porque no celular NÃO EXISTE hover: a definição ficaria inalcançável na
 * metade dos jeitos de abrir o painel. E `:hover`/`:focus` puros também não
 * são verificáveis — a checagem visual roda num documento sem foco, onde o
 * navegador nem aplica as pseudoclasses, então um "?" quebrado passaria
 * despercebido. Aqui é estado de React: clique abre, clique fecha, Escape e
 * clique fora fecham. Mesmo comportamento no dedo e no mouse.
 */
export default function MetricHint({ label, hint }: { label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const hintId = useId();

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <span ref={containerRef} className="relative flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? hintId : undefined}
        aria-label={`Definição de ${label}`}
        // SÓ clique. Abrir no hover E alternar no clique se cancelam: o
        // mouseenter abre, o clique que vem logo depois fecha, e o "?" vira um
        // botão que não faz nada. É um disclosure, não um tooltip.
        onClick={() => setOpen((value) => !value)}
        className={`font-mono flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-colors ${
          open
            ? 'border-[var(--ink)] text-[var(--ink)]'
            : 'border-[var(--line-strong)] text-[var(--ink-dim)]'
        }`}
      >
        ?
      </button>

      {open && (
        <span
          role="tooltip"
          id={hintId}
          data-testid="metric-hint"
          className="absolute top-6 right-0 z-20 w-60 rounded-[var(--radius-sm)] border-[1.5px] border-[var(--ink)] bg-[var(--paper)] p-2.5 text-[11px] leading-snug text-[var(--ink-2)] shadow-[var(--sh-1)]"
        >
          {hint}
        </span>
      )}
    </span>
  );
}
