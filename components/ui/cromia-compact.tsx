'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

export interface HSV {
  h: number;
  s: number;
  v: number;
}

export interface CromiaCompactProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Defaults usados pelo exemplo Cromia quando a cor recebida não é HEX. */
export const DEFAULT_HSV: HSV = { h: 258, s: 64, v: 96 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizedHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** Converte HSV (h 0–360, s/v 0–100) em HEX RGB maiúsculo. */
export function hsvToHex(hue: number, saturation: number, brightness: number): string {
  const h = normalizedHue(Number.isFinite(hue) ? hue : DEFAULT_HSV.h);
  const s = clamp(Number.isFinite(saturation) ? saturation : DEFAULT_HSV.s, 0, 100) / 100;
  const v = clamp(Number.isFinite(brightness) ? brightness : DEFAULT_HSV.v, 0, 100) / 100;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = v - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (h < 60) [red, green, blue] = [chroma, x, 0];
  else if (h < 120) [red, green, blue] = [x, chroma, 0];
  else if (h < 180) [red, green, blue] = [0, chroma, x];
  else if (h < 240) [red, green, blue] = [0, x, chroma];
  else if (h < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function colorStringToHex(value: string): string | null {
  const raw = value.trim();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3
      ? hex[1].split('').map((digit) => digit + digit).join('')
      : hex[1];
    return `#${digits.toUpperCase()}`;
  }

  // O picker antigo recebia rgba() em alguns defaults de sombra/texto. A
  // adaptação mantém essa entrada visível no espectro, descartando apenas a
  // transparência porque a API existente propaga uma cor HEX opaca.
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map((channel) => clamp(Number(channel), 0, 255));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function normalizeHex(value: string): string {
  return colorStringToHex(value) ?? hsvToHex(DEFAULT_HSV.h, DEFAULT_HSV.s, DEFAULT_HSV.v);
}

/** Converte HEX (3/6 dígitos, RGB e RGBA simples) em HSV arredondado. */
export function hexToHsv(value: string): HSV {
  const hex = colorStringToHex(value) ?? hsvToHex(DEFAULT_HSV.h, DEFAULT_HSV.s, DEFAULT_HSV.v);
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }

  return {
    h: Math.round(normalizedHue(h)),
    s: Math.round(max === 0 ? 0 : (delta / max) * 100),
    v: Math.round(max * 100),
  };
}

function hueStyle(hue: number): CSSProperties {
  return {
    backgroundColor: `hsl(${normalizedHue(hue)} 100% 50%)`,
    backgroundImage: 'linear-gradient(to right, #fff 0%, transparent 100%), linear-gradient(to top, #000 0%, transparent 100%)',
  };
}

function pointInElement(element: HTMLDivElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  const width = rect.width || element.clientWidth;
  const height = rect.height || element.clientHeight;
  if (!width || !height) return null;
  return {
    x: clamp((clientX - rect.left) / width, 0, 1),
    y: clamp((clientY - rect.top) / height, 0, 1),
  };
}

export default function CromiaCompact({ label, value, onChange, className }: CromiaCompactProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(() => normalizeHex(value));
  const [dragging, setDragging] = useState<'sv' | 'hue' | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHsv(hexToHsv(value));
    setHexDraft(normalizeHex(value));
  }, [value]);

  // Fecha o espectro ao clicar fora ou apertar Escape (só quando aberto).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const emitHSV = (next: HSV) => {
    const safe: HSV = {
      h: clamp(next.h, 0, 360),
      s: clamp(next.s, 0, 100),
      v: clamp(next.v, 0, 100),
    };
    const nextHex = hsvToHex(safe.h, safe.s, safe.v);
    setHsv(safe);
    setHexDraft(nextHex);
    onChange(nextHex);
  };

  const updateSVFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointInElement(event.currentTarget, event.clientX, event.clientY);
    if (point) emitHSV({ ...hsv, s: point.x * 100, v: (1 - point.y) * 100 });
  };

  const updateHueFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointInElement(event.currentTarget, event.clientX, event.clientY);
    if (point) emitHSV({ ...hsv, h: point.x * 360 });
  };

  const handleSVPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging('sv');
    updateSVFromPointer(event);
  };

  const handleHuePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging('hue');
    updateHueFromPointer(event);
  };

  const handleSVKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    let next = hsv;
    if (event.key === 'ArrowRight') next = { ...hsv, s: hsv.s + step };
    else if (event.key === 'ArrowLeft') next = { ...hsv, s: hsv.s - step };
    else if (event.key === 'ArrowUp') next = { ...hsv, v: hsv.v + step };
    else if (event.key === 'ArrowDown') next = { ...hsv, v: hsv.v - step };
    else return;
    event.preventDefault();
    emitHSV(next);
  };

  const handleHueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    let nextHue = hsv.h;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextHue += step;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextHue -= step;
    else if (event.key === 'Home') nextHue = 0;
    else if (event.key === 'End') nextHue = 360;
    else return;
    event.preventDefault();
    emitHSV({ ...hsv, h: clamp(nextHue, 0, 360) });
  };

  const handleHexChange = (raw: string) => {
    setHexDraft(raw);
    const parsed = colorStringToHex(raw);
    if (!parsed) return;
    setHsv(hexToHsv(parsed));
    setHexDraft(parsed);
    onChange(parsed);
  };

  const handleHexBlur = () => {
    const parsed = colorStringToHex(hexDraft);
    const nextHex = parsed ?? hsvToHex(hsv.h, hsv.s, hsv.v);
    setHexDraft(nextHex);
    if (parsed) onChange(parsed);
  };

  const svThumbStyle: CSSProperties = {
    left: `${hsv.s}%`,
    top: `${100 - hsv.v}%`,
    backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v),
  };
  const hueThumbStyle: CSSProperties = { left: `${(hsv.h / 360) * 100}%` };
  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <div ref={rootRef} className={cn('w-full max-w-[250px]', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `Abrir seletor de cor ${label}` : 'Abrir seletor de cor'}
        className="flex w-full items-center gap-2 rounded-xl border border-black/10 bg-white px-2 py-1.5 text-[var(--ink)] shadow-sm outline-none transition-colors hover:border-black/20 focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/10 dark:bg-[var(--paper)] dark:hover:border-white/20 dark:focus-visible:ring-white/30"
      >
        {label && <span className="shrink-0 text-[11px] font-medium text-[var(--ink-dim)]">{label}</span>}
        <span
          aria-hidden="true"
          data-testid="cromia-swatch"
          className="h-7 w-7 shrink-0 rounded-lg border border-black/10 shadow-inner dark:border-white/10"
          style={{ backgroundColor: currentHex }}
        />
        <span className="truncate font-mono text-[11px] uppercase text-[var(--ink-dim)]">{currentHex}</span>
        <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--ink-dim)]" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 rounded-2xl border border-black/10 bg-white p-3 text-[var(--ink)] shadow-[0_12px_30px_-18px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[var(--paper)]">
          <div
            ref={svRef}
            role="slider"
            tabIndex={0}
            aria-label="Saturação e brilho"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.s)}
            aria-valuetext={`Saturação ${Math.round(hsv.s)}%, brilho ${Math.round(hsv.v)}%`}
            className="relative aspect-square w-full cursor-crosshair touch-none overflow-hidden rounded-xl border border-black/10 outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:border-white/10 dark:focus-visible:ring-white/40"
            style={hueStyle(hsv.h)}
            onPointerDown={handleSVPointerDown}
            onPointerMove={(event) => { if (dragging === 'sv') updateSVFromPointer(event); }}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
            onKeyDown={handleSVKeyDown}
          >
            <span
              aria-hidden="true"
              data-testid="cromia-sv-thumb"
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_5px_rgba(0,0,0,0.45)] ring-1 ring-black/20"
              style={svThumbStyle}
            />
          </div>

          <div
            ref={hueRef}
            role="slider"
            tabIndex={0}
            aria-label="Matiz (hue)"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(hsv.h)}
            className="relative mt-3 h-3 cursor-pointer touch-none rounded-full border border-black/10 outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:border-white/10 dark:focus-visible:ring-white/40"
            style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 16.6%, #00ff00 33.3%, #00ffff 50%, #0000ff 66.6%, #ff00ff 83.3%, #ff0000 100%)' }}
            onPointerDown={handleHuePointerDown}
            onPointerMove={(event) => { if (dragging === 'hue') updateHueFromPointer(event); }}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
            onKeyDown={handleHueKeyDown}
          >
            <span
              aria-hidden="true"
              data-testid="cromia-hue-thumb"
              className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_1px_5px_rgba(0,0,0,0.45)] ring-1 ring-black/25"
              style={hueThumbStyle}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span
              aria-hidden="true"
              data-testid="cromia-color-swatch"
              className="h-8 w-8 shrink-0 rounded-lg border border-black/10 shadow-inner dark:border-white/10"
              style={{ backgroundColor: currentHex }}
            />
            <input
              aria-label={label ? `${label} HEX` : 'Cor HEX'}
              type="text"
              value={hexDraft}
              onChange={(event) => handleHexChange(event.target.value)}
              onBlur={handleHexBlur}
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 font-mono text-[11px] uppercase text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-dim)] focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:focus:border-white/30 dark:focus:ring-white/10"
              placeholder="#000000"
              inputMode="text"
              autoCapitalize="characters"
              maxLength={7}
            />
          </div>
        </div>
      )}
    </div>
  );
}
