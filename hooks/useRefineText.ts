'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useEditorStore } from './useEditorStore';
import { handleInsufficientCredits } from './useCreditsStore';
import type { RefineScope, RefineSlide } from '@/lib/refine-text';
import { previewDiffs, slidesPayload, textPatch, type FieldDiff } from '@/lib/refine-fields';

/**
 * REFINAR TEXTO — o lado do cliente.
 *
 * Espelha `useGenerateCarouselImages` na postura (fetch, toast por caso de
 * erro, estado de carregando), com uma diferença que é o requisito central da
 * task: aqui a resposta NÃO é aplicada. Ela vira PREVIEW, e só o "Aplicar"
 * escreve no store. Refinar por cima sem mostrar o que mudou é exatamente como
 * o usuário perde um texto de que gostava.
 *
 * Nenhuma regra do servidor é reimplementada aqui: contagem de slides, chaves
 * de slot e teto de tamanho já vêm garantidos pela rota (ver lib/refine-text.ts).
 * O que este hook faz com um 502 é uma coisa só — não mexer em nada.
 */

export type RefinePreview = {
  scope: RefineScope;
  slides: RefineSlide[];
  diffs: FieldDiff[];
};

export type RefineParams = {
  scope: RefineScope;
  instruction?: string;
  slideIndex?: number;
  field?: string;
};

/** Mensagem por caso, para o usuário saber o que fazer — nunca "erro 502". */
async function mensagemDeErro(res: Response): Promise<string> {
  const json = await res.json().catch(() => ({} as { error?: string; code?: string }));

  if (res.status === 401) return 'Sua sessão expirou. Entre de novo para refinar.';
  if (res.status === 402) {
    if (json.code === 'insufficient_credits') {
      // Popup global de créditos, o mesmo da geração de imagem.
      handleInsufficientCredits({ code: 'insufficient_credits' });
      return 'Seus créditos acabaram.';
    }
    return json.error ?? 'Esse recurso exige uma assinatura ativa.';
  }
  if (res.status === 429) return 'Muitos refinamentos seguidos. Aguarde alguns segundos.';
  if (res.status === 400) return json.error ?? 'Pedido inválido.';
  // 502 = a IA quebrou o contrato (JSON inválido, contagem errada, position
  // trocada). O texto do usuário está intacto, e é isso que ele precisa ouvir.
  if (res.status === 502) return 'A IA devolveu uma resposta fora do padrão. Seu texto continua como estava.';
  return json.error ?? 'Não foi possível refinar agora.';
}

export function useRefineText() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<RefinePreview | null>(null);

  const descartar = useCallback(() => setPreview(null), []);

  const refinar = useCallback(async (params: RefineParams) => {
    // O estado é lido na hora do disparo, não capturado em prop: entre abrir o
    // painel e clicar em refinar o usuário pode ter editado o texto.
    const { slides, style } = useEditorStore.getState();
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch('/api/refine-text', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: params.scope,
          style,
          slides: slidesPayload(slides),
          ...(params.instruction ? { instruction: params.instruction } : {}),
          // `slideIndex` só vai quando o escopo o USA. O servidor ignora o
          // campo em 'carousel', mas mandar um alvo que o escopo não olha faz
          // o corpo mentir sobre a intenção de quem chamou.
          ...(params.scope !== 'carousel' && params.slideIndex != null ? { slideIndex: params.slideIndex } : {}),
          ...(params.field ? { field: params.field } : {}),
        }),
      });

      if (!res.ok) {
        toast.error(await mensagemDeErro(res), { duration: 6000 });
        return;
      }

      const json = (await res.json()) as { slides?: RefineSlide[] };
      if (!Array.isArray(json.slides)) {
        toast.error('A IA devolveu uma resposta fora do padrão. Seu texto continua como estava.', { duration: 6000 });
        return;
      }

      const diffs = previewDiffs(slides, json.slides, style);
      if (diffs.length === 0) {
        toast('A IA não sugeriu nenhuma mudança neste texto.');
        return;
      }
      setPreview({ scope: params.scope, slides: json.slides, diffs });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível refinar agora.', { duration: 6000 });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Escreve o refinamento no store, em UM passo de desfazer.
   *
   * 🔴 São DOIS `pushHistory`, e não é descuido. O `undo` da store volta para
   * `history[historyIndex - 1]`, então desfazer exige o estado ANTES em alguma
   * posição anterior à atual. Com um push só, `historyIndex` fica em 0 e o
   * `undo` sai pela guarda `historyIndex <= 0` sem fazer nada — o usuário
   * clicaria em desfazer e o texto refinado continuaria lá.
   *
   * Este é o primeiro chamador de `pushHistory` no projeto (o histórico existia
   * na store sem ninguém alimentando), então não há convenção anterior para
   * seguir aqui. Nenhum histórico NOVO é escrito: só se usa o que já existe.
   *
   * O par antes/depois também é o que mantém o refinamento atômico — um clique
   * em desfazer volta o carrossel inteiro, não slide por slide.
   */
  const aplicar = useCallback(() => {
    if (!preview) return;
    const { slides, pushHistory, updateSlide } = useEditorStore.getState();

    const patches = preview.slides
      .map((proposto, i) => ({ index: i, patch: textPatch(slides[i], proposto) }))
      .filter(({ patch }) => Object.keys(patch).length > 0);

    if (patches.length === 0) {
      setPreview(null);
      return;
    }

    pushHistory();
    for (const { index, patch } of patches) updateSlide(index, patch);
    pushHistory();

    setPreview(null);
    toast.success(patches.length === 1 ? 'Texto refinado' : `${patches.length} slides refinados`);
  }, [preview]);

  return { loading, preview, refinar, aplicar, descartar };
}
