import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface NewsCardItem {
  numero: number;
  tema: string;
  titulo_card: string;
  imagem_url: string;
  legenda: string;
  // Text style
  titulo_size: number;
  titulo_weight: number;
  titulo_letter_spacing: number;
  tema_size: number;
  // Layout
  card_radius: number;
  logo_y: number;          // top offset for logo (px at 1080 scale)
  logo_size: number;       // scale multiplier for logo
  text_y: number;          // bottom offset for text block (px at 1080 scale)
  // Background image controls
  image_scale: number;     // zoom: 1 = 100% width, 2 = 200% width, etc.
  image_x: number;         // horizontal offset from center (px)
  image_y: number;         // vertical offset from top (px)
  localImageUrl?: string;
}

export const DEFAULT_STYLE: Omit<NewsCardItem, 'numero' | 'tema' | 'titulo_card' | 'imagem_url' | 'legenda'> = {
  titulo_size: 61,
  titulo_weight: 700,
  titulo_letter_spacing: -0.5,
  tema_size: 35,
  card_radius: 8,
  logo_y: 60,
  logo_size: 4.0,
  text_y: 188,
  image_scale: 1,
  image_x: 0,
  image_y: 0,
};

export function parseNewsJSON(raw: string): NewsCardItem[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('JSON deve ser um array');
  return parsed.map((item: Record<string, unknown>, i: number) => ({
    numero: (item.numero as number) ?? i + 1,
    tema: String(item.tema ?? ''),
    titulo_card: String(item.titulo_card ?? ''),
    imagem_url: String(item.imagem_url ?? ''),
    legenda: String(item.legenda ?? ''),
    ...DEFAULT_STYLE,
  }));
}

// ── Arke News Logo (default) ────────────────────────────────────────────────

// ── News Card ───────────────────────────────────────────────────────────────

const W = 1080;
const H = 1350;

interface NewsCardProps {
  item: NewsCardItem;
  /** Scale for preview. 1 = full 1080×1350. */
  scale?: number;
  /** Override image URL (e.g. proxied version for html2canvas) */
  imageOverride?: string;
}

const NewsCard = React.forwardRef<HTMLDivElement, NewsCardProps>(
  ({ item, scale = 1, imageOverride }, ref) => {
    const imageUrl = imageOverride ?? item.localImageUrl ?? item.imagem_url;

    return (
      <div
        ref={ref}
        style={{
          position: 'relative',
          width: W,
          height: H,
          overflow: 'hidden',
          background: '#0A0A0A',
          borderRadius: item.card_radius,
          flexShrink: 0,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
        }}
      >
        {/* Background image */}
        {imageUrl ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: item.image_scale === 1 ? 'cover' : `${item.image_scale * 100}%`,
              backgroundPosition: `calc(50% + ${item.image_x}px) calc(0% + ${item.image_y}px)`,
              backgroundRepeat: 'no-repeat',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            }}
          />
        )}

        {/* Dark gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(
              to top,
              rgba(0,0,0,0.97) 0%,
              rgba(0,0,0,0.93) 12%,
              rgba(0,0,0,0.82) 25%,
              rgba(0,0,0,0.55) 40%,
              rgba(0,0,0,0.25) 55%,
              rgba(0,0,0,0.05) 70%,
              transparent 85%
            )`,
          }}
        />

        {/* Logo */}
        <div
          style={{
            position: 'absolute',
            top: item.logo_y,
            left: 52,
            transformOrigin: 'top left',
            transform: `scale(${item.logo_size})`,
          }}
        >
          <img
            src="/theArkeNews-logo.png"
            alt="the arke news"
            style={{ display: 'block', height: 46, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Bottom text block */}
        <div
          style={{
            position: 'absolute',
            bottom: item.text_y,
            left: 52,
            right: 52,
          }}
        >
          {item.tema && (
            <p
              style={{
                margin: 0,
                marginBottom: 12,
                color: 'white',
                fontFamily: "'IvyOra Text', Georgia, 'Times New Roman', serif",
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: item.tema_size,
                lineHeight: 1.2,
                opacity: 0.9,
              }}
            >
              {item.tema}
            </p>
          )}

          <p
            style={{
              margin: 0,
              color: 'white',
              fontFamily: "'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif",
              fontWeight: item.titulo_weight,
              fontSize: item.titulo_size,
              lineHeight: 1.1,
              letterSpacing: `${item.titulo_letter_spacing}px`,
            }}
          >
            {item.titulo_card}
          </p>
        </div>
      </div>
    );
  }
);

NewsCard.displayName = 'NewsCard';
export default NewsCard;
