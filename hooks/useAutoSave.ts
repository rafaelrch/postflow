'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from './useEditorStore';
import { createClient } from '@/lib/supabase';

export function useAutoSave() {
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const setCarouselId = useEditorStore((s) => s.setCarouselId);

  // ── Core save function (reads fresh state on every call) ──────────────────
  const saveNow = useCallback(async () => {
    const store = useEditorStore.getState();

    setSaveStatus('saving');

    try {
      const supabase = createClient();
      let id = store.carouselId;

      if (!id) {
        // ── First save: INSERT a new carousel ──────────────────────────────
        const { data, error } = await supabase
          .from('carousels')
          .insert({
            title: store.carouselTitle,
            style: store.style,
            accent_color: store.globalSettings.accentColor,
            font_pair: store.globalSettings.fontPair,
            theme: store.globalSettings.theme,
            global_settings: store.globalSettings,
          })
          .select('id')
          .single();

        if (error || !data) throw error ?? new Error('Insert failed');

        id = data.id as string;
        setCarouselId(id);

        // Reflect the new ID in the URL without navigation
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', `/generator?id=${id}`);
        }
      } else {
        // ── Subsequent saves: UPDATE existing carousel ─────────────────────
        await supabase
          .from('carousels')
          .update({
            title: store.carouselTitle,
            style: store.style,
            accent_color: store.globalSettings.accentColor,
            font_pair: store.globalSettings.fontPair,
            theme: store.globalSettings.theme,
            global_settings: store.globalSettings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      }

      // ── Always replace all slides (simplest upsert strategy) ──────────────
      const baseSlidePayload = (slide: typeof store.slides[0], i: number) => ({
        carousel_id: id,
        position: i,
        title: slide.title,
        description: slide.description || null,
        highlight_word: slide.highlightWord || null,
        background_image_url: slide.backgroundImageUrl || null,
        grid_image_url: slide.gridImageUrl || null,
        image_type: slide.imageType,
        image_position: slide.imagePosition,
        shadow_style: slide.shadow.style,
        shadow_opacity: slide.shadow.opacity,
        text_position: slide.textPosition,
        text_offset: slide.textOffset || null,
        text_alignment: slide.textAlignment || 'left',
        subtitle: slide.subtitle || null,
        font_size: slide.fontSize,
        line_height: slide.lineHeight,
        cta_button: slide.ctaButton,
        background_color: slide.backgroundColor,
      });

      await supabase.from('slides').delete().eq('carousel_id', id);

      await supabase.from('slides').insert(
        store.slides.map((sl, i) => baseSlidePayload(sl, i))
      );

      setSaveStatus('saved');
    } catch (err) {
      console.error('[auto-save]', err);
      setSaveStatus('unsaved');
    }
  }, [setSaveStatus, setCarouselId]);

  // ── No auto-save side effects (manual save only) ───────────────────────── 
  // Expose immediate save for manual button.
  return { saveNow };
}
