'use client';

import { forwardRef } from 'react';
import { Slide, GlobalSettings, SlideStyle } from '@/types';
import MinimalistSlide from '@/components/slides/MinimalistSlide';
import ProfileSlide from '@/components/slides/ProfileSlide';

interface SlidePreviewProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  style: SlideStyle;
  slideIndex: number;
  totalSlides: number;
  scale?: number;
  isActive?: boolean;
  forExport?: boolean;
  onClick?: () => void;
  onUpdateProfile?: (updates: { name?: string; handle?: string }) => void;
  onUpdateText?: (updates: { title?: string; description?: string; subtitle?: string }) => void;
  onUpdateTextPosition?: (x: number, y: number) => void;
}

const SLIDE_W = 1080;
const SLIDE_H = 1350;

const SlidePreview = forwardRef<HTMLDivElement, SlidePreviewProps>(function SlidePreview(
  { slide, globalSettings, style, slideIndex, totalSlides, scale = 0.22, isActive = false, forExport = false, onClick, onUpdateProfile, onUpdateText, onUpdateTextPosition },
  ref
) {
  const profileData = {
    photo: globalSettings.profileBadge.photo || '',
    name: globalSettings.profileBadge.name || 'Seu Nome',
    handle: globalSettings.profileBadge.handle || '@handle',
    followers: undefined,
  };

  // Enable pointer events when inline editing is possible (main canvas, profile style)
  const innerPointerEvents = (onUpdateProfile || onUpdateText) ? 'auto' : 'none';

  return (
    <div
      ref={ref}
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
        {style === 'profile' ? (
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
        ) : (
          <MinimalistSlide
            slide={slide}
            globalSettings={globalSettings}
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            forExport={forExport}
            onUpdateText={onUpdateText}
            onUpdateTextPosition={onUpdateTextPosition}
          />
        )}
      </div>
    </div>
  );
});

export default SlidePreview;
