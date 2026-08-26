'use client';

import { forwardRef } from 'react';
import { Slide, GlobalSettings, SlideStyle } from '@/types';
import { normalizeHandle } from '@/lib/utils';
import { getFormat } from '@/lib/formats';
import MinimalistSlide from '@/components/slides/MinimalistSlide';
import ProfileSlide from '@/components/slides/ProfileSlide';
import EditorialSlide from '@/components/slides/EditorialSlide';
import Template01Slide from '@/components/slides/Template01Slide';
import Template02Slide from '@/components/slides/Template02Slide';
import Template03Slide from '@/components/slides/Template03Slide';

interface SlidePreviewProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  style: SlideStyle;
  slideIndex: number;
  totalSlides: number;
  scale?: number;
  isActive?: boolean;
  forExport?: boolean;
  captureRef?: (el: HTMLDivElement | null) => void;
  onClick?: () => void;
  onUpdateProfile?: (updates: { name?: string; handle?: string }) => void;
  onUpdateText?: (updates: { title?: string; description?: string; subtitle?: string }) => void;
}

const SlidePreview = forwardRef<HTMLDivElement, SlidePreviewProps>(function SlidePreview(
  { slide, globalSettings, style, slideIndex, totalSlides, scale = 0.22, isActive = false, forExport = false, captureRef, onClick, onUpdateProfile, onUpdateText },
  ref
) {
  // Dimensões do formato ativo — a moldura escalada acompanha a proporção real.
  const fmt = getFormat(globalSettings.format);
  const SLIDE_W = fmt.width;
  const SLIDE_H = fmt.height;

  const profileData = {
    photo: globalSettings.profileBadge.photo || '',
    name: globalSettings.profileBadge.name || 'Seu Nome',
    handle: normalizeHandle(globalSettings.profileBadge.handle) || '@handle',
    followers: undefined,
  };

  // Enable pointer events when inline editing is possible (main canvas, profile style)
  // Only profile slide needs pointer events (inline editable text + photo)
  const innerPointerEvents = (style === 'profile' && (onUpdateProfile || onUpdateText)) ? 'auto' : 'none';
  const setOuterRef = (node: HTMLDivElement | null) => {
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
    captureRef?.(node?.querySelector<HTMLDivElement>('.t03-slide') ?? null);
  };

  return (
    <div
      ref={setOuterRef}
      onClick={onClick}
      style={{
        width: SLIDE_W * scale,
        height: SLIDE_H * scale,
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 8,
        outline: isActive ? '2px solid white' : '2px solid transparent',
        outlineOffset: 2,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          width: SLIDE_W,
          height: SLIDE_H,
          pointerEvents: innerPointerEvents,
        }}
      >
        {style === 'template03' ? (
          <Template03Slide
            slide={slide}
            globalSettings={globalSettings}
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            forExport={forExport}
          />
        ) : style === 'template02' ? (
          <Template02Slide
            slide={slide}
            globalSettings={globalSettings}
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            forExport={forExport}
          />
        ) : style === 'template01' ? (
          <Template01Slide
            slide={slide}
            globalSettings={globalSettings}
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            forExport={forExport}
          />
        ) : style === 'profile' ? (
          <ProfileSlide
            slide={slide}
            globalSettings={globalSettings}
            profileData={profileData}
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            forExport={forExport}
            onUpdateProfile={onUpdateProfile}
            onUpdateText={onUpdateText}
          />
        ) : style === 'editorial' ? (
          <EditorialSlide
            slide={slide}
            globalSettings={globalSettings}
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            forExport={forExport}
          />
        ) : (
          <MinimalistSlide
            slide={slide}
            globalSettings={globalSettings}
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            forExport={forExport}
          />
        )}
      </div>
    </div>
  );
});

export default SlidePreview;
