'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import SlidePreview from './SlidePreview';
import {
  Slide,
  GlobalSettings,
  SlideStyle,
  ImageType,
  DEFAULT_GLOBAL_SETTINGS,
} from '@/types';

interface CarouselPreviewProps {
  carouselId: string;
}

interface LoadedCarousel {
  title: string;
  style: SlideStyle;
  slides: Slide[];
  globalSettings: GlobalSettings;
}

export default function CarouselPreview({ carouselId }: CarouselPreviewProps) {
  const [carousel, setCarousel] = useState<LoadedCarousel | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('carousels')
        .select('*, slides(*)')
        .eq('id', carouselId)
        .single();

      if (cancelled || !data) {
        setCarousel(null);
        setLoading(false);
        return;
      }

      const slides: Slide[] = ((data.slides as Record<string, unknown>[]) || [])
        .sort((a, b) => (a.position as number) - (b.position as number))
        .map((sl) => ({
          id: sl.id as string,
          position: sl.position as number,
          title: (sl.title as string) || '',
          description: (sl.description as string) || '',
          highlightWord: (sl.highlight_word as string) || '',
          backgroundImageUrl: (sl.background_image_url as string) || '',
          gridImageUrl: (sl.grid_image_url as string) || '',
          imageType: (sl.image_type as ImageType) || 'grid',
          imagePosition:
            (sl.image_position as { x: number; y: number; zoom: number }) || {
              x: 50,
              y: 50,
              zoom: 175,
            },
          shadow: {
            style: (sl.shadow_style as string) || 'base',
            opacity: (sl.shadow_opacity as number) ?? 88,
          },
          backgroundColor: (sl.background_color as string) || '#111111',
          textPosition: (sl.text_position as string) || 'bottom-left',
          textOffset: (sl.text_offset as { x: number; y: number }) || undefined,
          textAlignment: (sl.text_alignment as 'left' | 'center' | 'right') || 'left',
          subtitle: (sl.subtitle as string) || '',
          fontSize:
            (sl.font_size as { title: number; description: number }) || {
              title: 48,
              description: 18,
            },
          lineHeight: (sl.line_height as number) || 1.2,
          ctaButton: (sl.cta_button as Record<string, unknown>) || {
            show: false,
            text: 'Comenta FLUXO',
            fontSize: 16,
            borderRadius: 12,
            style: 'solid',
            position: 'bottom-center',
          },
        })) as unknown as Slide[];

      const globalSettings: GlobalSettings = {
        theme:
          ((data.theme as GlobalSettings['theme']) as GlobalSettings['theme']) ||
          'dark',
        fontPair:
          (data.font_pair as GlobalSettings['fontPair']) ||
          'SF Pro Display + IvyOra Text',
        accentColor: (data.accent_color as string) || '#00CFFF',
        corners:
          (data.corners as GlobalSettings['corners']) ||
          DEFAULT_GLOBAL_SETTINGS.corners,
        profileBadge:
          (data.profile_badge as GlobalSettings['profileBadge']) ||
          DEFAULT_GLOBAL_SETTINGS.profileBadge,
      };

      setCarousel({
        title: (data.title as string) || 'Carrossel',
        style: (data.style as SlideStyle) || 'minimalist',
        slides,
        globalSettings,
      });
      setIndex(0);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [carouselId]);

  // Responsive scale based on container width
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const next = Math.max(0.18, Math.min(0.38, w / 1080));
        setScale(next);
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (loading) {
    return (
      <div
        className="rounded-[10px] border-2 border-dashed flex items-center justify-center py-10"
        style={{ borderColor: 'var(--line-strong)' }}
      >
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--ink-dim)' }} />
      </div>
    );
  }

  if (!carousel || carousel.slides.length === 0) {
    return (
      <div
        className="rounded-[10px] border-2 border-dashed p-5 text-center"
        style={{ borderColor: 'var(--line-strong)' }}
      >
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-dim)' }}>
          Carrossel sem slides
        </p>
      </div>
    );
  }

  const total = carousel.slides.length;
  const current = carousel.slides[index];
  const go = (dir: -1 | 1) =>
    setIndex((i) => Math.min(total - 1, Math.max(0, i + dir)));

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={wrapRef}
        className="rounded-[12px] border-[1.5px] flex items-center justify-center overflow-hidden"
        style={{
          borderColor: 'var(--line-strong)',
          background: 'var(--paper-2)',
          padding: 14,
        }}
      >
        <SlidePreview
          slide={current}
          globalSettings={carousel.globalSettings}
          style={carousel.style}
          slideIndex={index}
          totalSlides={total}
          scale={scale}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="brand-btn icon outline"
          aria-label="Slide anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 flex flex-col items-center gap-1">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-dim)' }}>
            Slide {index + 1} de {total}
          </p>
          <div className="flex items-center gap-1">
            {carousel.slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ir para slide ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width: i === index ? 18 : 6,
                  height: 6,
                  background: i === index ? 'var(--ink)' : 'var(--line-strong)',
                }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === total - 1}
          className="brand-btn icon outline"
          aria-label="Próximo slide"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
