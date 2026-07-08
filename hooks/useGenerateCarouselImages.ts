'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useEditorStore } from './useEditorStore';
import { Slide } from '@/types';

export type ImageProvider = 'openai' | 'gemini';
/** Onde a imagem gerada é aplicada: fundo full-bleed do slide, ou imagem de conteúdo entre os textos. */
export type ImageTarget = 'background' | 'content';

interface GenerateImageResponse {
  url?: string;
  error?: string;
}

async function generateForSlide(
  slide: Slide,
  slideIndex: number,
  totalSlides: number,
  provider: ImageProvider,
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
      provider,
    }),
  });

  const json: GenerateImageResponse = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) {
    throw new Error(json.error || `Falha (${res.status}) no slide ${slideIndex + 1}`);
  }
  return json.url;
}

export function useGenerateCarouselImages() {
  const { slides, updateSlide } = useEditorStore();
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const generateAll = useCallback(async (provider: ImageProvider = 'openai', target: ImageTarget = 'background') => {
    if (slides.length === 0) return;
    if (generating) return;

    setGenerating(true);
    setProgress({ done: 0, total: slides.length });

    const toastId = 'gen-images';
    const providerLabel = provider === 'gemini' ? 'Nano Banana 2' : 'OpenAI';
    toast.loading(`Gerando 0/${slides.length} imagens (${providerLabel})…`, { id: toastId });

    let done = 0;
    let firstError: string | null = null;

    await Promise.all(
      slides.map(async (slide, i) => {
        try {
          const url = await generateForSlide(slide, i, slides.length, provider);
          updateSlide(i, target === 'content'
            ? { contentImageUrl: url }
            : { backgroundImageUrl: url, gridImageUrl: url, imageType: 'background' });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido';
          if (!firstError) firstError = msg;
          console.error(`[gen-images] slide ${i + 1}:`, err);
        } finally {
          done++;
          setProgress({ done, total: slides.length });
          toast.loading(`Gerando ${done}/${slides.length} imagens (${providerLabel})…`, { id: toastId });
        }
      })
    );

    setGenerating(false);

    if (firstError && done === slides.length) {
      toast.error(firstError, { id: toastId, duration: 6000 });
    } else if (firstError) {
      toast.error(`Algumas imagens falharam: ${firstError}`, { id: toastId, duration: 6000 });
    } else {
      toast.success(`${slides.length} imagens geradas!`, { id: toastId });
    }
  }, [slides, generating, updateSlide]);

  const generateOne = useCallback(async (index: number, provider: ImageProvider = 'openai', target: ImageTarget = 'background') => {
    const slide = slides[index];
    if (!slide || generating) return;

    setGenerating(true);
    const toastId = `gen-image-${slide.id}`;
    const providerLabel = provider === 'gemini' ? 'Nano Banana 2' : 'OpenAI';
    toast.loading(`Gerando imagem do slide ${index + 1} (${providerLabel})…`, { id: toastId });

    try {
      const url = await generateForSlide(slide, index, slides.length, provider);
      updateSlide(index, target === 'content'
        ? { contentImageUrl: url }
        : { backgroundImageUrl: url, gridImageUrl: url, imageType: 'background' });
      toast.success(`Slide ${index + 1} pronto!`, { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(msg, { id: toastId, duration: 6000 });
    } finally {
      setGenerating(false);
    }
  }, [slides, generating, updateSlide]);

  return { generateAll, generateOne, generating, progress };
}
