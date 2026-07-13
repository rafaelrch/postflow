'use client';

import React, { useRef } from 'react';
import { Slide, GlobalSettings } from '@/types';

export interface ProfileSlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  profileData: {
    photo: string;
    name: string;
    handle: string;
    followers?: string;
  };
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
  onUpdateProfile?: (updates: { name?: string; handle?: string }) => void;
  onUpdateText?: (updates: { title?: string; description?: string; subtitle?: string }) => void;
}

const CONTENT_WIDTH = 864;
const AVATAR_SIZE = 84;
const VERIFIED_BLUE = '#1d9bf0';
const MEDIA_HEIGHT = 510;
const MAX_BODY_FONT = 40;

// Theme palettes
const LIGHT = {
  bg: '#FFFFFF',
  text: '#0F1419',
  handle: '#687684',
  mediaBg: '#E8EEF2',
  avatarBg: '#D9D9D9',
  avatarText: '#666666',
};
const DARK = {
  bg: '#000000',
  text: '#E7E9EA',
  handle: '#71767B',
  mediaBg: '#1E2732',
  avatarBg: '#333639',
  avatarText: '#AAAAAA',
};

function VerifiedBadge({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/selo_insta.png"
      alt=""
      width={size}
      height={size}
      crossOrigin="anonymous"
      style={{ display: 'block', flexShrink: 0, width: size, height: size }}
    />
  );
}

export default function ProfileSlide({
  slide,
  globalSettings,
  profileData,
  forExport,
  onUpdateProfile,
  onUpdateText,
}: ProfileSlideProps) {
  const imageUrl = slide.gridImageUrl || slide.backgroundImageUrl;
  const hasMedia = Boolean(imageUrl);
  const descText = slide.description?.trim() || '';
  const titleDescGap = slide.titleDescriptionGap ?? 16;
  const avatarFallback = (profileData.name || 'P').trim().charAt(0).toUpperCase();
  const bodyFontSize = Math.min(slide.fontSize.title, MAX_BODY_FONT);
  const headerFontSize = globalSettings.profileBadge.headerFontSize ?? 30;
  const badgeSize = Math.round(headerFontSize * 1.05);
  const handleFontSize = Math.round(headerFontSize * 0.82);
  const isEditable = Boolean(onUpdateProfile || onUpdateText) && !forExport;

  // Alturas do header em pixels fixos — html2canvas diverge do browser ao
  // centralizar flex vertical, então a coluna de texto é posicionada por
  // offset calculado em vez de alignItems/justifyContent.
  const nameRowH = Math.round(headerFontSize * 1.1);
  const handleGap = 6;
  const handleRowH = Math.round(handleFontSize * 1.1);
  const textBlockH = nameRowH + handleGap + handleRowH;
  const textPadTop = Math.max(0, Math.round((AVATAR_SIZE - textBlockH) / 2));

  // Theme colours
  const C = globalSettings.theme === 'dark' ? DARK : LIGHT;

  const nameRef = useRef<HTMLSpanElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);

  // Tipografia fixa — o Twitter/X usa uma única fonte, então este template
  // ignora o fontPair do carrossel.
  const TWITTER_FONT = "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif";

  // Name / handle inline edit helpers
  const editableProps = (field: 'name' | 'handle') => ({
    contentEditable: isEditable || undefined,
    suppressContentEditableWarning: true,
    onBlur: isEditable
      ? (e: React.FocusEvent<HTMLSpanElement>) => {
          const val = e.currentTarget.textContent?.trim() || '';
          onUpdateProfile?.({ [field]: val });
        }
      : undefined,
    onKeyDown: isEditable
      ? (e: React.KeyboardEvent<HTMLSpanElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.currentTarget as HTMLSpanElement).blur();
          }
        }
      : undefined,
    style: isEditable
      ? { outline: 'none', cursor: 'text', paddingBottom: 2, minWidth: 40, display: 'inline-block' }
      : undefined,
  });

  // Body text blur handler — título e descrição são blocos separados, então o
  // innerText traz a quebra entre eles; linha em branco (\n\n) tem prioridade.
  const handleBodyBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!onUpdateText) return;
    const raw = (e.currentTarget as HTMLElement).innerText || '';
    const doubleIdx = raw.indexOf('\n\n');
    const idx = doubleIdx !== -1 ? doubleIdx : raw.indexOf('\n');
    const sepLen = doubleIdx !== -1 ? 2 : 1;
    if (idx === -1) {
      onUpdateText({ title: raw.trim(), description: '' });
    } else {
      onUpdateText({
        title: raw.slice(0, idx).trim(),
        description: raw.slice(idx + sepLen).trim(),
      });
    }
  };

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        overflow: 'hidden',
        backgroundColor: C.bg,
        fontFamily: TWITTER_FONT,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: CONTENT_WIDTH,
        }}
      >
        {/* Profile header — posições absolutas em pixels (sem centralização
            flex vertical) para o html2canvas renderizar igual ao preview */}
        <div style={{ position: 'relative', height: AVATAR_SIZE }}>
          {/* Avatar */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: '50%',
              overflow: 'hidden',
              backgroundColor: C.avatarBg,
            }}
          >
            {profileData.photo ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundImage: `url(${profileData.photo})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'table' }}>
                <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'center' }}>
                  <span style={{ fontSize: headerFontSize, fontWeight: 700, color: C.avatarText, fontFamily: TWITTER_FONT }}>
                    {avatarFallback}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Name + handle column — top fixo calculado para centralizar no avatar */}
          <div style={{ position: 'absolute', left: AVATAR_SIZE + 22, top: textPadTop }}>
            {/* Row 1: name + spacer + badge, explicit height so html2canvas centers cleanly */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: nameRowH,
              }}
            >
              <span
                ref={nameRef}
                {...editableProps('name')}
                style={{
                  fontSize: headerFontSize,
                  lineHeight: `${nameRowH}px`,
                  fontWeight: 700,
                  color: C.text,
                  letterSpacing: '-0.03em',
                  whiteSpace: 'nowrap',
                  ...(isEditable ? { outline: 'none', cursor: 'text', minWidth: 40 } : {}),
                }}
              >
                {profileData.name || 'Seu Nome'}
              </span>
              <div style={{ width: 8, flexShrink: 0 }} />
              <VerifiedBadge size={badgeSize} />
            </div>

            {/* Row 2: handle */}
            <span
              ref={handleRef}
              {...editableProps('handle')}
              style={{
                display: 'block',
                marginTop: handleGap,
                height: handleRowH,
                fontSize: handleFontSize,
                lineHeight: `${handleRowH}px`,
                fontWeight: 400,
                color: C.handle,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                ...(isEditable ? { outline: 'none', cursor: 'text', minWidth: 40 } : {}),
              }}
            >
              {profileData.handle || '@handle'}
            </span>
          </div>
        </div>

        {/* Spacer — explicit height avoids html2canvas margin-collapse issues */}
        <div style={{ height: 42 }} />

        {/* Body text — editable when onUpdateText is provided */}
        <div
          key={`body-${slide.id}`}
          contentEditable={isEditable && Boolean(onUpdateText) ? true : undefined}
          suppressContentEditableWarning
          onBlur={isEditable ? handleBodyBlur : undefined}
          style={{
            fontFamily: TWITTER_FONT,
            fontSize: bodyFontSize,
            fontWeight: 400,
            lineHeight: slide.lineHeight + 0.12,
            color: C.text,
            letterSpacing: '-0.03em',
            whiteSpace: 'pre-wrap',
            width: '100%',
            outline: 'none',
            cursor: isEditable && onUpdateText ? 'text' : 'default',
          }}
        >
          {slide.title}
          {descText && (
            <span style={{ display: 'block', marginTop: titleDescGap }}>{descText}</span>
          )}
        </div>

        {/* Media: video or image */}
        {hasMedia && <div style={{ height: 54 }} />}
        {hasMedia && (
          <div
            style={{
              width: '100%',
              height: MEDIA_HEIGHT,
              borderRadius: 34,
              overflow: 'hidden',
              backgroundColor: C.mediaBg,
            }}
          >
            {imageUrl ? (
              /* background-image approach — html2canvas handles this correctly unlike objectFit on <img> */
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: `${slide.imagePosition.x}% ${slide.imagePosition.y}%`,
                }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
