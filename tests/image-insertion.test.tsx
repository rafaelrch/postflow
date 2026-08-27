// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { imagePatch } from '@/hooks/useGenerateCarouselImages';
import { useEditorStore } from '@/hooks/useEditorStore';
import { mapSlideToDbRow } from '@/lib/slide-mapper';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_IMAGE_POSITION,
  DEFAULT_SLIDE,
  Slide,
} from '@/types';

const uploadImageFile = vi.hoisted(() => vi.fn(async () => 'https://x/nova-imagem.png'));

vi.mock('@/lib/upload-image', () => ({ uploadImageFile }));

vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import EditorSidebar from '@/components/editor/EditorSidebar';

const slide = (): Slide => ({
  ...DEFAULT_SLIDE,
  id: 's',
  position: 0,
  backgroundImageUrl: '',
  gridImageUrl: '',
  contentImageUrl: '',
});

afterEach(cleanup);

describe('inserção de imagem preenchendo a moldura — estilos genéricos', () => {
  it('a geração por IA reinicia fundo e conteúdo em cover/100', () => {
    const base = slide();
    expect(imagePatch(base, 'minimalist', 0, 'background', 'u').imagePosition).toEqual(
      DEFAULT_IMAGE_POSITION
    );
    expect(imagePatch(base, 'editorial', 0, 'content', 'u').contentImagePosition).toEqual(
      DEFAULT_IMAGE_POSITION
    );
  });

  it('o upload manual aplica o mesmo enquadramento nos dois destinos', async () => {
    useEditorStore.setState({
      slides: [slide()],
      activeSlideIndex: 0,
      style: 'minimalist',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    const { container } = render(
      <EditorSidebar
        onOpenWizard={vi.fn()}
        onDownloadSlide={vi.fn()}
        onDownloadAll={vi.fn()}
      />
    );
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const file = new File(['x'], 'foto.png', { type: 'image/png' });

    fireEvent.change(inputs[0], { target: { files: [file] } });
    await waitFor(() =>
      expect(useEditorStore.getState().slides[0].imagePosition).toEqual(DEFAULT_IMAGE_POSITION)
    );
    expect(useEditorStore.getState().slides[0].backgroundImageUrl).toBe(
      'https://x/nova-imagem.png'
    );
    expect(useEditorStore.getState().slides[0].gridImageUrl).toBe('https://x/nova-imagem.png');
    expect(mapSlideToDbRow(useEditorStore.getState().slides[0], 'carousel', 0)).toMatchObject({
      background_image_url: 'https://x/nova-imagem.png',
      grid_image_url: 'https://x/nova-imagem.png',
    });

    fireEvent.change(inputs[1], { target: { files: [file] } });
    await waitFor(() =>
      expect(useEditorStore.getState().slides[0].contentImagePosition).toEqual(
        DEFAULT_IMAGE_POSITION
      )
    );
    expect(useEditorStore.getState().slides[0].contentImageUrl).toBe(
      'https://x/nova-imagem.png'
    );
    expect(mapSlideToDbRow(useEditorStore.getState().slides[0], 'carousel', 0)).toMatchObject({
      content_image_url: 'https://x/nova-imagem.png',
    });
    expect(uploadImageFile).toHaveBeenCalledWith(file, 'slide-images');
  });
});
