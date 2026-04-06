'use client';

import React from 'react';
import { Slide, GlobalSettings, ShadowStyle, TextPosition, CornerIcon } from '@/types';
import { getFontFamilies } from '@/lib/utils';

export interface MinimalistSlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
  onUpdateText?: (updates: { title?: string; description?: string; subtitle?: string }) => void;
  onUpdateTextPosition?: (x: number, y: number) => void;
}

// Grid layout constants — image at top, text below
const GRID_IMAGE_TOP = 80;
const GRID_IMAGE_HEIGHT = 700;
const GRID_IMAGE_MARGIN_X = 80;
const GRID_TEXT_TOP = GRID_IMAGE_TOP + GRID_IMAGE_HEIGHT + 40; // 820px

function getShadowGradient(style: ShadowStyle, opacity: number): string {
  const a = opacity / 100;
  switch (style) {
    case 'base':
      return `linear-gradient(to top, rgba(0,0,0,${a}) 0%, transparent 60%)`;
    case 'top-strong':
      return `linear-gradient(to bottom, rgba(0,0,0,${a}) 0%, transparent 50%)`;
    case 'base-strong':
      return `linear-gradient(to top, rgba(0,0,0,${Math.min(a * 1.3, 1)}) 0%, rgba(0,0,0,${a * 0.5}) 50%, transparent 80%)`;
    case 'gradient-full':
      return `linear-gradient(to bottom, rgba(0,0,0,${a * 0.7}) 0%, transparent 30%, rgba(0,0,0,${a}) 100%)`;
    case 'none':
      return 'none';
    default:
      return `linear-gradient(to top, rgba(0,0,0,${a}) 0%, transparent 60%)`;
  }
}

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
  const align = slide.textAlignment || (style.textAlign as 'left' | 'center' | 'right' | undefined) || 'left';
  return {
    ...style,
    textAlign: align,
    alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
    maxWidth: '70%',
    width: style.right || style.left === '50%' ? 'auto' : 'max-content',
  };
}

function renderTextWithHighlight(text: string, word: string, color: string, style: React.CSSProperties): React.ReactNode {
  if (!word || !text) return <span style={style}>{text}</span>;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <span style={style}>
      {parts.map((part, i) =>
        part.toLowerCase() === word.toLowerCase()
          ? <span key={i} style={{ color }}>{part}</span>
          : part
      )}
    </span>
  );
}

const CORNER_ICON_MAP: Record<CornerIcon, string> = {
  none: '',
  bookmark: '🔖',
  arrow: '→',
  heart: '♡',
};

export default function MinimalistSlide({ slide, globalSettings, slideIndex, totalSlides, forExport, onUpdateText, onUpdateTextPosition }: MinimalistSlideProps) {
  const { corners, profileBadge, accentColor, fontPair, theme } = globalSettings;
  const isEditable = !forExport && Boolean(onUpdateText);
  const slideContainerRef = React.useRef<HTMLDivElement>(null);
  const isDraggingRef = React.useRef(false);

  const handleTextMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !onUpdateTextPosition || !slideContainerRef.current) return;
    const rect = slideContainerRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onUpdateTextPosition(x, y);
  };

  const handleTextPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onUpdateTextPosition || !isEditable) return;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleTextPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const commitText = (updated: { title?: string; description?: string; subtitle?: string }) => {
    if (!onUpdateText) return;
    onUpdateText(updated);
  };

  const fonts = getFontFamilies(fontPair);
  const isDark = theme === 'dark';

  const hasBackground = !!slide.backgroundImageUrl && (slide.imageType === 'background' || slide.imageType === 'mixed');
  const hasGrid = !!slide.gridImageUrl && (slide.imageType === 'grid' || slide.imageType === 'mixed');

  // Per-slide color derived from backgroundColor (AI sets this per slide)
  const isLightSlide = slide.backgroundColor?.toLowerCase() === '#ffffff';
  const bgColor = slide.backgroundColor || (isDark ? '#111111' : '#F5F5F5');
  const textColor = isLightSlide ? '#0A0A0A' : '#FFFFFF';
  const textSecondary = isLightSlide ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';

  const titleStyle: React.CSSProperties = {
    fontFamily: fonts.title,
    fontSize: `${slide.fontSize.title}px`,
    fontWeight: 800,
    lineHeight: slide.lineHeight,
    color: textColor,
    margin: 0,
    letterSpacing: '-0.02em',
  };
  const descStyle: React.CSSProperties = {
    fontFamily: fonts.body,
    fontSize: `${slide.fontSize.description}px`,
    lineHeight: slide.lineHeight + 0.2,
    color: textSecondary,
    margin: '16px 0 0 0',
    maxWidth: '100%',
  };

  const cornerTextColor = isLightSlide
    ? `rgba(0,0,0,${corners.opacity / 100})`
    : `rgba(255,255,255,${corners.opacity / 100})`;

  const cornerStyle = (glass: boolean, br: number): React.CSSProperties => ({
    fontSize: `${corners.fontSize}px`,
    fontFamily: fonts.body,
    color: cornerTextColor,
    borderRadius: `${br}px`,
    padding: glass ? '4px 8px' : undefined,
    background: glass ? (isLightSlide ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)') : undefined,
    backdropFilter: glass ? 'blur(8px)' : undefined,
    WebkitBackdropFilter: glass ? 'blur(8px)' : undefined,
  });

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
      {hasBackground && slide.backgroundImageUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${slide.backgroundImageUrl})`,
            backgroundSize: `${slide.imagePosition.zoom}%`,
            backgroundPosition: `${slide.imagePosition.x}% ${slide.imagePosition.y}%`,
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}

      {/* Grid image — fixed top zone */}
      {hasGrid && slide.gridImageUrl && (
        <div style={{
          position: 'absolute',
          top: GRID_IMAGE_TOP,
          left: GRID_IMAGE_MARGIN_X,
          right: GRID_IMAGE_MARGIN_X,
          height: GRID_IMAGE_HEIGHT,
          borderRadius: 24,
          overflow: 'hidden',
        }}>
          <img
            src={slide.gridImageUrl}
            alt=""
            crossOrigin={forExport ? 'anonymous' : undefined}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${slide.imagePosition.x}% ${slide.imagePosition.y}%`,
            }}
          />
        </div>
      )}

      {/* Shadow overlay — only for background image mode */}
      {!hasGrid && slide.shadow.style !== 'none' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: getShadowGradient(slide.shadow.style, slide.shadow.opacity),
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Text block — below grid image, or standard position otherwise */}
      {(() => {
        const textBlockStyle = hasGrid && !slide.textOffset
          ? {
              position: 'absolute' as const,
              top: GRID_TEXT_TOP,
              left: GRID_IMAGE_MARGIN_X,
              right: GRID_IMAGE_MARGIN_X,
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: slide.textAlignment === 'center' ? 'center' : slide.textAlignment === 'right' ? 'flex-end' : 'flex-start',
              textAlign: slide.textAlignment || 'left',
            }
          : getTextBlockStyle(slide);

        const interactiveStyle = {
          ...textBlockStyle,
          cursor: isEditable && onUpdateTextPosition ? 'grab' : 'default',
        };

        return (
          <div
            style={interactiveStyle}
            onPointerDown={handleTextPointerDown}
            onPointerMove={handleTextMove}
            onPointerUp={handleTextPointerUp}
            onPointerLeave={handleTextPointerUp}
            title={isEditable && onUpdateTextPosition ? 'Arraste para mover o texto' : undefined}
          >
            {isEditable ? (
              <h1
                style={{ ...titleStyle, cursor: 'text', userSelect: 'text', whiteSpace: 'pre-wrap' }}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => commitText({ title: e.currentTarget.textContent?.trim() || '' })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).blur();
                  }
                }}
              >
                {slide.title}
              </h1>
            ) : (
              renderTextWithHighlight(slide.title, slide.highlightWord || '', accentColor, titleStyle)
            )}

            {slide.description !== undefined && (
              isEditable ? (
                <p
                  style={{ ...descStyle, cursor: 'text', userSelect: 'text', whiteSpace: 'pre-wrap' }}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => commitText({ description: e.currentTarget.textContent || '' })}
                >
                  {slide.description || ''}
                </p>
              ) : (
                <p style={descStyle}>{slide.description}</p>
              )
            )}

            {slide.subtitle && (
              isEditable ? (
                <p
                  style={{ ...descStyle, marginTop: 8, fontStyle: 'italic', cursor: 'text', userSelect: 'text', whiteSpace: 'pre-wrap' }}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => commitText({ subtitle: e.currentTarget.textContent || '' })}
                >
                  {slide.subtitle}
                </p>
              ) : (
                <p style={{ ...descStyle, marginTop: 8, fontStyle: 'italic' }}>{slide.subtitle}</p>
              )
            )}
          </div>
        );
      })()}

      {/* Profile badge */}
      {profileBadge.show && (
        <div style={{
          position: 'absolute',
          ...getBadgePosition(profileBadge.position, bd),
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: profileBadge.style !== 'minimal' ? '8px 14px' : '0',
          borderRadius: profileBadge.style !== 'minimal' ? 60 : 0,
          background: profileBadge.style === 'solid'
            ? (isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)')
            : profileBadge.style === 'glass'
            ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
            : 'transparent',
          backdropFilter: profileBadge.style === 'glass' ? 'blur(12px)' : undefined,
          WebkitBackdropFilter: profileBadge.style === 'glass' ? 'blur(12px)' : undefined,
        }}>
          {profileBadge.photo && (
            <img
              src={profileBadge.photo}
              alt="Profile"
              crossOrigin={forExport ? 'anonymous' : undefined}
              style={{ width: profileBadge.size, height: profileBadge.size, borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
          <div>
            {profileBadge.name && <div style={{ fontSize: 14, fontWeight: 700, color: textColor, fontFamily: fonts.title }}>{profileBadge.name}</div>}
            {profileBadge.handle && <div style={{ fontSize: 12, color: textSecondary, fontFamily: fonts.body }}>{profileBadge.handle}</div>}
          </div>
        </div>
      )}

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
            <div style={{ position: 'absolute', top: bd, left: bd, ...cornerStyle(corners.glass, corners.borderRadius) }}>
              {corners.topLeft.text}
            </div>
          )}
          {corners.topRight.visible && (
            <div style={{ position: 'absolute', top: bd, right: bd, ...cornerStyle(corners.glass, corners.borderRadius) }}>
              {corners.topRight.text}
            </div>
          )}
          {corners.bottomLeft.visible && (
            <div style={{ position: 'absolute', bottom: bd, left: bd, ...cornerStyle(corners.glass, corners.borderRadius) }}>
              {corners.bottomLeft.text}
            </div>
          )}
          {corners.bottomRight.visible && (
            <div style={{ position: 'absolute', bottom: bd, right: bd, ...cornerStyle(corners.glass, corners.borderRadius), display: 'flex', alignItems: 'center', gap: 6 }}>
              {corners.bottomRight.icon !== 'none' && CORNER_ICON_MAP[corners.bottomRight.icon]}
              {corners.bottomRight.text}
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

function getBadgePosition(pos: TextPosition, bd: number): React.CSSProperties {
  switch (pos) {
    case 'top-left': return { top: bd + 60, left: bd };
    case 'top-right': return { top: bd + 60, right: bd };
    case 'bottom-left': return { bottom: bd + 60, left: bd };
    case 'bottom-right': return { bottom: bd + 60, right: bd };
    default: return { top: bd + 60, left: bd };
  }
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
