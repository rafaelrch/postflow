'use client';

import { useCallback, useRef } from 'react';
import { useEditorStore } from './useEditorStore';
import { createClient } from '@/lib/supabase';
import { mapSlideToDbRow } from '@/lib/slide-mapper';

export function useAutoSave() {
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const setCarouselId = useEditorStore((s) => s.setCarouselId);

  // Mutex: o save faz delete+insert dos slides — dois saves simultâneos
  // corromperiam os dados. Se chegar pedido durante um save, roda de novo no fim.
  const savingRef = useRef(false);
  const queuedRef = useRef(false);

  const doSave = useCallback(async () => {
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
        global_settings: { metaBar: store.globalSettings.metaBar ?? null },
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
      // Mapeamento completo em lib/slide-mapper — persiste também cores/fontes
      // por elemento, highlights, sombra custom, paddings e offsets editoriais.
      const slidePayload = store.slides.map((slide, i) => mapSlideToDbRow(slide, id!, i));

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

  const saveNow = useCallback(async () => {
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    savingRef.current = true;
    try {
      do {
        queuedRef.current = false;
        await doSave();
      } while (queuedRef.current);
    } finally {
      savingRef.current = false;
    }
  }, [doSave]);

  return { saveNow };
}
