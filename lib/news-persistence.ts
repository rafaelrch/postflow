import type { NewsCardItem } from '@/components/news/NewsCard';

/**
 * Payload comum a insert, salvar manual e sincronização debounced dos cards.
 * Imagens de arquivo só entram depois de virarem URLs permanentes do Storage;
 * qualquer blob residual é descartado para nunca sobreviver a um reload.
 */
export function sanitizeNewsPayload(item: NewsCardItem): Record<string, unknown> {
  const { dbId: _dbId, localImageUrl: _local, ...rest } = item;
  const payload = { ...rest } as Record<string, unknown>;

  for (const field of ['imagem_url', 'inset_image_url']) {
    if (typeof payload[field] === 'string' && payload[field].startsWith('blob:')) {
      delete payload[field];
    }
  }

  return payload;
}

export function newsEntryPayload(item: NewsCardItem, batchId?: string | null): Record<string, unknown> {
  const sanitized = sanitizeNewsPayload(item);
  const imageUrl = typeof sanitized.imagem_url === 'string' ? sanitized.imagem_url : '';

  return {
    title: item.titulo_card || '',
    topic: item.tema || '',
    image_url: imageUrl,
    caption: item.legenda || '',
    status: 'draft',
    raw_payload: {
      ...(batchId ? { batch_id: batchId } : {}),
      ...sanitized,
    },
  };
}
