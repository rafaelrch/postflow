'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ElementFont } from '@/types';
import ColorPicker from './ColorPicker';
import ElementFontPicker from './ElementFontPicker';

/**
 * Aba CANTOS — uma só para todos os templates que a têm.
 *
 * Antes cada família tinha a sua: o Editorial/Minimalista traziam o painel
 * legado (`globalSettings.corners`, com "Distância bordas") e os TEMPLATES 1 e
 * 2 um painel próprio por slot (com "Margem"), cada um com ordem e rótulos
 * diferentes. O modelo adotado aqui é o dos TEMPLATES 1 e 2, como pedido — e os
 * estilos legados passam a se adaptar a ele.
 *
 * O componente é PRESENTACIONAL: quem chama traduz o seu modelo de dados
 * (config global de cantos, ou slots do spec) para estas props. É isso que
 * permite uma interface só sobre duas persistências diferentes.
 */

export interface CornerRow {
  /** Chave estável (`topLeft`, `cantos.left`, `header.category`…). */
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Visibilidade INDEPENDENTE deste canto. */
  visible: boolean;
  onToggleVisible: () => void;
  /** Limite de caracteres do spec, quando houver. */
  maxChars?: number;
}

export interface CornersPanelProps {
  /** Liga/desliga os cantos inteiros. */
  show: boolean;
  onToggleShow: () => void;
  rows: CornerRow[];
  fontSize: number;
  onFontSize: (v: number) => void;
  margin: number;
  onMargin: (v: number) => void;
  opacity: number;
  onOpacity: (v: number) => void;
  color: string;
  onColor: (v: string) => void;
  font: ElementFont | undefined;
  defaultFontName: string;
  onFont: (v: ElementFont | undefined) => void;
  /** Limites do slider de tamanho — o spec de cada template manda aqui. */
  fontSizeMin?: number;
  fontSizeMax?: number;
  /** Injetados pelo pai para não duplicar as classes da barra. */
  labelCls: string;
  numericCls: string;
  inputCls: string;
  Toggle: (props: { on: boolean; onToggle: () => void; label: string }) => ReactNode;
  Slider: (props: {
    label: string; value: number; min: number; max: number; unit?: string;
    onChange: (v: number) => void;
  }) => ReactNode;
}

export default function CornersPanel({
  show, onToggleShow, rows,
  fontSize, onFontSize, margin, onMargin, opacity, onOpacity,
  color, onColor, font, defaultFontName, onFont,
  fontSizeMin = 8, fontSizeMax = 64,
  labelCls, numericCls, inputCls, Toggle, Slider,
}: CornersPanelProps) {
  return (
    <>
      <Toggle on={show} onToggle={onToggleShow} label="Exibir cantos" />

      {show && (
        <>
          {rows.map((row) => {
            const over = row.maxChars != null && row.value.length > row.maxChars;
            return (
              <div key={row.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={labelCls}>{row.label}</span>
                  {row.maxChars != null && (
                    <span className={cn(numericCls, over && 'font-semibold text-red-500')}>
                      {row.value.length}/{row.maxChars} car.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Cada canto liga e desliga sozinho. É `checkbox`, não
                      `switch`: o switch é o mestre "Exibir cantos" acima, e
                      dois papéis iguais no mesmo painel viram ambiguidade. */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={row.visible}
                    aria-label={`Exibir ${row.label}`}
                    onClick={row.onToggleVisible}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2',
                      row.visible
                        ? 'border-[var(--ink)] bg-[var(--ink)]'
                        : 'border-[var(--line-strong)]',
                    )}
                  >
                    {row.visible && <span className="text-[9px] font-bold text-[var(--paper)]">✓</span>}
                  </button>
                  <input
                    className={cn(inputCls, 'flex-1', over && 'border-red-500/60')}
                    value={row.value}
                    onChange={(e) => row.onChange(e.target.value)}
                    disabled={!row.visible}
                  />
                </div>
              </div>
            );
          })}

          <div className="space-y-3 border-t border-[var(--line)] pt-3">
            <Slider
              label="Tamanho fonte"
              value={fontSize}
              min={fontSizeMin}
              max={fontSizeMax}
              unit="px"
              onChange={onFontSize}
            />
            <Slider label="Margem" value={margin} min={0} max={150} unit="px" onChange={onMargin} />
            <Slider label="Opacidade" value={opacity} min={0} max={100} unit="%" onChange={onOpacity} />
            <ColorPicker label="Cor" value={color} onChange={onColor} />
            <div>
              <span className={cn(labelCls, 'mb-1 block')}>Fonte</span>
              <ElementFontPicker value={font} defaultFontName={defaultFontName} onChange={onFont} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
