'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import NewsCard, { NewsCardItem } from '@/components/news/NewsCard';
import { NEWS_CARD_H, NEWS_CARD_W } from '@/components/news/NewsCardStrip';

/**
 * Palco do card principal: as setas nas LATERAIS e o card escalado para caber.
 *
 * Antes o preview usava uma escala fixa (`PREVIEW_SCALE = 0.38`, ou seja
 * 410x513 px) numa coluna com `overflow-y-auto`. Em janela baixa o card não
 * cabia e a coluna do meio ganhava barra de rolagem — o Rafael pediu que isso
 * nunca aconteça. Aqui a escala vem da MEDIÇÃO da área disponível, então o card
 * encolhe junto com a janela em vez de transbordar.
 *
 * O contador "Card 1 de 10" que ficava acima do card saiu: a informação já
 * aparece em dois outros lugares da tela (a tira do rodapé, numerada e com a
 * ativa destacada, e o cabeçalho "Editar — Card N" do painel da direita).
 */

/** Maior escala que faz o card caber inteiro na caixa, preservando a proporção. */
export function fitScale(
  boxW: number,
  boxH: number,
  cardW: number = NEWS_CARD_W,
  cardH: number = NEWS_CARD_H,
): number {
  if (boxW <= 0 || boxH <= 0) return 0;
  return Math.min(boxW / cardW, boxH / cardH);
}

export interface NewsCardStageProps {
  item: NewsCardItem;
  selectedIdx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function NewsCardStage({
  item,
  selectedIdx,
  total,
  onPrev,
  onNext,
}: NewsCardStageProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const medir = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    const s = fitScale(el.clientWidth, el.clientHeight);
    setScale((antes) => (Math.abs(antes - s) < 0.0005 ? antes : s));
  }, []);

  // Dependência estável e observer criado UMA vez: efeito sem array de
  // dependências recria o ResizeObserver a cada render e vira loop de medição.
  useEffect(() => {
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    if (areaRef.current) ro.observe(areaRef.current);
    return () => ro.disconnect();
  }, [medir]);

  const temAnterior = selectedIdx > 0;
  const temProximo = selectedIdx < total - 1;

  const seta =
    'shrink-0 p-2 rounded-full border border-black/10 dark:border-white/10 bg-[var(--background)] ' +
    'hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed transition-colors';

  return (
    // `min-h-0` é o que permite o flex encolher abaixo do conteúdo — sem ele a
    // área nunca fica menor que o card e a rolagem volta.
    <div className="flex-1 min-h-0 flex items-center justify-center gap-3 px-3 py-4">
      <button
        type="button"
        onClick={onPrev}
        disabled={!temAnterior}
        aria-label="Card anterior"
        className={seta}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} aria-hidden className="text-gray-900 dark:text-white" />
      </button>

      <div ref={areaRef} className="flex-1 min-w-0 h-full flex items-center justify-center">
        {scale > 0 && (
          <div
            data-testid="news-card-preview"
            style={{
              width: NEWS_CARD_W * scale,
              height: NEWS_CARD_H * scale,
              overflow: 'hidden',
              borderRadius: 12,
              border: '1px solid rgba(128,128,128,0.15)',
              flexShrink: 0,
              boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <NewsCard item={item} scale={1} />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!temProximo}
        aria-label="Próximo card"
        className={seta}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.75} aria-hidden className="text-gray-900 dark:text-white" />
      </button>
    </div>
  );
}
