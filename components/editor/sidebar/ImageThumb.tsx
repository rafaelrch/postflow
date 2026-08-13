'use client';

import { X } from 'lucide-react';

/** Miniatura da imagem anexada, com X para remover. */
export default function ImageThumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="relative w-full h-24 rounded-lg overflow-hidden border border-[var(--line-strong)] bg-black/5 dark:bg-white/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Imagem anexada" className="w-full h-full object-cover" />
      <button
        onClick={onRemove}
        title="Remover imagem"
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white/80 hover:text-white flex items-center justify-center transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
