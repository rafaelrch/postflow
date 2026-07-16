'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useEditorStore } from './useEditorStore';
import { useCreditsStore, handleInsufficientCredits } from './useCreditsStore';
import { Slide, SlideStyle } from '@/types';

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

async function generateForSlide(
  slide: Slide,
  slideIndex: number,
  totalSlides: number,
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
  onRateLimit?: (waitSeconds: number) => void,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateForSlide(slide, slideIndex, totalSlides);
    } catch (err) {
      const isRateLimit = err instanceof GenerateImageError && err.status === 429;
      if (!isRateLimit || attempt >= MAX_RATE_LIMIT_RETRIES) throw err;
      const waitMs = parseRetryAfterMs((err as Error).message);
      onRateLimit?.(Math.round(waitMs / 1000));
      await sleep(waitMs);
    }
  }
}

export function useGenerateCarouselImages() {
  const { slides, style, updateSlide } = useEditorStore();
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const generateAll = useCallback(async (target: ImageTarget = 'background') => {
    if (generating) return;

    // "Gerar para todos" com imagem de conteúdo pula a capa do Editorial —
    // ela tem botão próprio que gera direto no fundo do slide.
    const targets = slides
      .map((slide, i) => ({ slide, i }))
      .filter(({ slide, i }) => !(target === 'content' && isEditorialCoverSlide(style, slide, i)));
    if (targets.length === 0) return;

    setGenerating(true);
    setProgress({ done: 0, total: targets.length });

    const toastId = 'gen-images';
    toast.loading(`Gerando 0/${targets.length} imagens…`, { id: toastId });

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
        const { slide, i } = targets[cursor++];
        try {
          const url = await generateForSlideWithRetry(slide, i, slides.length, (waitSecs) => {
            toast.loading(`Limite da OpenAI atingido — aguardando ${waitSecs}s…`, { id: toastId });
          });
          updateSlide(i, target === 'content'
            ? { contentImageUrl: url }
            : { backgroundImageUrl: url, gridImageUrl: url, imageType: 'background' });
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
          toast.loading(`Gerando ${done}/${targets.length} imagens…`, { id: toastId });
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
      toast.success(`${targets.length} imagens geradas!`, { id: toastId });
    }
  }, [slides, style, generating, updateSlide]);

  const generateOne = useCallback(async (index: number, target: ImageTarget = 'background') => {
    const slide = slides[index];
    if (!slide || generating) return;

    setGenerating(true);
    const toastId = `gen-image-${slide.id}`;
    toast.loading(`Gerando imagem do slide ${index + 1}…`, { id: toastId });

    try {
      const url = await generateForSlideWithRetry(slide, index, slides.length, (waitSecs) => {
        toast.loading(`Limite da OpenAI atingido — aguardando ${waitSecs}s…`, { id: toastId });
      });
      updateSlide(index, target === 'content'
        ? { contentImageUrl: url }
        : { backgroundImageUrl: url, gridImageUrl: url, imageType: 'background' });
      toast.success(`Slide ${index + 1} pronto!`, { id: toastId });
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
  }, [slides, generating, updateSlide]);

  return { generateAll, generateOne, generating, progress };
}
