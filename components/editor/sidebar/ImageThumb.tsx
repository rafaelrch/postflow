'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';

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
        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
