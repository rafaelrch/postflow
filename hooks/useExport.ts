'use client';

import { useRef, useCallback } from 'react';
import { useEditorStore } from './useEditorStore';
import toast from 'react-hot-toast';

export function useExport() {
  const { slides, activeSlideIndex } = useEditorStore();

  const exportRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerSlideRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) exportRef.current.set(id, el);
    else exportRef.current.delete(id);
  }, []);

  const captureSlide = useCallback(async (el: HTMLDivElement): Promise<HTMLCanvasElement> => {
    // html-to-image rasteriza via SVG foreignObject — o próprio browser desenha,
    // então o PNG sai idêntico ao preview (html2canvas desloca texto de fontes
    // customizadas alguns px para baixo). html2canvas fica como fallback.
    try {
      const { toCanvas } = await import('html-to-image');
      // fontEmbedCSS pré-computado: evita que a lib escaneie document.styleSheets
      // (SecurityError em folhas cross-origin) e reusa as fontes entre slides.
      let fontEmbedCSS: string | undefined;
      try {
        const { getFontEmbedCss } = await import('@/lib/fontEmbed');
        fontEmbedCSS = await getFontEmbedCss();
      } catch {
        // deixa a própria lib embutir as fontes
      }
      return await toCanvas(el, {
        pixelRatio: 2,
        width: 1080,
        height: 1350,
        cacheBust: true,
        fontEmbedCSS,
      });
    } catch (err) {
      console.warn('html-to-image falhou, usando html2canvas', err);
      const { default: html2canvas } = await import('html2canvas');
      return html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 1080,
        height: 1350,
        backgroundColor: null,
      });
    }
  }, []);

  const downloadSlide = useCallback(async (index?: number) => {
    const idx = index ?? activeSlideIndex;
    const slide = slides[idx];
    if (!slide) return;

    const el = exportRef.current.get(slide.id);
    if (!el) {
      toast.error('Elemento do slide não encontrado');
      return;
    }

    try {
      toast.loading('Gerando imagem...', { id: 'export' });
      const canvas = await captureSlide(el);
      const link = document.createElement('a');
      link.download = `slide-${idx + 1}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Slide baixado!', { id: 'export' });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao exportar slide', { id: 'export' });
    }
  }, [slides, activeSlideIndex, captureSlide]);

  const downloadAll = useCallback(async () => {
    toast.loading('Gerando ZIP...', { id: 'zip' });
    try {
      const { default: JSZip } = await import('jszip');
      const { saveAs } = await import('file-saver');
      const zip = new JSZip();

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const el = exportRef.current.get(slide.id);
        if (!el) continue;
        const canvas = await captureSlide(el);
        const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
        zip.file(`slide-${i + 1}.png`, blob);
        toast.loading(`Processando slide ${i + 1} de ${slides.length}...`, { id: 'zip' });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, 'carrossel-postflow.zip');
      toast.success('ZIP baixado!', { id: 'zip' });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar ZIP', { id: 'zip' });
    }
  }, [slides, captureSlide]);

  return { registerSlideRef, downloadSlide, downloadAll };
}
