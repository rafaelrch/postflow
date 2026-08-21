'use client';

import { useRef, useCallback } from 'react';
import { useEditorStore } from './useEditorStore';
import { getFormat } from '@/lib/formats';
import { nomeDoSlideDoCarrossel, nomeDoZipDoCarrossel } from '@/lib/export-filename';
import toast from 'react-hot-toast';
import { trackProductEvent } from '@/lib/product-events';
import {
  ExportImageError,
  applyEmbeddedImages,
  preloadExportImages,
  slideImageUrls,
} from '@/lib/export-images';

/**
 * Opções do html-to-image para rasterizar um slide.
 *
 * 🔴 `cacheBust` NÃO entra aqui, e isso é uma decisão, não esquecimento.
 *
 * A lib, com `cacheBust`, gruda `?<timestamp>` na URL antes de baixar cada
 * imagem. Duas consequências, as duas ruins para nós:
 *
 * 1. **Não serve para nada neste app.** `cacheBust` existe para não pegar
 *    imagem velha — mas aqui URL de imagem nunca muda de conteúdo: a geração
 *    grava em `<slideId>-<timestamp>.png` e o upload em
 *    `<timestamp>-<random>.<ext>`, os dois com `upsert: false`. Imagem nova é
 *    URL nova, sempre.
 * 2. **Alarga a janela de falha.** Com a query nova a cada exportação, toda
 *    imagem de todo slide é rebaixada da rede em toda exportação, ignorando o
 *    cache do browser — e uma falha só é fatal, ver abaixo.
 *
 * A parte fatal, que foi o que quebrou a exportação: o cache interno do
 * html-to-image (`lib/dataurl.js`) guarda também o FRACASSO. Se um download de
 * imagem falha, ele grava string vazia para aquela URL e devolve essa string
 * em toda chamada seguinte — a camada vira `background-image: url("")` e o PNG
 * sai sem imagem, **sem nenhum aviso no console**, porque o `console.warn` da
 * lib só acontece na primeira tentativa. A partir daí, toda exportação daquela
 * aba sai quebrada até um reload. E o cache é chaveado pela URL SEM a query,
 * então `cacheBust` nem sequer escapa do fracasso gravado.
 *
 * Ou seja: `cacheBust` só aumentava a chance de cair no fracasso que fica
 * grudado. Sem ele o browser reusa a imagem que o preview já baixou.
 */
export const EXPORT_IMAGE_OPTIONS = {
  pixelRatio: 2,
} as const;

export function useExport() {
  const { slides, activeSlideIndex, globalSettings, style, carouselTitle } = useEditorStore();

  // Exporta EXATAMENTE no formato selecionado (largura 1080 fixa; altura varia).
  const { width: exportWidth, height: exportHeight } = getFormat(globalSettings.format);

  const exportRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerSlideRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) exportRef.current.set(id, el);
    else exportRef.current.delete(id);
  }, []);

  /**
   * Baixa as imagens dos slides antes de rasterizar. Estoura se alguma faltar —
   * quem chama transforma isso em toast e NÃO entrega arquivo.
   */
  const preloadImages = useCallback(
    (somenteIndice?: number) =>
      preloadExportImages(slideImageUrls(slides, style, globalSettings, somenteIndice)),
    [slides, style, globalSettings]
  );

  const rasterize = useCallback(async (el: HTMLDivElement): Promise<HTMLCanvasElement> => {
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
        ...EXPORT_IMAGE_OPTIONS,
        width: exportWidth,
        height: exportHeight,
        fontEmbedCSS,
      });
    } catch (err) {
      console.warn('html-to-image falhou, usando html2canvas', err);
      const { default: html2canvas } = await import('html2canvas');
      return html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: exportWidth,
        height: exportHeight,
        backgroundColor: null,
      });
    }
  }, [exportWidth, exportHeight]);

  const captureSlide = useCallback(async (el: HTMLDivElement, imagens: Map<string, string>): Promise<HTMLCanvasElement> => {
    // As imagens entram como data URL ANTES da lib olhar o nó: assim ela pula o
    // download (e o cache que guarda fracasso) por completo. O restore é
    // garantido, mesmo se a rasterização estourar.
    const restaurar = applyEmbeddedImages(el, imagens);
    try {
      return await rasterize(el);
    } finally {
      restaurar();
    }
  }, [rasterize]);


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
      const imagens = await preloadImages(idx);
      const canvas = await captureSlide(el, imagens);
      const link = document.createElement('a');
      // Nome pela fonte única (lib/export-filename.ts): o slide avulso e a
      // entrada do ZIP saem com o MESMO nome, numerado — sem o número, dois
      // slides baixariam com nome idêntico e um sobrescreveria o outro.
      link.download = nomeDoSlideDoCarrossel(carouselTitle, idx + 1);
      link.href = canvas.toDataURL('image/png');
      link.click();
      trackProductEvent('carousel_exported_single', {
        export_format: 'png',
        slide_count: slides.length,
      });
      toast.success('Slide baixado!', { id: 'export' });
    } catch (err) {
      console.error(err);
      // Imagem que não baixou tem mensagem própria: o ponto da blindagem é o
      // usuário saber POR QUE não saiu, em vez de descobrir abrindo o PNG.
      toast.error(
        err instanceof ExportImageError
          ? 'A exportação não saiu: uma imagem do carrossel não pôde ser carregada. Tente de novo.'
          : 'Erro ao exportar slide',
        { id: 'export', duration: 6000 }
      );
    }
  }, [slides, activeSlideIndex, captureSlide, preloadImages, carouselTitle]);

  const downloadAll = useCallback(async () => {
    toast.loading('Gerando ZIP...', { id: 'zip' });
    try {
      const { default: JSZip } = await import('jszip');
      const { saveAs } = await import('file-saver');
      const zip = new JSZip();
      // Baixa TUDO antes do primeiro slide: se faltar imagem, o ZIP nem começa
      // a ser montado. E o mapa é o mesmo para os N slides — a imagem que se
      // repete entre eles é baixada uma vez só.
      const imagens = await preloadImages();

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const el = exportRef.current.get(slide.id);
        if (!el) continue;
        const canvas = await captureSlide(el, imagens);
        const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
        zip.file(nomeDoSlideDoCarrossel(carouselTitle, i + 1), blob);
        toast.loading(`Processando slide ${i + 1} de ${slides.length}...`, { id: 'zip' });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, nomeDoZipDoCarrossel(carouselTitle));
      trackProductEvent('carousel_exported_all', {
        export_format: 'zip',
        slide_count: slides.length,
      });
      toast.success('ZIP baixado!', { id: 'zip' });
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof ExportImageError
          ? 'O ZIP não saiu: uma imagem do carrossel não pôde ser carregada. Tente de novo.'
          : 'Erro ao gerar ZIP',
        { id: 'zip', duration: 6000 }
      );
    }
  }, [slides, captureSlide, preloadImages, carouselTitle]);

  return { registerSlideRef, downloadSlide, downloadAll };
}
