'use client';

import React from 'react';
import { Slide, GlobalSettings, TextPosition, TextHighlight, ElementFont } from '@/types';
import { getFontFamilies, getElementFontCSS, getShadowOverlayGradient } from '@/lib/utils';

export interface MinimalistSlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
}

// Sublinhado desenhado com border-bottom em vez de text-decoration: o
// html2canvas desenha text-decoration com espessura/posição próprias, então o
// export ficava diferente do preview. O inline-block é essencial — em elemento
// inline o navegador pinta a borda na caixa de conteúdo do texto, mas o
// html2canvas pinta no retângulo do elemento (altura da linha), deslocando a
// linha. Com inline-block as duas caixas coincidem e o PNG sai igual ao preview.
const UNDERLINE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  lineHeight: 1.1,
  borderBottom: '0.05em solid currentColor',
};

function getTextPositionStyle(pos: TextPosition): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', display: 'flex', flexDirection: 'column' };
  const pad = 80;
  switch (pos) {
    case 'top-left': return { ...base, top: pad, left: pad };
    case 'top-center': return { ...base, top: pad, left: pad, right: pad, alignItems: 'center', textAlign: 'center' };
    case 'top-right': return { ...base, top: pad, right: pad, alignItems: 'flex-end', textAlign: 'right' };
    case 'middle-left': return { ...base, top: '50%', left: pad, transform: 'translateY(-50%)' };
    case 'center': return { ...base, top: '50%', left: pad, right: pad, transform: 'translateY(-50%)', alignItems: 'center', textAlign: 'center' };
    case 'middle-right': return { ...base, top: '50%', right: pad, transform: 'translateY(-50%)', alignItems: 'flex-end', textAlign: 'right' };
    case 'bottom-left': return { ...base, bottom: 160, left: pad, right: pad };
    case 'bottom-center': return { ...base, bottom: 160, left: pad, right: pad, alignItems: 'center', textAlign: 'center' };
    case 'bottom-right': return { ...base, bottom: 160, right: pad, alignItems: 'flex-end', textAlign: 'right' };
    default: return { ...base, bottom: 160, left: pad, right: pad };
  }
}

function getTextBlockStyle(slide: Slide): React.CSSProperties {
  if (slide.textOffset) {
    const align = slide.textAlignment || 'left';
    return {
      position: 'absolute',
      top: `${slide.textOffset.y}%`,
      left: `${slide.textOffset.x}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
      textAlign: align,
      maxWidth: '70%',
      width: 'max-content',
    };
  }

  const style = getTextPositionStyle(slide.textPosition);
  // Derive natural alignment from the position itself, use slide.textAlignment only as explicit override
  const naturalAlign = (style.textAlign as 'left' | 'center' | 'right' | undefined) || 'left';
  const align = slide.textAlignment ?? naturalAlign;
  // Positions that already set both left+right constrain the width via CSS layout — adding maxWidth
  // on top would only narrow the container further, causing unnecessary line-wrapping.
  const hasBothSides = 'left' in style && 'right' in style;
  return {
    ...style,
    textAlign: align,
    alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
    ...(hasBothSides ? {} : { maxWidth: '70%' }),
    width: 'auto',
  };
}

// Each highlight may carry a wordIdx to distinguish occurrences of the same word
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

  // Sublinhado do bloco inteiro (título/descrição) vira border por palavra —
  // text-decoration renderiza diferente no html2canvas.
  const underlineAll = style.textDecoration === 'underline';
  const { textDecoration: _td, ...outerStyle } = style;

  if ((effective.length === 0 && !underlineAll) || !text) return <span style={outerStyle}>{text}</span>;

  // Tokenise text into words+gaps preserving whitespace
  // Each token = { raw: string, isWord: boolean }
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

  // Count occurrence index per word (case-insensitive)
  const seen: Record<string, number> = {};
  const wordOccurrences: number[] = tokens.map((t) => {
    if (!t.isWord) return -1;
    const lc = t.raw.toLowerCase();
    const occ = seen[lc] ?? 0;
    seen[lc] = occ + 1;
    return occ;
  });

  // Match each word token to a highlight
  const getHl = (word: string, occIdx: number): IndexedHighlight | undefined => {
    const lc = word.toLowerCase();
    // Prefer occurrence-specific match, fall back to any highlight for this word (for legacy highlights without wordIdx)
    return effective.find((h) => h.text.toLowerCase() === lc && h.wordIdx === occIdx)
        ?? effective.find((h) => h.text.toLowerCase() === lc && h.wordIdx === undefined);
  };

  return (
    <span style={outerStyle}>
      {tokens.map((token, i) => {
        if (!token.isWord) return token.raw;
        const occ = wordOccurrences[i];
        const hl = getHl(token.raw, occ);
        const underlined = hl?.underline || underlineAll;
        if (!hl && !underlined) return token.raw;
        const hlFontCSS = hl?.font ? getElementFontCSS(hl.font as ElementFont) : null;
        return (
          <span
            key={i}
            style={{
              ...(hl ? { color: hl.color } : {}),
              ...(underlined ? UNDERLINE_STYLE : {}),
              ...(hlFontCSS ? {
                fontFamily: hlFontCSS.fontFamily,
                fontWeight: hlFontCSS.fontWeight,
                fontStyle: hlFontCSS.fontStyle,
              } : {}),
            }}
          >{token.raw}</span>
        );
      })}
    </span>
  );
}

export default function MinimalistSlide({ slide, globalSettings, slideIndex, totalSlides, forExport }: MinimalistSlideProps) {
  const { corners, accentColor, fontPair, theme } = globalSettings;
  const slideContainerRef = React.useRef<HTMLDivElement>(null);

  const fonts = getFontFamilies(fontPair);
  const isDark = theme === 'dark';

  // A imagem é sempre fundo full-bleed (o modo "grade" foi removido junto com
  // o seletor "Tipo de imagem"); slides antigos com grid_image_url continuam
  // funcionando porque a sidebar sincroniza os dois campos.
  const bgImageUrl = slide.backgroundImageUrl || slide.gridImageUrl || '';

  // Per-slide color derived from backgroundColor (AI sets this per slide)
  const isLightSlide = slide.backgroundColor?.toLowerCase() === '#ffffff';
  const bgColor = slide.backgroundColor || (isDark ? '#111111' : '#F5F5F5');
  const textColor = isLightSlide ? '#0A0A0A' : '#FFFFFF';
  const textSecondary = isLightSlide ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';

  // Per-element font CSS (falls back to global font pair)
  const titleFontCSS = slide.titleFont
    ? getElementFontCSS(slide.titleFont)
    : { fontFamily: fonts.title, fontWeight: 800, fontStyle: 'normal' as const };
  const descFontCSS = slide.descriptionFont
    ? getElementFontCSS(slide.descriptionFont)
    : { fontFamily: fonts.body, fontWeight: 400, fontStyle: 'normal' as const };
  const subtitleFontCSS = slide.subtitleFont
    ? getElementFontCSS(slide.subtitleFont)
    : { fontFamily: fonts.body, fontWeight: 400, fontStyle: 'italic' as const };
  const cornerFontCSS = corners.elementFont
    ? getElementFontCSS(corners.elementFont)
    : { fontFamily: fonts.body, fontWeight: 400, fontStyle: 'normal' as const };

  const titleStyle: React.CSSProperties = {
    fontFamily: titleFontCSS.fontFamily,
    fontWeight: titleFontCSS.fontWeight,
    fontStyle: titleFontCSS.fontStyle,
    fontSize: `${slide.fontSize.title}px`,
    lineHeight: slide.lineHeight,
    color: slide.titleColor || textColor,
    margin: 0,
    letterSpacing: slide.titleLetterSpacing !== undefined ? `${slide.titleLetterSpacing}em` : '-0.02em',
    textDecoration: slide.titleUnderline ? 'underline' : undefined,
  };
  const descStyle: React.CSSProperties = {
    fontFamily: descFontCSS.fontFamily,
    fontWeight: descFontCSS.fontWeight,
    fontStyle: descFontCSS.fontStyle,
    fontSize: `${slide.fontSize.description}px`,
    lineHeight: slide.lineHeight + 0.2,
    color: slide.descriptionColor || textSecondary,
    margin: 0,
    maxWidth: '100%',
    textDecoration: slide.descriptionUnderline ? 'underline' : undefined,
  };
  const subtitleStyle: React.CSSProperties = {
    fontFamily: subtitleFontCSS.fontFamily,
    fontWeight: subtitleFontCSS.fontWeight,
    fontStyle: subtitleFontCSS.fontStyle,
    fontSize: `${slide.fontSize.description}px`,
    lineHeight: slide.lineHeight + 0.2,
    color: slide.subtitleColor || textSecondary,
    margin: 0,
    maxWidth: '100%',
    textDecoration: slide.subtitleUnderline ? 'underline' : undefined,
  };

  const allHighlights: TextHighlight[] = slide.highlights?.length
    ? slide.highlights
    : (slide.highlightWord ? [{ text: slide.highlightWord, color: accentColor }] : []);

  // Split highlights by which field they belong to
  const titleHighlights = allHighlights.filter((h) =>
    slide.title.toLowerCase().includes(h.text.toLowerCase())
  );
  const descHighlights = allHighlights.filter((h) =>
    (slide.description || '').toLowerCase().includes(h.text.toLowerCase())
  );

  // Corner color: custom > auto-derived
  const cornerTextColor = corners.color
    || (isLightSlide ? `rgba(0,0,0,${corners.opacity / 100})` : `rgba(255,255,255,${corners.opacity / 100})`);

  const cornerStyle: React.CSSProperties = {
    fontSize: `${corners.fontSize}px`,
    lineHeight: 1,
    display: 'inline-block',
    fontFamily: cornerFontCSS.fontFamily,
    fontWeight: cornerFontCSS.fontWeight,
    fontStyle: cornerFontCSS.fontStyle,
    color: cornerTextColor,
  };

  const dotInactive = isLightSlide ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)';

  const bd = corners.borderDistance;

  return (
    <div
      ref={slideContainerRef}
      style={{
        width: 1080,
        height: 1350,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: bgColor,
        fontFamily: fonts.body,
      }}
    >
      {/* Background image */}
      {bgImageUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bgImageUrl})`,
            backgroundSize: `${slide.imagePosition.zoom}%`,
            backgroundPosition: `${slide.imagePosition.x}% ${slide.imagePosition.y}%`,
            backgroundRepeat: 'no-repeat',
            opacity: (slide.backgroundImageOpacity ?? 100) / 100,
          }}
        />
      )}

      {/* Shadow overlay */}
      {slide.shadow.style !== 'none' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: getShadowOverlayGradient(slide.shadow.opacity, slide.shadow.color, slide.shadow.size, slide.shadow.distance),
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Text block — positioned by textPosition/textOffset */}
      {(() => {
        const textBlockStyle = getTextBlockStyle(slide);

        const tp = slide.textPadding;
        const extraContainerStyle: React.CSSProperties = {
          gap: slide.titleDescriptionGap !== undefined ? slide.titleDescriptionGap : 20,
          paddingTop: tp ? tp.top : 0,
          paddingRight: tp ? tp.right : 0,
          paddingBottom: tp ? tp.bottom : 0,
          paddingLeft: tp ? tp.left : 0,
        };

        return (
          <div ref={slideContainerRef} style={{ ...textBlockStyle, ...extraContainerStyle, display: 'flex', flexDirection: 'column' }}>
            {renderTextWithHighlights(slide.title, titleHighlights, slide.highlightWord || '', accentColor, { ...titleStyle, whiteSpace: 'pre-wrap', display: 'block' })}

            {/* Imagem de conteúdo — entre os textos, distinta do fundo do slide */}
            {slide.contentImageUrl && (
              <div
                style={{
                  width: '100%',
                  height: 420,
                  borderRadius: 16,
                  overflow: 'hidden',
                  flexShrink: 0,
                  backgroundImage: `url(${slide.contentImageUrl})`,
                  backgroundSize: `${slide.contentImagePosition?.zoom ?? 100}%`,
                  backgroundPosition: `${slide.contentImagePosition?.x ?? 50}% ${slide.contentImagePosition?.y ?? 50}%`,
                  backgroundRepeat: 'no-repeat',
                }}
              />
            )}

            {slide.description !== undefined && slide.description !== '' &&
              renderTextWithHighlights(slide.description, descHighlights, '', accentColor, { ...descStyle, whiteSpace: 'pre-wrap', display: 'block' })
            }

            {slide.subtitle &&
              renderTextWithHighlights(slide.subtitle, [], '', accentColor, { ...subtitleStyle, whiteSpace: 'pre-wrap', display: 'block' })
            }
          </div>
        );
      })()}

      {/* CTA Button */}
      {slide.ctaButton.show && (
        <div style={{
          position: 'absolute',
          ...getCtaPosition(slide.ctaButton.position, bd),
        }}>
          <div style={{
            padding: '14px 28px',
            borderRadius: slide.ctaButton.borderRadius,
            fontSize: slide.ctaButton.fontSize,
            fontWeight: 700,
            fontFamily: fonts.title,
            cursor: 'default',
            ...(slide.ctaButton.style === 'solid' ? {
              background: accentColor,
              color: '#000',
            } : slide.ctaButton.style === 'outline' ? {
              border: `2px solid ${accentColor}`,
              color: accentColor,
            } : {
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: textColor,
              border: '1px solid rgba(255,255,255,0.2)',
            }),
          }}>
            {slide.ctaButton.text}
          </div>
        </div>
      )}

      {/* Corners */}
      {corners.show && (
        <>
          {corners.topLeft.visible && (
            <div style={{ position: 'absolute', top: bd, left: bd, ...cornerStyle }}>
              {corners.topLeft.text}
            </div>
          )}
          {corners.topRight.visible && (
            <div style={{ position: 'absolute', top: bd, right: bd, ...cornerStyle }}>
              {corners.topRight.text}
            </div>
          )}
        </>
      )}

      {/* Slide progress dots */}
      <div style={{
        position: 'absolute',
        bottom: bd + 4,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 6,
      }}>
        {Array.from({ length: totalSlides }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === slideIndex ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === slideIndex ? accentColor : dotInactive,
              transition: 'width 0.3s',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function getCtaPosition(pos: TextPosition, bd: number): React.CSSProperties {
  switch (pos) {
    case 'top-left': return { top: bd + 120, left: bd };
    case 'top-center': return { top: bd + 120, left: '50%', transform: 'translateX(-50%)' };
    case 'top-right': return { top: bd + 120, right: bd };
    case 'middle-left': return { top: '50%', left: bd, transform: 'translateY(-50%)' };
    case 'center': return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
    case 'middle-right': return { top: '50%', right: bd, transform: 'translateY(-50%)' };
    case 'bottom-left': return { bottom: bd + 80, left: bd };
    case 'bottom-center': return { bottom: bd + 80, left: '50%', transform: 'translateX(-50%)' };
    case 'bottom-right': return { bottom: bd + 80, right: bd };
    default: return { bottom: bd + 80, left: '50%', transform: 'translateX(-50%)' };
  }
}
