'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CrosshairIcon, MoveIcon, RotateCwIcon, ZoomInIcon } from '@hugeicons/core-free-icons';
import {
  EXPORT_SIZE,
  IDENTITY_CROP,
  MAX_ZOOM,
  MIN_ZOOM,
  clampOffset,
  drawCrop,
  type CropState,
} from '@/lib/photo-crop';

type Props = { file: File; onCancel: () => void; onConfirm: (file: File) => void };

/**
 * A prévia é um CANVAS, não mais uma <img> com transform de CSS. O motivo é o
 * arrastar: com dois modelos de enquadramento (CSS na prévia, aritmética no
 * export) o deslocamento sairia diferente do que se vê. Agora os dois chamam
 * `drawCrop` de lib/photo-crop.ts com o mesmo estado — só muda o lado do
 * quadrado. Ver o comentário de cabeçalho de lib/photo-crop.ts.
 */
export default function PhotoEditor({ file, onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>(IDENTITY_CROP);
  /** Lado do quadrado na tela, em px CSS. Converte arraste em deslocamento. */
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => setImage(element);
    element.src = url;
    setCrop(IDENTITY_CROP);
    return () => {
      element.onload = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // O quadrado é fluido (encolhe em janela baixa), então o lado vem do layout,
  // não de uma constante — é ele que converte px arrastados em deslocamento.
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const measure = () => setFrame(element.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || frame <= 0) return;
    const ratio = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 3);
    const side = Math.round(frame * ratio);
    if (canvas.width !== side) canvas.width = side;
    if (canvas.height !== side) canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) return;
    drawCrop(context, image, crop, side);
  }, [image, crop, frame]);

  /** Toda mudança passa pelo clamp: o limite depende de zoom E rotação. */
  const applyCrop = useCallback(
    (next: CropState) => {
      if (!image) return;
      setCrop({ ...next, ...clampOffset(next, image.naturalWidth, image.naturalHeight) });
    },
    [image],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start || frame <= 0) return;
    // Deslocamento em frações do lado do quadrado: o mesmo número serve para a
    // prévia (frame px) e para o export (640 px).
    applyCrop({
      ...crop,
      offsetX: crop.offsetX + (event.clientX - start.x) / frame,
      offsetY: crop.offsetY + (event.clientY - start.y) / frame,
    });
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const apply = async () => {
    if (!image) return;
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return;
    drawCrop(context, image, crop, EXPORT_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (blob) onConfirm(new File([blob], 'foto-perfil.jpg', { type: 'image/jpeg' }));
  };

  return (
    /* h-full: ocupa o cartão do wizard, que já tem altura definida. Quando nem
       o mínimo cabe, quem rola é o corpo do modal — nunca a página, e o editor
       não escapa da borda. */
    <div
      className="flex h-full min-h-[300px] flex-col rounded-xl p-4"
      style={{ border: '1px solid var(--border)', background: 'var(--paper-2)' }}
    >
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <p className="section-kicker">Ajuste a foto</p>
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
          <HugeiconsIcon icon={MoveIcon} size={14} strokeWidth={1.75} aria-hidden /> arraste para mover
        </span>
      </div>

      {/* O círculo é o herói, mas com teto: 27vh é o maior valor que ainda deixa
          título, sliders e botões caberem sem rolagem numa janela de 720px de
          altura (medido no portal: com 34vh sobravam 27px). Abaixo disso ele
          encolhe junto com a janela em vez de empurrar os controles para fora
          do modal; o piso de 132px impede que vire miniatura. */}
      <div className="grid min-h-0 flex-1 place-items-center py-3">
        <div
          className="relative overflow-hidden rounded-full"
          style={{
            width: 'min(100%, min(240px, 27vh))',
            minWidth: '132px',
            border: '2px solid var(--ink)',
            background: 'var(--paper)',
          }}
        >
          {/* aspect-square vive NO CANVAS, não na moldura: com ele na moldura a
              borda entrava na conta e o canvas saía 240.8x244.8 — retângulo.
              Canvas não-quadrado esticaria a prévia e ela deixaria de bater com
              o export, que é justamente o que lib/photo-crop.ts existe para
              impedir. Por isso a medida do arraste também sai daqui. */}
          <canvas
            ref={canvasRef}
            className="block aspect-square w-full cursor-grab touch-none select-none active:cursor-grabbing"
            aria-label="Prévia do recorte — arraste para mover a foto"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>
      </div>

      <div className="grid shrink-0 gap-2">
        <label className="flex items-center gap-2 text-xs">
          <HugeiconsIcon icon={ZoomInIcon} size={16} strokeWidth={1.75} aria-hidden className="shrink-0" /> Zoom
          <input
            aria-label="Zoom da foto"
            className="flex-1"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step="0.05"
            value={crop.zoom}
            onChange={(event) => applyCrop({ ...crop, zoom: Number(event.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <HugeiconsIcon icon={RotateCwIcon} size={16} strokeWidth={1.75} aria-hidden className="shrink-0" /> Rotação
          <input
            aria-label="Rotação da foto"
            className="flex-1"
            type="range"
            min="0"
            max="360"
            step="1"
            value={crop.rotation}
            onChange={(event) => applyCrop({ ...crop, rotation: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="brand-btn outline sm mr-auto inline-flex items-center gap-1.5"
          onClick={() => setCrop(IDENTITY_CROP)}
        >
          <HugeiconsIcon icon={CrosshairIcon} size={14} strokeWidth={1.75} aria-hidden /> Centralizar
        </button>
        <button type="button" className="brand-btn outline sm" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="brand-btn sm" onClick={apply} disabled={!image}>
          Usar esta foto
        </button>
      </div>
    </div>
  );
}
