'use client';

import React, { useRef, useEffect } from 'react';
import { Slide, GlobalSettings } from '@/types';
import { getFontFamilies, getFontGoogleUrl } from '@/lib/utils';

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
const AVATAR_SIZE = 70;
const VERIFIED_BLUE = '#1d9bf0';
const MEDIA_HEIGHT = 510;

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

function VerifiedBadge() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="7.8" fill={VERIFIED_BLUE} />
      <path
        d="M10.4 14.65 8.2 12.5l-1.05 1.05 3.25 3.25 6.45-6.45-1.05-1.05-5.4 5.35Z"
        fill="#FFFFFF"
      />
    </svg>
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
  const bodyText = slide.description?.trim()
    ? `${slide.title}\n\n${slide.description.trim()}`
    : slide.title;
  const avatarFallback = (profileData.name || 'P').trim().charAt(0).toUpperCase();
  const bodyFontSize = slide.fontSize.title;
  const headerFontSize = globalSettings.profileBadge.headerFontSize ?? 26;
  const isEditable = Boolean(onUpdateProfile || onUpdateText) && !forExport;

  // Theme colours
  const C = globalSettings.theme === 'dark' ? DARK : LIGHT;

  const nameRef = useRef<HTMLSpanElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);

  // Load Google Fonts when fontPair changes
  const fonts = getFontFamilies(globalSettings.fontPair);
  useEffect(() => {
    if (forExport) return;
    const url = getFontGoogleUrl(globalSettings.fontPair);
    if (!url) return;
    const id = `gf-${globalSettings.fontPair.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }, [globalSettings.fontPair, forExport]);

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

  // Body text blur handler — splits back into title + description on double-newline
  const handleBodyBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!onUpdateText) return;
    const raw = e.currentTarget.textContent || '';
    const idx = raw.indexOf('\n\n');
    if (idx === -1) {
      onUpdateText({ title: raw.trim(), description: '' });
    } else {
      onUpdateText({
        title: raw.slice(0, idx).trim(),
        description: raw.slice(idx + 2).trim(),
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
        fontFamily: fonts.title,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: CONTENT_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        {/* Profile header */}
        {forExport ? (
          /* ── Export layout: table cells for reliable html2canvas vertical centering ── */
          <div style={{ display: 'table' }}>
            <div style={{ display: 'table-row' }}>
              {/* Avatar cell */}
              <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: 22 }}>
                <div
                  style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    backgroundColor: C.avatarBg,
                    position: 'relative',
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
                        <span style={{ fontSize: headerFontSize, fontWeight: 700, color: C.avatarText, fontFamily: fonts.title }}>
                          {avatarFallback}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Name + handle cell */}
              <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                {/* Name + badge row */}
                <div style={{ display: 'table' }}>
                  <div style={{ display: 'table-row' }}>
                    <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                      <span
                        style={{
                          fontSize: headerFontSize,
                          lineHeight: 1.05,
                          fontWeight: 700,
                          color: C.text,
                          letterSpacing: '-0.03em',
                          display: 'block',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {profileData.name || 'Seu Nome'}
                      </span>
                    </div>
                    <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingLeft: 8 }}>
                      <VerifiedBadge />
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontSize: Math.round(headerFontSize * 0.8),
                    lineHeight: 1.1,
                    fontWeight: 400,
                    color: C.handle,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {profileData.handle || '@handle'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* ── Preview layout: flex (looks great in browser) ── */
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {/* Avatar */}
          <div
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: '50%',
              overflow: 'hidden',
              backgroundColor: C.avatarBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              position: 'relative',
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
              <span
                style={{
                  fontSize: headerFontSize,
                  fontWeight: 700,
                  color: C.avatarText,
                  fontFamily: fonts.title,
                }}
              >
                {avatarFallback}
              </span>
            )}
          </div>

          {/* Name + handle */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 0 }}>
              <span
                ref={nameRef}
                {...editableProps('name')}
                style={{
                  fontSize: headerFontSize,
                  lineHeight: 1.05,
                  fontWeight: 700,
                  color: C.text,
                  letterSpacing: '-0.03em',
                  display: 'block',
                }}
              >
                {profileData.name || 'Seu Nome'}
              </span>
              <VerifiedBadge />
            </div>
            <span
              ref={handleRef}
              {...editableProps('handle')}
              style={{
                marginTop: 2,
                fontSize: Math.round(headerFontSize * 0.8),
                lineHeight: 1.1,
                fontWeight: 400,
                color: C.handle,
                letterSpacing: '-0.02em',
              }}
            >
              {profileData.handle || '@handle'}
            </span>
          </div>
        </div>
        )}

        {/* Body text — editable when onUpdateText is provided */}
        <div
          key={`body-${slide.id}`}
          contentEditable={isEditable && Boolean(onUpdateText) ? true : undefined}
          suppressContentEditableWarning
          onBlur={isEditable ? handleBodyBlur : undefined}
          style={{
            marginTop: 42,
            fontFamily: fonts.title,
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
          {bodyText}
        </div>

        {/* Media: video or image */}
        {hasMedia && (
          <div
            style={{
              marginTop: 54,
              width: '100%',
              height: MEDIA_HEIGHT,
              borderRadius: 34,
              overflow: 'hidden',
              backgroundColor: C.mediaBg,
              flexShrink: 0,
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
