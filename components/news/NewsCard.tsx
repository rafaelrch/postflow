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
  // Gradient overlay
  gradient_opacity: number;  // 0–100
  gradient_color: string;    // hex color
  gradient_size: number;     // 0–100, how far gradient extends upward (%)
  gradient_distance: number; // 0–100, where the transparent part starts (%)
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
  gradient_opacity: 97,
  gradient_color: '#000000',
  gradient_size: 85,
  gradient_distance: 55,
};

export function parseNewsJSON(raw: string): NewsCardItem[] {
  function buildItems(parsed: unknown): NewsCardItem[] {
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

  // Strip UTF-8 BOM
  let s = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;

  // Strip markdown code fences
  s = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  // Fast path: try direct parse first
  try { return buildItems(JSON.parse(s)); } catch (_) { /* fall through */ }

  // Slow path: state-machine sanitizer
  // Walks the raw text character-by-character and:
  //   - inside strings: escapes any literal control chars (newline, tab, etc.)
  //   - outside strings: removes null bytes and other stray control chars
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    if (esc) { out += c; esc = false; continue; }
    if (inStr && c === '\\') { out += c; esc = true; continue; }
    if (c === '"') { out += c; inStr = !inStr; continue; }
    if (inStr) {
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
      if (code < 0x20) { out += `\\u${code.toString(16).padStart(4, '0')}`; continue; }
    } else {
      // Outside strings: drop null bytes and non-whitespace control chars
      if (code === 0 || (code < 0x20 && c !== '\n' && c !== '\r' && c !== '\t')) continue;
    }
    out += c;
  }

  return buildItems(JSON.parse(out));
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
        {(() => {
          const hex = item.gradient_color || '#000000';
          const h = hex.replace('#', '');
          const r = parseInt(h.substring(0, 2), 16);
          const g = parseInt(h.substring(2, 4), 16);
          const b = parseInt(h.substring(4, 6), 16);
          const rgb = `${r},${g},${b}`;
          const op = (item.gradient_opacity ?? 97) / 100;
          const sz = item.gradient_size ?? 85;       // where gradient fades to transparent
          const dist = item.gradient_distance ?? 55; // where it starts fading
          return (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(
                  to top,
                  rgba(${rgb},${op}) 0%,
                  rgba(${rgb},${Math.min(op * 0.96, 1)}) ${Math.round(dist * 0.22)}%,
                  rgba(${rgb},${Math.min(op * 0.85, 1)}) ${Math.round(dist * 0.45)}%,
                  rgba(${rgb},${op * 0.57}) ${Math.round(dist * 0.73)}%,
                  rgba(${rgb},${op * 0.26}) ${dist}%,
                  rgba(${rgb},${op * 0.05}) ${Math.round((dist + sz) / 2)}%,
                  transparent ${sz}%
                )`,
              }}
            />
          );
        })()}

        {/* Logo — use explicit dimensions instead of transform:scale to ensure
            html2canvas captures it at the correct size */}
        <div style={{ position: 'absolute', top: item.logo_y, left: 52 }}>
          <img
            src="/theArkeNews-logo.png"
            alt="the arke news"
            style={{ display: 'block', height: Math.round(46 * item.logo_size), width: 'auto', objectFit: 'contain' }}
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
