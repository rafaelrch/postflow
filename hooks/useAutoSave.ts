'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from './useEditorStore';
import { createClient } from '@/lib/supabase';
import { mapSlideToDbRow } from '@/lib/slide-mapper';

/**
 * `onCarouselCreated` avisa que o PRIMEIRO save acabou de criar o carrossel no
 * banco e que a URL vai passar a ter `?id=`.
 *
 * 🔴 Existe por causa de uma corrida real: trocar a URL faz o `useSearchParams`
 * da página ver um id que ela nunca CARREGOU (o deck nasceu em memória), e a
 * página então ia reler o banco — no instante em que os slides ainda não foram
 * gravados. A leitura voltava com 0 slides e o editor piscava "Este carrossel
 * não possui slides salvos" por cima de um deck que estava ali, inteiro.
 *
 * Por isso o aviso sai no MESMO passo síncrono do `replaceState`, e antes dele:
 * quem recebe marca o id como já carregado, e a releitura nem chega a começar.
 * Só adiar o `replaceState` para depois dos slides estreitaria a janela sem
 * fechá-la — o insert dos slides pode falhar ou demorar do mesmo jeito.
 */
export function useAutoSave(onCarouselCreated?: (id: string) => void) {
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const setCarouselId = useEditorStore((s) => s.setCarouselId);

  // Em ref para o `saveNow` não trocar de identidade a cada render: ele é
  // dependência do efeito de autosave da página, que re-assinaria a store a
  // cada render se a função mudasse.
  const onCreatedRef = useRef(onCarouselCreated);
  useEffect(() => { onCreatedRef.current = onCarouselCreated; }, [onCarouselCreated]);

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
        global_settings: {
          metaBar: store.globalSettings.metaBar ?? null,
          format: store.globalSettings.format ?? '4:5',
          // TEMPLATE 1: quais controles de canto o usuário mexeu. Sem isto o
          // deck reabriria seguindo o spec e perderia a escolha dele.
          templateOverrides: store.globalSettings.templateOverrides ?? null,
          // Tipografia e margem dos cantos valem para o carrossel inteiro.
          templateCornerStyle: store.globalSettings.templateCornerStyle ?? null,
        },
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

        // ANTES do replaceState, e sem `await` entre os dois: a partir daqui a
        // URL passa a ter um id, e quem estiver ouvindo precisa já saber que
        // este deck está em memória. Ver o comentário no topo do hook.
        onCreatedRef.current?.(id);

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
