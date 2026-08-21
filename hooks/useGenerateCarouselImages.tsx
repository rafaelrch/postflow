'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import GenerationToast from '@/components/editor/GenerationToast';
import { useEditorStore } from './useEditorStore';
import { useCreditsStore, handleInsufficientCredits } from './useCreditsStore';
import { DEFAULT_IMAGE_POSITION, ImageShape, ImageSurface, Slide, SlideStyle, SlideTheme } from '@/types';
import { template01ModelOf, template01SlideMedia, template01SlideSurface } from '@/lib/templates/template-01';
import { template01SetImage } from '@/lib/templates/template-01/image';
import { template02ModelOf } from '@/lib/templates/template-02';
import { template02SetImage } from '@/lib/templates/template-02/image';

/** Onde a imagem gerada é aplicada: fundo full-bleed do slide, ou imagem de conteúdo entre os textos. */
export type ImageTarget = 'background' | 'content';

/**
 * Capa do Editorial (layout 'cover') não tem shape de imagem de conteúdo —
 * a imagem dela vai no fundo do slide, gerada pelo botão próprio da capa.
 */
export function isEditorialCoverSlide(style: SlideStyle, slide: Slide, index: number): boolean {
  return style === 'editorial'
    && ((slide.contentLayout ?? (index === 0 ? 'cover' : 'text-image-text')) === 'cover');
}

interface GenerateImageResponse {
  url?: string;
  error?: string;
  code?: string;
}

/** Erro de geração de imagem que carrega o status HTTP, pra detectar 429 (rate limit) e 402 (créditos). */
class GenerateImageError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isInsufficientCredits(err: unknown): boolean {
  return err instanceof GenerateImageError && err.code === 'insufficient_credits';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A OpenAI manda "Please try again in 12s" na mensagem — usa isso, senão espera 15s. */
function parseRetryAfterMs(message: string): number {
  const m = message.match(/try again in ([\d.]+)s/i);
  const secs = m ? parseFloat(m[1]) : 15;
  return Math.ceil(secs) * 1000 + 500; // pequena folga
}

/** Direção opcional do painel de IA: prompt livre + imagem de referência. */
export interface GenerateOptions {
  userPrompt?: string;
  referenceImageUrl?: string;
}

/**
 * O que vale para o DECK inteiro, e não para um slide.
 *
 * Vai igual em todas as chamadas do mesmo lote — é essa repetição literal que
 * amarra as N imagens no mesmo ensaio. Não guarda estado em lugar nenhum: quem
 * dispara calcula uma vez e repassa.
 */
export interface DeckContext {
  /** Superfície do slide (clara/escura). É a única parte que muda por slide. */
  surface: ImageSurface;
  /** Título do carrossel — âncora comum da série. */
  deckTitle?: string;
  /** Quantas imagens este disparo vai gerar. */
  seriesSize?: number;
}

async function generateForSlide(
  slide: Slide,
  slideIndex: number,
  totalSlides: number,
  shape: ImageShape,
  deck: DeckContext,
  opts?: GenerateOptions,
): Promise<string> {
  const isCover = slideIndex === 0;
  const isFinal = slideIndex === totalSlides - 1;

  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slideId: slide.id,
      title: slide.title,
      description: slide.description,
      isCover,
      isFinal,
      shape,
      surface: deck.surface,
      deckTitle: deck.deckTitle,
      seriesSize: deck.seriesSize,
      userPrompt: opts?.userPrompt,
      referenceImageUrl: opts?.referenceImageUrl,
    }),
  });

  const json: GenerateImageResponse = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) {
    throw new GenerateImageError(json.error || `Falha (${res.status}) no slide ${slideIndex + 1}`, res.status, json.code);
  }
  return json.url;
}

const MAX_RATE_LIMIT_RETRIES = 4;

/**
 * Mesmo gerador, mas re-tenta automaticamente em 429 (limite de imagens/min da
 * OpenAI) — espera o tempo que a própria API sugeriu e tenta de novo.
 */
async function generateForSlideWithRetry(
  slide: Slide,
  slideIndex: number,
  totalSlides: number,
  shape: ImageShape,
  deck: DeckContext,
  onRateLimit?: (waitSeconds: number) => void,
  opts?: GenerateOptions,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateForSlide(slide, slideIndex, totalSlides, shape, deck, opts);
    } catch (err) {
      const isRateLimit = err instanceof GenerateImageError && err.status === 429;
      if (!isRateLimit || attempt >= MAX_RATE_LIMIT_RETRIES) throw err;
      const waitMs = parseRetryAfterMs((err as Error).message);
      onRateLimit?.(Math.round(waitMs / 1000));
      await sleep(waitMs);
    }
  }
}

/** Re-exportado por conveniência: a definição vive em `@/types`. */
export type { ImageShape };

/**
 * Onde a imagem de um slide vai parar — a ÚNICA resposta para essa pergunta.
 *
 * `imagePatch` (o que gravar) e `imageShape` (que formato pedir à OpenAI)
 * derivam os dois daqui. Duas verdades sobre "onde a imagem vai" é o bug que os
 * comentários de `template01/image.ts` e `template02/image.ts` já contam por
 * extenso — não vamos abrir uma terceira frente dele.
 *
 * 🔴 Nos TEMPLATES o `target` não decide nada: quem decide é o MODELO do slide
 * (a capa do T2 tem imagem de fundo, os internos têm o bloco). Nos outros
 * estilos não existe modelo, e aí sim o `target` manda.
 */
export interface ImageDestination {
  /**
   * Onde a imagem gerada REALMENTE aparece neste slide.
   *
   * `'none'` significa que gerar aqui não muda nada na tela — e é o valor que
   * mantém crédito do usuário fora do fogo. Ver `hasImageDestination`.
   */
  kind: 'background' | 'content' | 'none';
  /** Modelo do template, quando o estilo tem um. */
  model: number | null;
  /**
   * Formato do destino, quando ele NÃO se deduz do `kind`.
   *
   * O `kind` responde onde a imagem é gravada; o formato da caixa é outra
   * pergunta. Elas andaram juntas enquanto todo destino era em pé — a mídia do
   * Perfil é gravada no fundo (`kind: 'background'`) mas desenhada numa caixa
   * embutida e DEITADA de 864x510, e é só aqui que as duas se separam.
   */
  shape?: ImageShape;
}

export function imageDestination(
  slide: Slide,
  style: SlideStyle,
  index: number,
  target: ImageTarget
): ImageDestination {
  if (style === 'template01') {
    const model = template01ModelOf(slide, index);
    const media = template01SlideMedia(model);
    // O modelo 6 do Manifesto não tem imagem no desenho: nem camada de fundo
    // nem retângulo de conteúdo. `template01ImageSlot` devolve `undefined` e
    // `template01SetImage` devolve `{}` — gerar ali cobrava e não pintava nada.
    const kind = media.background ? 'background' : media.content ? 'content' : 'none';
    return { kind, model };
  }
  if (style === 'template02') {
    const model = template02ModelOf(slide, index);
    // Todo modelo do T2 tem imagem: a capa (modelo 1) no fundo, os internos no
    // bloco. É a mesma condição que `template02SetImage` usa para escolher qual
    // posição resetar.
    return { kind: model === 1 ? 'background' : 'content', model };
  }
  if (style === 'editorial') {
    // No Editorial o desenho do slide decide, não o `target`:
    // - a CAPA é a imagem, e não tem shape de conteúdo;
    // - os internos põem a imagem no card, e não desenham fundo;
    // - `text-only` não tem card nenhum, então não tem onde a imagem entrar
    //   (`showImageBox` em `EditorialSlide` exclui esse layout).
    const layout = slide.contentLayout ?? (index === 0 ? 'cover' : 'text-image-text');
    if (layout === 'cover') return { kind: target === 'content' ? 'none' : 'background', model: null };
    if (layout === 'text-only') return { kind: 'none', model: null };
    return { kind: target === 'content' ? 'content' : 'none', model: null };
  }
  if (style === 'profile') {
    // O Perfil desenha a mídia do post a partir de `gridImageUrl`/
    // `backgroundImageUrl` e NUNCA lê `contentImageUrl`. O `kind` continua
    // 'background' porque é ele que manda no `imagePatch` — é nesses campos que
    // a imagem tem de ser GRAVADA. Mas o destino na tela não é fundo de slide:
    // é a caixa de mídia do post, 864x510, deitada. Daí o `shape` explícito.
    if (target === 'content') return { kind: 'none', model: null };
    return { kind: 'background', model: null, shape: 'inset-landscape' };
  }
  // minimalist: desenha fundo em qualquer slide e imagem de conteúdo no card.
  return { kind: target === 'content' ? 'content' : 'background', model: null };
}

/**
 * Gerar uma imagem para este slide muda alguma coisa na tela?
 *
 * É a pergunta que decide quem entra no lote — e ela vale crédito: cada geração
 * debita `CREDIT_COSTS.image`, então incluir um slide que não tem onde pôr a
 * imagem cobra o usuário para não fazer nada, em silêncio.
 *
 * Antes disto a regra era um `if` escrito à mão para a capa do Editorial. O
 * modelo 6 do Manifesto passou por ele, porque ninguém tinha feito a pergunta
 * geral — só a específica.
 */
export function hasImageDestination(
  slide: Slide,
  style: SlideStyle,
  index: number,
  target: ImageTarget
): boolean {
  return imageDestination(slide, style, index, target).kind !== 'none';
}

/** O formato que a geração deve pedir para este slide. */
export function imageShape(
  slide: Slide,
  style: SlideStyle,
  index: number,
  target: ImageTarget
): ImageShape {
  const destino = imageDestination(slide, style, index, target);
  // Quem declarou o próprio formato manda; o resto segue a regra de sempre.
  if (destino.shape) return destino.shape;
  return destino.kind === 'content' ? 'inset-block' : 'full-bleed';
}

/**
 * A SUPERFÍCIE em que a imagem deste slide vai cair — clara ou escura.
 *
 * Até aqui a atmosfera era `dark` cravada no prompt, igual para os quatro
 * templates. Mas o Radar é creme (#EEE5D9), o card do Perfil é #FFFFFF e o
 * Manifesto alterna modelos brancos (#FFFFFF) e quase-pretos (#050416): pedir
 * foto escura para qualquer um deles entrega imagem que briga com o slide que
 * a recebe.
 *
 * A regra tem duas metades, e a divisa é o mesmo `imageDestination` de sempre:
 *
 * 1. A imagem É O FUNDO e o texto vai POR CIMA dela. Aqui claridade não é
 *    gosto: nos templates o desenho põe scrim escuro e texto branco sobre a
 *    foto (a `regraCabecalho` do spec do T2 diz isso com todas as letras),
 *    então a imagem precisa ser escura para o texto continuar existindo.
 * 2. A imagem é uma CAIXA EMBUTIDA. Ela não carrega texto nenhum, e o que
 *    importa é combinar com o papel em volta.
 *
 * Editorial e Minimalist não têm papel próprio: seguem o TEMA do deck, que é o
 * mesmo que decide a cor do texto que vai junto.
 */
export function imageSurface(
  slide: Slide,
  style: SlideStyle,
  index: number,
  target: ImageTarget,
  theme: SlideTheme,
): ImageSurface {
  const destino = imageDestination(slide, style, index, target);

  // O Manifesto responde pelo próprio spec, modelo a modelo.
  if (style === 'template01') {
    return template01SlideSurface(destino.model ?? template01ModelOf(slide, index));
  }
  // Radar: capa é foto de fundo sob cabeçalho branco; internos são bloco sobre
  // o papel creme.
  if (style === 'template02') return destino.model === 1 ? 'dark' : 'light';
  // Perfil: a mídia do post é uma caixa dentro de um card #FFFFFF.
  if (style === 'profile') return 'light';

  return theme === 'light' ? 'light' : 'dark';
}

/**
 * Onde a imagem gerada é gravada.
 *
 * Nos TEMPLATES 1 e 2 vai para o SLOT do slide — antes ia para os campos
 * genéricos, que perdem do slot na hora de pintar: gerar por cima de um upload
 * manual dizia "pronto!" e não mudava nada na tela. Nos outros estilos não
 * existe slot, e o destino continua sendo o mesmo de sempre.
 */
export function imagePatch(
  slide: Slide,
  style: SlideStyle,
  index: number,
  target: ImageTarget,
  url: string
): Partial<Slide> {
  const { model } = imageDestination(slide, style, index, target);
  if (style === 'template01') {
    return template01SetImage(slide, model as number, url);
  }
  if (style === 'template02') {
    return template02SetImage(slide, model as number, url);
  }
  return target === 'content'
    ? { contentImageUrl: url, contentImagePosition: { ...DEFAULT_IMAGE_POSITION } }
    : {
        backgroundImageUrl: url,
        gridImageUrl: url,
        imageType: 'background',
        imagePosition: { ...DEFAULT_IMAGE_POSITION },
      };
}

/**
 * Quais slides o lote atinge — a ÚNICA resposta para essa pergunta.
 *
 * Existia dividida em duas: o filtro inline do `generateAll` decidia quem
 * gerava, e o `EditorSidebar` recontava por fora para o rótulo do botão. Duas
 * contas para a mesma pergunta já era uma a mais, e a LISTA que o painel mostra
 * seria a terceira — por isso mora aqui, e todo mundo lê daqui.
 *
 * Duas regras, nesta ordem:
 *
 * 1. `fromIndex` — o lote é "DESTE SLIDE EM DIANTE", incluindo o próprio. Era
 *    o deck inteiro até a rodada 4; o Rafael testou e decidiu que gerar do
 *    slide 4 tem de pegar 4 e 5, não recomeçar do 2.
 * 2. Elegibilidade — só entra o slide que TEM onde pôr a imagem, pergunta
 *    respondida por `hasImageDestination`. Isso vale crédito: cada geração
 *    debita, e um slide sem destino cobraria o usuário para não mudar nada na
 *    tela. Era um `if` só para a capa do Editorial, e por isso o modelo 6 do
 *    Manifesto (que não tem imagem nenhuma no desenho) escapava e queimava 5
 *    créditos calado. A regra vale mesmo quando o slide inelegível É o ponto de
 *    partida: estar em cima dele não o torna elegível.
 */
export function batchTargets(
  slides: Slide[],
  style: SlideStyle,
  target: ImageTarget,
  fromIndex = 0
): { slide: Slide; index: number }[] {
  return slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ index }) => index >= fromIndex)
    .filter(({ slide, index }) => hasImageDestination(slide, style, index, target));
}

export function useGenerateCarouselImages() {
  const { slides, style, updateSlide, carouselTitle, globalSettings } = useEditorStore();
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const generateAll = useCallback(async (target: ImageTarget = 'background', fromIndex = 0, opts?: GenerateOptions) => {
    if (generating) return;

    const targets = batchTargets(slides, style, target, fromIndex);
    if (targets.length === 0) return;

    setGenerating(true);
    setProgress({ done: 0, total: targets.length });

    const toastId = 'gen-images';
    // O rótulo conta o slide que está SENDO gerado (done + 1), não os prontos —
    // "Gerando imagem 0 de 5" nomearia um slide que não existe.
    const showProgress = (done: number, hint?: string) =>
      toast.custom(
        (t) => (
          <GenerationToast
            visible={t.visible}
            title={`Slide ${Math.min(done + 1, targets.length)} de ${targets.length} — gerando imagem`}
            percent={Math.round((done / targets.length) * 100)}
            {...(hint ? { hint } : {})}
          />
        ),
        // `position` por toast: o <Toaster> do app inteiro continua embaixo à
        // direita, e só este card fica centralizado. `duration: Infinity`
        // porque `custom` some sozinho em 4s, ao contrário de `loading`.
        { id: toastId, duration: Infinity, position: 'bottom-center' },
      );
    showProgress(0);

    let done = 0;
    let firstError: string | null = null;
    let creditsOut = false;

    // Concorrência limitada (2 por vez) + retry automático em 429 — a OpenAI
    // limita geração de imagem a poucas por minuto, e disparar tudo de uma vez
    // via Promise.all estourava esse limite em carrosséis com vários slides.
    const CONCURRENCY = 2;
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length && !creditsOut) {
        const { slide, index: i } = targets[cursor++];
        try {
          // O shape é calculado POR SLIDE: no mesmo carrossel a capa é
          // full-bleed e os internos são bloco estreito.
          // O shape e a SUPERFÍCIE saem por slide (a capa não é o interno).
          // Já `deckTitle` e `seriesSize` são do DECK: vão iguais nas N
          // chamadas, e é essa repetição literal que amarra o ensaio.
          const url = await generateForSlideWithRetry(slide, i, slides.length, imageShape(slide, style, i, target), {
            surface: imageSurface(slide, style, i, target, globalSettings.theme),
            deckTitle: carouselTitle,
            seriesSize: targets.length,
          }, (waitSecs) => {
            // O aviso de rate limit é uma NOTA no toast, não um toast novo: o
            // usuário continua vendo quanto do lote já saiu.
            showProgress(done, `Limite da OpenAI atingido — aguardando ${waitSecs}s…`);
          }, opts);
          updateSlide(i, imagePatch(slide, style, i, target, url));
        } catch (err) {
          // Sem créditos: os próximos slides falhariam igual — para o lote.
          if (isInsufficientCredits(err)) {
            creditsOut = true;
            return;
          }
          const msg = err instanceof Error ? err.message : 'Erro desconhecido';
          if (!firstError) firstError = msg;
          console.error(`[gen-images] slide ${i + 1}:`, err);
        } finally {
          done++;
          setProgress({ done, total: targets.length });
          if (done < targets.length) showProgress(done);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

    setGenerating(false);
    useCreditsStore.getState().refresh();

    if (creditsOut) {
      toast.dismiss(toastId);
      handleInsufficientCredits({ code: 'insufficient_credits' }); // abre o popup global
    } else if (firstError && done === targets.length) {
      toast.error(firstError, { id: toastId, duration: 6000 });
    } else if (firstError) {
      toast.error(`Algumas imagens falharam: ${firstError}`, { id: toastId, duration: 6000 });
    } else {
      // `duration` EXPLÍCITA: o toast de carregamento é `custom` (padrão 4s) e
      // precisa de `Infinity`; o upsert por id mescla sobre ele, então sem um
      // valor aqui o "pronto!" herdaria o Infinity e nunca sumiria da tela.
      toast.success(`${targets.length} imagens geradas!`, { id: toastId, duration: 2000 });
    }
  }, [slides, style, generating, updateSlide]);

  const generateOne = useCallback(async (index: number, target: ImageTarget = 'background', opts?: GenerateOptions) => {
    const slide = slides[index];
    if (!slide || generating) return;

    setGenerating(true);
    const toastId = `gen-image-${slide.id}`;
    // Um slide só não tem progresso REAL para mostrar — a barra fica
    // indeterminada e nenhuma porcentagem é exibida.
    const showLoading = (hint?: string) =>
      toast.custom(
        (t) => (
          <GenerationToast
            visible={t.visible}
            title={`Slide ${index + 1} — gerando imagem`}
            {...(hint ? { hint } : {})}
          />
        ),
        // `position` por toast: o <Toaster> do app inteiro continua embaixo à
        // direita, e só este card fica centralizado. `duration: Infinity`
        // porque `custom` some sozinho em 4s, ao contrário de `loading`.
        { id: toastId, duration: Infinity, position: 'bottom-center' },
      );
    showLoading();

    try {
      // Slide avulso NÃO manda série: uma imagem só não é um ensaio, e
      // prometer coerência com imagens que não estão sendo geradas seria ruído.
      const url = await generateForSlideWithRetry(slide, index, slides.length, imageShape(slide, style, index, target), {
        surface: imageSurface(slide, style, index, target, globalSettings.theme),
      }, (waitSecs) => {
        showLoading(`Limite da OpenAI atingido — aguardando ${waitSecs}s…`);
      }, opts);
      updateSlide(index, imagePatch(slide, style, index, target, url));
      toast.success(`Slide ${index + 1} pronto!`, { id: toastId, duration: 2000 });
    } catch (err) {
      if (isInsufficientCredits(err)) {
        toast.dismiss(toastId);
        handleInsufficientCredits({ code: 'insufficient_credits' }); // abre o popup global
      } else {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        toast.error(msg, { id: toastId, duration: 6000 });
      }
    } finally {
      setGenerating(false);
      useCreditsStore.getState().refresh();
    }
  }, [slides, style, generating, updateSlide]);

  return { generateAll, generateOne, generating, progress };
}
