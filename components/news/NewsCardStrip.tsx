'use client';

import NewsCard, { NewsCardItem } from '@/components/news/NewsCard';

/**
 * Tira horizontal de miniaturas, no rodapé do card principal.
 *
 * Antes esta lista era uma COLUNA na barra da esquerda, e as miniaturas saíam
 * achatadas. A causa não era o cálculo do tamanho — era o flexbox: os botões
 * tinham `width`/`height` explícitos, mas dentro de um `flex flex-col` os itens
 * nascem com `flex-shrink: 1`. Dez miniaturas de 243 px numa coluna de ~600 px
 * eram comprimidas no eixo vertical e esticadas até a largura do container,
 * enquanto o `NewsCard` lá dentro (um `transform: scale`) não encolhia junto.
 * Resultado: caixa larga e baixa com o card vazando.
 *
 * Aqui a proporção é estrutural, não calculada: `aspectRatio` fixa a forma,
 * `flexShrink: 0` impede o flex de amassar, e o card de verdade é renderizado
 * em escala reduzida — fiel por construção, como nos previews do wizard.
 */

export const NEWS_CARD_W = 1080;
export const NEWS_CARD_H = 1350;
/** Proporção real do card, como o CSS a entende. */
export const NEWS_CARD_ASPECT = `${NEWS_CARD_W} / ${NEWS_CARD_H}`;

export interface NewsCardStripProps {
  items: NewsCardItem[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  /** Largura de cada miniatura em px; a altura sai da proporção. */
  thumbWidth?: number;
}

export default function NewsCardStrip({
  items,
  selectedIdx,
  onSelect,
  thumbWidth = 76,
}: NewsCardStripProps) {
  const scale = thumbWidth / NEWS_CARD_W;

  return (
    <div
      data-testid="news-card-strip"
      role="tablist"
      aria-label="Cards"
      // Rola na horizontal quando houver muitos cards, sem empurrar o layout:
      // `min-w-0` é o que impede o flex pai de crescer com o conteúdo.
      className="shrink-0 w-full min-w-0 overflow-x-auto overflow-y-hidden border-t border-black/[0.06] dark:border-white/[0.06] bg-[var(--background)]"
    >
      <div className="flex items-center gap-2 px-4 py-3 w-max">
        {items.map((item, idx) => {
          const ativo = idx === selectedIdx;
          return (
            <button
              key={item.numero}
              role="tab"
              aria-selected={ativo}
              aria-label={`Card ${item.numero}`}
              onClick={() => onSelect(idx)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                ativo
                  ? 'border-gray-900 dark:border-white shadow-md'
                  : 'border-transparent hover:border-black/20 dark:hover:border-white/20'
              }`}
              style={{
                width: thumbWidth,
                aspectRatio: NEWS_CARD_ASPECT,
                // Sem isto o flex volta a amassar a miniatura — foi o defeito.
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: NEWS_CARD_W * scale,
                  height: NEWS_CARD_H * scale,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                  <NewsCard item={item} scale={1} />
                </div>
              </div>

              <span className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                {item.numero}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
