'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCw, ZoomIn } from 'lucide-react';

type Props = { file: File; onCancel: () => void; onConfirm: (file: File) => void };

export default function PhotoEditor({ file, onCancel, onConfirm }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const apply = async () => {
    const image = imageRef.current;
    if (!image) return;
    const size = 640;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.translate(size / 2, size / 2);
    context.rotate((rotation * Math.PI) / 180);
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
    context.drawImage(image, -image.naturalWidth * scale / 2, -image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (blob) onConfirm(new File([blob], 'foto-perfil.jpg', { type: 'image/jpeg' }));
  };

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--paper-2)' }}>
      <p className="section-kicker mb-3">Ajuste a foto</p>
      <div className="mx-auto relative w-44 h-44 overflow-hidden rounded-full" style={{ border: '2px solid var(--ink)' }}>
        {preview && <img ref={imageRef} src={preview} alt="Prévia para recorte" className="w-full h-full object-cover" style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }} />}
      </div>
      <div className="mt-4 grid gap-3">
        <label className="text-xs flex items-center gap-2"><ZoomIn className="w-4 h-4" /> Zoom
          <input aria-label="Zoom da foto" className="flex-1" type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <label className="text-xs flex items-center gap-2"><RotateCw className="w-4 h-4" /> Rotação
          <input aria-label="Rotação da foto" className="flex-1" type="range" min="0" max="360" step="1" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} />
        </label>
      </div>
      <div className="mt-4 flex gap-2 justify-end">
        <button type="button" className="brand-btn outline sm" onClick={onCancel}>Cancelar</button>
        <button type="button" className="brand-btn sm" onClick={apply}>Usar esta foto</button>
      </div>
    </div>
  );
}
