'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/hooks/useEditorStore';
import { normalizeHandle } from '@/lib/utils';
import MinimalistSlide from '@/components/slides/MinimalistSlide';
import ProfileSlide from '@/components/slides/ProfileSlide';
import EditorialSlide from '@/components/slides/EditorialSlide';

interface HiddenSlidesProps {
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}

export default function HiddenSlides({ registerRef }: HiddenSlidesProps) {
  const { slides, globalSettings, style } = useEditorStore();

  const profileData = {
    photo: globalSettings.profileBadge.photo || '',
    name: globalSettings.profileBadge.name || 'Seu Nome',
    handle: normalizeHandle(globalSettings.profileBadge.handle) || '@handle',
  };

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: '-99999px',
        top: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          ref={(el) => registerRef(slide.id, el)}
          style={{ width: 1080, height: 1350, overflow: 'hidden' }}
        >
          {style === 'profile' ? (
            <ProfileSlide
              slide={slide}
              globalSettings={globalSettings}
              profileData={profileData}
              slideIndex={i}
              totalSlides={slides.length}
              forExport
            />
          ) : style === 'editorial' ? (
            <EditorialSlide
              slide={slide}
              globalSettings={globalSettings}
              slideIndex={i}
              totalSlides={slides.length}
              forExport
            />
          ) : (
            <MinimalistSlide
              slide={slide}
              globalSettings={globalSettings}
              slideIndex={i}
              totalSlides={slides.length}
              forExport
            />
          )}
        </div>
      ))}
    </div>
  );
}
