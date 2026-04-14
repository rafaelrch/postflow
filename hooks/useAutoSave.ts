'use client';

import { useCallback } from 'react';
import { useEditorStore } from './useEditorStore';
import { createClient } from '@/lib/supabase';

export function useAutoSave() {
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const setCarouselId = useEditorStore((s) => s.setCarouselId);

  const saveNow = useCallback(async () => {
    const store = useEditorStore.getState();

    setSaveStatus('saving');

    try {
      const supabase = createClient();
      let id = store.carouselId;

      // Payload do carrossel alinhado com o novo schema
      const carouselPayload = {
        title:         store.carouselTitle,
        style:         store.style,
        theme:         store.globalSettings.theme,
        font_pair:     store.globalSettings.fontPair,
        accent_color:  store.globalSettings.accentColor,
        corners:       store.globalSettings.corners,
        profile_badge: store.globalSettings.profileBadge,
        caption:       store.caption       ?? '',
        hashtags:      store.hashtags      ?? [],
      };

      if (!id) {
        // ── Primeiro save: INSERT ──────────────────────────────────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Sessão não encontrada. Recarregue a página.');

        const { data, error } = await supabase
          .from('carousels')
          .insert({ user_id: user.id, ...carouselPayload })
          .select('id')
          .single();

        if (error || !data) throw error ?? new Error('Insert falhou');

        id = data.id as string;
        setCarouselId(id);

        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', `/generator?id=${id}`);
        }
      } else {
        // ── Saves subsequentes: UPDATE ─────────────────────────────────────
        const { error } = await supabase
          .from('carousels')
          .update(carouselPayload)
          .eq('id', id);

        if (error) throw error;
      }

      // ── Substitui todos os slides (delete + insert) ────────────────────
      const slidePayload = store.slides.map((slide, i) => ({
        carousel_id:          id,
        position:             i,
        title:                slide.title                ?? '',
        description:          slide.description          ?? '',
        subtitle:             slide.subtitle             ?? '',
        highlight_word:       slide.highlightWord        ?? '',
        background_image_url: slide.backgroundImageUrl   ?? '',
        grid_image_url:       slide.gridImageUrl         ?? '',
        image_type:           slide.imageType,
        image_position:       slide.imagePosition,
        background_color:     slide.backgroundColor,
        shadow_style:         slide.shadow.style,
        shadow_opacity:       slide.shadow.opacity,
        text_position:        slide.textPosition,
        text_offset:          slide.textOffset           ?? null,
        text_alignment:       slide.textAlignment        ?? 'left',
        font_size:            slide.fontSize,
        line_height:          slide.lineHeight,
        cta_button:           slide.ctaButton,
      }));

      const { error: delError } = await supabase
        .from('slides')
        .delete()
        .eq('carousel_id', id);

      if (delError) throw delError;

      if (slidePayload.length > 0) {
        const { error: insError } = await supabase
          .from('slides')
          .insert(slidePayload);

        if (insError) throw insError;
      }

      setSaveStatus('saved');
    } catch (err) {
      console.error('[auto-save]', err);
      setSaveStatus('unsaved');
    }
  }, [setSaveStatus, setCarouselId]);

  return { saveNow };
}
