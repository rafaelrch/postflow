'use client';

import React from 'react';
import { Slide, GlobalSettings, ContentLayout, TextHighlight, ElementFont } from '@/types';
import { getFontFamilies, getElementFontCSS } from '@/lib/utils';

export interface EditorialSlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SLIDE_W = 1080;
const SLIDE_H = 1350;
const PAD_X = 56;           // horizontal padding for content
const META_TOP = 36;        // top offset for metadata bar
const META_FONTSIZE = 21;   // metadata bar font size
const META_H = 60;          // total vertical footprint of meta bar area

// Cover layout — text group default top (~58% down)
const COVER_TEXT_DEFAULT_TOP = Math.round(SLIDE_H * 0.58); // ~783
const COVER_BADGE_BOTTOM = 180; // distance from bottom for badge

// Content layouts — zone boundaries (absolute pixels from slide top)
const CONTENT_TOP = META_TOP + META_H; // ~96

// text-image-text
const TIT_TOP = CONTENT_TOP;       // 96
const IMG_TIT_GAP = 44;
const IMG_HEIGHT = 430;
const IMG_BOTTOM_GAP = 40;

// text-text-image
const TTI_IMG_HEIGHT = 500;

// image-text-text
const ITT_IMG_HEIGHT = 490;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function isLightColor(hex: string): boolean {
  try { return hexLuminance(hex) > 0.4; } catch { return false; }
}

interface IndexedHighlight extends TextHighlight { wordIdx?: number }

function renderTextWithHighlights(
  text: string,
  highlights: TextHighlight[],
  fallbackWord: string,
  fallbackColor: string,
  style: React.CSSProperties,
): React.ReactNode {
  const effective = (highlights.length > 0
    ? highlights
    : (fallbackWord ? [{ text: fallbackWord, color: fallbackColor }] : [])) as IndexedHighlight[];

  if (effective.length === 0 || !text) return <span style={style}>{text}</span>;

  interface Token { raw: string; isWord: boolean }
  const tokens: Token[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const wm = remaining.match(/^\S+/);
    if (wm) { tokens.push({ raw: wm[0], isWord: true }); remaining = remaining.slice(wm[0].length); continue; }
    const sm = remaining.match(/^\s+/);
    if (sm) { tokens.push({ raw: sm[0], isWord: false }); remaining = remaining.slice(sm[0].length); continue; }
    tokens.push({ raw: remaining[0], isWord: false }); remaining = remaining.slice(1);
  }

  const seen: Record<string, number> = {};
  const wordOccurrences: number[] = tokens.map((t) => {
    if (!t.isWord) return -1;
    const lc = t.raw.toLowerCase();
    const occ = seen[lc] ?? 0;
    seen[lc] = occ + 1;
    return occ;
  });

  const getHl = (word: string, occIdx: number): IndexedHighlight | undefined =>
    effective.find((h) => h.text.toLowerCase() === word.toLowerCase() && h.wordIdx === occIdx)
    ?? effective.find((h) => h.text.toLowerCase() === word.toLowerCase() && h.wordIdx === undefined);

  return (
    <span style={style}>
      {tokens.map((token, i) => {
        if (!token.isWord) return token.raw;
        const hl = getHl(token.raw, wordOccurrences[i]);
        if (!hl) return token.raw;
        const hlFontCSS = hl.font ? getElementFontCSS(hl.font as ElementFont) : null;
        return (
          <span key={i} style={{
            color: hl.color,
            textDecoration: hl.underline ? 'underline' : undefined,
            ...(hlFontCSS ? { fontFamily: hlFontCSS.fontFamily, fontWeight: hlFontCSS.fontWeight, fontStyle: hlFontCSS.fontStyle } : {}),
          }}>{token.raw}</span>
        );
      })}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetaBar sub-component
// ─────────────────────────────────────────────────────────────────────────────
function MetaBar({
  metaBar,
  textColor,
  fontFamily,
}: {
  metaBar: GlobalSettings['metaBar'];
  textColor: string;
  fontFamily: string;
}) {
  if (!metaBar?.show) return null;
  const style: React.CSSProperties = {
    position: 'absolute',
    top: META_TOP,
    left: PAD_X,
    right: PAD_X,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: META_FONTSIZE,
    fontFamily,
    fontWeight: 400,
    color: textColor,
    zIndex: 10,
    letterSpacing: '-0.01em',
  };
  return (
    <div style={style}>
      <span>{metaBar.left}</span>
      <span>{metaBar.center}</span>
      <span>{metaBar.right}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Corners sub-component
// ─────────────────────────────────────────────────────────────────────────────
function Corners({
  corners,
  bgIsLight,
  fontBody,
}: {
  corners: GlobalSettings['corners'];
  bgIsLight: boolean;
  fontBody: string;
}) {
  if (!corners.show) return null;

  const cornerFontCSS = corners.elementFont
    ? getElementFontCSS(corners.elementFont)
    : { fontFamily: fontBody, fontWeight: 400, fontStyle: 'normal' as const };

  const cornerTextColor = corners.color
    || (bgIsLight ? `rgba(0,0,0,${corners.opacity / 100})` : `rgba(255,255,255,${corners.opacity / 100})`);

  const cornerStyle = (): React.CSSProperties => ({
    fontSize: `${corners.fontSize}px`,
    lineHeight: 1,
    display: 'inline-block',
    fontFamily: cornerFontCSS.fontFamily,
    fontWeight: cornerFontCSS.fontWeight,
    fontStyle: cornerFontCSS.fontStyle,
    color: cornerTextColor,
    borderRadius: `${corners.borderRadius}px`,
    zIndex: 20,
  });

  const bd = corners.borderDistance;

  return (
    <>
      {corners.topLeft.visible && (
        <div style={{ position: 'absolute', top: bd, left: bd, ...cornerStyle() }}>
          {corners.topLeft.text}
        </div>
      )}
      {corners.topRight.visible && (
        <div style={{ position: 'absolute', top: bd, right: bd, ...cornerStyle() }}>
          {corners.topRight.text}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function EditorialSlide({
  slide, globalSettings, slideIndex, totalSlides, forExport,
}: EditorialSlideProps) {
  const { profileBadge, accentColor, fontPair, metaBar, corners } = globalSettings;
  const fonts = getFontFamilies(fontPair);

  const layout: ContentLayout = slide.contentLayout ?? (slideIndex === 0 ? 'cover' : 'text-image-text');

  // Determine background and text colors
  const bgColor = slide.backgroundColor || '#EFEFEE';
  const bgIsLight = isLightColor(bgColor);
  const autoTextColor = bgIsLight ? '#111111' : '#FFFFFF';
  const autoTextSecondary = bgIsLight ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.80)';
  const metaTextColor = bgIsLight ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.42)';

  // Per-element font CSS
  const titleFontCSS = slide.titleFont
    ? getElementFontCSS(slide.titleFont)
    : { fontFamily: fonts.title, fontWeight: 800, fontStyle: 'normal' as const };
  const descFontCSS = slide.descriptionFont
    ? getElementFontCSS(slide.descriptionFont)
    : { fontFamily: fonts.body, fontWeight: 400, fontStyle: 'normal' as const };

  // Highlights
  const allHighlights: TextHighlight[] = slide.highlights?.length
    ? slide.highlights
    : (slide.highlightWord ? [{ text: slide.highlightWord, color: accentColor }] : []);
  const titleHighlights = allHighlights.filter(h => slide.title.toLowerCase().includes(h.text.toLowerCase()));
  const descHighlights = allHighlights.filter(h => (slide.description || '').toLowerCase().includes(h.text.toLowerCase()));

  const align = slide.textAlignment || 'left';
  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  // Faixa vertical derivada de textPosition (top-* / middle-* ou center / bottom-*).
  const vBand: 'top' | 'middle' | 'bottom' = slide.textPosition?.startsWith('top')
    ? 'top'
    : (slide.textPosition?.startsWith('middle') || slide.textPosition === 'center')
      ? 'middle'
      : 'bottom';

  const titleStyle: React.CSSProperties = {
    fontFamily: titleFontCSS.fontFamily,
    fontWeight: titleFontCSS.fontWeight,
    fontStyle: titleFontCSS.fontStyle,
    fontSize: `${slide.fontSize.title}px`,
    lineHeight: slide.lineHeight,
    color: slide.titleColor || autoTextColor,
    margin: 0,
    letterSpacing: slide.titleLetterSpacing !== undefined ? `${slide.titleLetterSpacing}em` : '-0.025em',
    textDecoration: slide.titleUnderline ? 'underline' : undefined,
    whiteSpace: 'pre-wrap',
    display: 'block',
    textAlign: align,
  };

  const descStyle: React.CSSProperties = {
    fontFamily: descFontCSS.fontFamily,
    fontWeight: descFontCSS.fontWeight,
    fontStyle: descFontCSS.fontStyle,
    fontSize: `${slide.fontSize.description}px`,
    lineHeight: slide.lineHeight + 0.1,
    color: slide.descriptionColor || autoTextSecondary,
    margin: 0,
    letterSpacing: slide.titleLetterSpacing !== undefined ? `${slide.titleLetterSpacing}em` : '-0.01em',
    textDecoration: slide.descriptionUnderline ? 'underline' : undefined,
    whiteSpace: 'pre-wrap',
    display: 'block',
    textAlign: align,
  };

  const imgUrl = slide.gridImageUrl || slide.backgroundImageUrl || '';
  const hasImage = !!imgUrl && layout !== 'text-only';
  const imageStyle = (height: number): React.CSSProperties => ({
    width: '100%',
    height,
    borderRadius: 20,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundImage: `url(${imgUrl})`,
    backgroundSize: `${slide.imagePosition.zoom}%`,
    backgroundPosition: `${slide.imagePosition.x}% ${slide.imagePosition.y}%`,
    backgroundRepeat: 'no-repeat',
  });

  // ── COVER LAYOUT ───────────────────────────────────────────────────────────
  if (layout === 'cover') {
    const coverBgUrl = slide.backgroundImageUrl || slide.gridImageUrl || '';
    const panelBg = slide.backgroundColor || '#111111';
    const gradientOpacity = (slide.shadow?.opacity ?? 88) / 100;
    const coverGap = slide.titleDescriptionGap ?? 36;
    // Bloco de texto (título + descrição) posicionado pela faixa vertical do
    // seletor "Posição do texto"; os sliders de offset seguem funcionando.
    const coverBlockPos: React.CSSProperties = vBand === 'top'
      ? { top: CONTENT_TOP + 40 }
      : vBand === 'middle'
        ? { top: '50%', transform: 'translateY(-50%)' }
        : { top: COVER_TEXT_DEFAULT_TOP };

    return (
      <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', backgroundColor: panelBg }}>
        {/* Full-bleed background image */}
        {coverBgUrl && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${coverBgUrl})`,
            backgroundSize: `${slide.imagePosition.zoom}%`,
            backgroundPosition: `${slide.imagePosition.x}% ${slide.imagePosition.y}%`,
            backgroundRepeat: 'no-repeat',
          }} />
        )}

        {/* Bottom-to-top gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to top, rgba(0,0,0,${gradientOpacity}) 0%, rgba(0,0,0,${(gradientOpacity * 0.6).toFixed(2)}) 45%, rgba(0,0,0,0.08) 75%, transparent 100%)`,
          zIndex: 1,
        }} />

        {/* Metadata bar — white on cover, only when enabled */}
        {metaBar?.show && (
          <div style={{
            position: 'absolute', top: META_TOP, left: PAD_X, right: PAD_X,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: META_FONTSIZE, fontFamily: fonts.body, fontWeight: 400,
            color: 'rgba(255,255,255,0.85)', zIndex: 10, letterSpacing: '-0.01em',
          }}>
            <span>{metaBar.left}</span>
            <span>{metaBar.center}</span>
            <span>{metaBar.right}</span>
          </div>
        )}

        {/* Profile badge near bottom */}
        {profileBadge.show && (
          <div style={{
            position: 'absolute',
            bottom: COVER_BADGE_BOTTOM,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '8px 20px', borderRadius: 60, zIndex: 10,
            background: 'rgba(0,0,0,0.50)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}>
            {profileBadge.photo && (
              <div style={{
                width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
                backgroundImage: `url(${profileBadge.photo})`,
                backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0,
              }} />
            )}
            <div>
              {profileBadge.name && (
                <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', fontFamily: fonts.title }}>{profileBadge.name}</div>
              )}
              {profileBadge.handle && (
                <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.70)', fontFamily: fonts.body }}>{profileBadge.handle}</div>
              )}
            </div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill={accentColor}>
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke={accentColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}

        {/* Text block — título e descrição fluem juntos com gap ajustável */}
        <div style={{
          position: 'absolute',
          ...coverBlockPos,
          left: PAD_X, right: PAD_X,
          zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems,
          gap: coverGap,
        }}>
          <div style={{ transform: `translateY(${slide.editorialTitleOffsetY ?? 0}px)`, display: 'flex', flexDirection: 'column', alignItems, width: '100%' }}>
            {renderTextWithHighlights(
              slide.title,
              titleHighlights,
              slide.highlightWord || '',
              accentColor,
              { ...titleStyle, color: slide.titleColor || '#FFFFFF', fontSize: `${slide.fontSize.title}px` },
            )}
          </div>

          {slide.description && (
            <div style={{ transform: `translateY(${slide.editorialDescOffsetY ?? 0}px)`, display: 'flex', flexDirection: 'column', alignItems, width: '100%' }}>
              {renderTextWithHighlights(
                slide.description,
                descHighlights,
                '',
                accentColor,
                { ...descStyle, color: slide.descriptionColor || 'rgba(255,255,255,0.75)' },
              )}
            </div>
          )}
        </div>

        <Corners corners={corners} bgIsLight={false} fontBody={fonts.body} />
      </div>
    );
  }

  // ── CONTENT LAYOUTS ───────────────────────────────────────────────────────
  // All share: background color, metadata bar, content padding

  const blockContainer: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems,
  };

  const titleBlock = (
    <div style={blockContainer}>
      {renderTextWithHighlights(
        slide.title, titleHighlights, slide.highlightWord || '', accentColor, titleStyle,
      )}
    </div>
  );

  const descBlock = slide.description ? (
    <div style={blockContainer}>
      {renderTextWithHighlights(
        slide.description, descHighlights, '', accentColor, descStyle,
      )}
    </div>
  ) : null;

  const gap = slide.titleDescriptionGap ?? 36;

  // ── text-image-text ────────────────────────────────────────────────────────
  if (layout === 'text-image-text') {
    const titleOffsetY = slide.editorialTitleOffsetY ?? 0;
    const imageOffsetY = slide.editorialImageOffsetY ?? 0;
    const descOffsetY = slide.editorialDescOffsetY ?? 0;

    const imgH = IMG_HEIGHT;

    return (
      <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', backgroundColor: bgColor }}>
        <MetaBar metaBar={metaBar} textColor={metaTextColor} fontFamily={fonts.body} />

        <div style={{
          position: 'absolute',
          top: CONTENT_TOP,
          bottom: 56,
          left: PAD_X,
          right: PAD_X,
          display: 'flex',
          flexDirection: 'column',
          // Faixa vertical do seletor "Posição do texto" move o grupo inteiro
          justifyContent: vBand === 'top' ? 'flex-start' : vBand === 'bottom' ? 'flex-end' : 'center',
          gap,
        }}>
          <div style={{ transform: `translateY(${titleOffsetY}px)` }}>
            {titleBlock}
          </div>

          {hasImage && (
            <div style={{
              height: imgH,
              width: '100%',
              transform: `translateY(${imageOffsetY}px)`,
              ...imageStyle(imgH),
            }} />
          )}

          {descBlock && (
            <div style={{ transform: `translateY(${descOffsetY}px)` }}>
              {descBlock}
            </div>
          )}
        </div>

        <Corners corners={corners} bgIsLight={bgIsLight} fontBody={fonts.body} />
      </div>
    );
  }

  // ── text-text-image ────────────────────────────────────────────────────────
  if (layout === 'text-text-image') {
    const titleOffsetY = slide.editorialTitleOffsetY ?? 0;
    const descOffsetY = slide.editorialDescOffsetY ?? 0;
    const imageOffsetY = slide.editorialImageOffsetY ?? 0;

    const titleH = Math.round(SLIDE_H * 0.28); // ~378
    const titleTop = CONTENT_TOP + titleOffsetY;
    const baseDescTop = CONTENT_TOP + titleH + 40;
    const descH = Math.round(SLIDE_H * 0.16);  // ~216
    const descTopTTI = baseDescTop + descOffsetY;
    const baseImgTop = baseDescTop + descH + 40;
    const imgTopTTI = baseImgTop + imageOffsetY;
    const imgH = SLIDE_H - baseImgTop - 56;

    return (
      <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', backgroundColor: bgColor }}>
        <MetaBar metaBar={metaBar} textColor={metaTextColor} fontFamily={fonts.body} />

        {/* Top title */}
        <div style={{
          position: 'absolute', top: titleTop, left: PAD_X, right: PAD_X,
          overflow: 'hidden',
        }}>
          {titleBlock}
        </div>

        {/* Secondary description text */}
        {descBlock && (
          <div style={{
            position: 'absolute', top: descTopTTI, left: PAD_X, right: PAD_X,
            overflow: 'hidden',
          }}>
            {descBlock}
          </div>
        )}

        {/* Image at bottom */}
        {hasImage && imgH > 0 && (
          <div style={{
            position: 'absolute', top: imgTopTTI, left: PAD_X, right: PAD_X, height: imgH,
            ...imageStyle(imgH),
            width: SLIDE_W - PAD_X * 2,
          }} />
        )}

        <Corners corners={corners} bgIsLight={bgIsLight} fontBody={fonts.body} />
      </div>
    );
  }

  // ── image-text-text ────────────────────────────────────────────────────────
  if (layout === 'image-text-text') {
    const imageOffsetY = slide.editorialImageOffsetY ?? 0;
    const titleOffsetY = slide.editorialTitleOffsetY ?? 0;
    const descOffsetY = slide.editorialDescOffsetY ?? 0;

    const imgTop = CONTENT_TOP + imageOffsetY;
    const imgH = ITT_IMG_HEIGHT;
    const baseTitleTop = CONTENT_TOP + imgH + 44;
    const titleTopITT = baseTitleTop + titleOffsetY;
    const baseDescTop = baseTitleTop + Math.round(SLIDE_H * 0.28);
    const descTopITT = baseDescTop + descOffsetY;

    return (
      <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', backgroundColor: bgColor }}>
        <MetaBar metaBar={metaBar} textColor={metaTextColor} fontFamily={fonts.body} />

        {/* Image at top */}
        {hasImage && (
          <div style={{
            position: 'absolute', top: imgTop, left: PAD_X, right: PAD_X, height: imgH,
            ...imageStyle(imgH),
            width: SLIDE_W - PAD_X * 2,
          }} />
        )}

        {/* Title */}
        <div style={{
          position: 'absolute', top: titleTopITT, left: PAD_X, right: PAD_X,
          overflow: 'hidden',
        }}>
          {titleBlock}
        </div>

        {/* Description */}
        {descBlock && (
          <div style={{
            position: 'absolute', top: descTopITT, left: PAD_X, right: PAD_X,
            overflow: 'hidden',
          }}>
            {descBlock}
          </div>
        )}

        <Corners corners={corners} bgIsLight={bgIsLight} fontBody={fonts.body} />
      </div>
    );
  }

  // ── text-only ──────────────────────────────────────────────────────────────
  // layout === 'text-only'
  const titleOffsetY = slide.editorialTitleOffsetY ?? 0;
  const descOffsetY = slide.editorialDescOffsetY ?? 0;
  const titleTop = CONTENT_TOP + titleOffsetY;
  const descTopTextOnly = Math.round(SLIDE_H * 0.54) + descOffsetY; // ~729

  return (
    <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', backgroundColor: bgColor }}>
      <MetaBar metaBar={metaBar} textColor={metaTextColor} fontFamily={fonts.body} />

      {/* Title — large */}
      <div style={{
        position: 'absolute', top: titleTop, left: PAD_X, right: PAD_X,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
      }}>
        {titleBlock}
      </div>

      {/* Description */}
      {descBlock && (
        <div style={{
          position: 'absolute', top: descTopTextOnly, left: PAD_X, right: PAD_X,
          overflow: 'hidden',
        }}>
          {descBlock}
        </div>
      )}

      <Corners corners={corners} bgIsLight={bgIsLight} fontBody={fonts.body} />
    </div>
  );
}
