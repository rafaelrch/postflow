import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, type NewsCardItem } from '@/components/news/NewsCard';
import { newsEntryPayload, sanitizeNewsPayload } from '@/lib/news-persistence';

const newsPageSource = readFileSync(
  new URL('../app/(app)/news/page.tsx', import.meta.url),
  'utf8'
);

function card(patch: Partial<NewsCardItem> = {}): NewsCardItem {
  return {
    numero: 1,
    tema: 'Tema',
    titulo_card: 'Título',
    imagem_url: '',
    legenda: 'Legenda',
    ...DEFAULT_STYLE,
    ...patch,
  };
}

describe('persistência dos uploads de Notícias', () => {
  it('grava URLs permanentes da imagem principal e do inset no payload persistido', () => {
    const row = newsEntryPayload(card({
      imagem_url: 'https://storage.example/main.png',
      inset_image_url: 'https://storage.example/inset.png',
      inset_enabled: true,
    }), 'batch-1');
    const rawPayload = row.raw_payload as Record<string, unknown>;

    expect(row.image_url).toBe('https://storage.example/main.png');
    expect(rawPayload.imagem_url).toBe('https://storage.example/main.png');
    expect(rawPayload.inset_image_url).toBe('https://storage.example/inset.png');
    expect(rawPayload.batch_id).toBe('batch-1');
  });

  it('não deixa blobs locais chegarem aos campos persistidos', () => {
    const item = card({
      imagem_url: 'blob:main',
      inset_image_url: 'blob:inset',
      localImageUrl: 'blob:legacy',
    });
    const row = newsEntryPayload(item);

    expect(sanitizeNewsPayload(item)).not.toHaveProperty('imagem_url');
    expect(sanitizeNewsPayload(item)).not.toHaveProperty('inset_image_url');
    expect(row.image_url).toBe('');
    expect(row.raw_payload).not.toHaveProperty('imagem_url');
    expect(row.raw_payload).not.toHaveProperty('inset_image_url');
  });

  it('usa uploadImageFile e aplica o retorno permanente nos dois campos do fluxo', () => {
    expect(newsPageSource).toContain("import { uploadImageFile } from '@/lib/upload-image';");
    expect(newsPageSource).toContain("uploadImageFile(file, 'news-images')");
    expect(newsPageSource).toContain("uploadImageFile(file, 'news-insets')");
    expect(newsPageSource).toContain('updateItem(idx, { imagem_url: permanentUrl');
    expect(newsPageSource).toContain('updateItem(idx, { inset_image_url: permanentUrl');
    expect(newsPageSource).toContain('setUploadingImageIdx');
    expect(newsPageSource).toContain('setUploadingInsetIdx');
    expect(newsPageSource).toContain('Falha no upload da imagem');
    expect(newsPageSource).toContain('Falha no upload da imagem circular');
    expect(newsPageSource).toContain('updateItem(selectedIdx, { imagem_url: \'\', localImageUrl: undefined })');
    expect(newsPageSource).toContain('updateItem(selectedIdx, { inset_image_url: undefined, inset_enabled: false })');
  });
});
