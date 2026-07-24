import { describe, expect, it } from 'vitest';
import {
  validateVideoMeta,
  isAllowedVideoMime,
  extForMime,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SEC,
  MAX_VIDEO_DIMENSION,
} from '../lib/reels-media';

const OK_SIZE = 5 * 1024 * 1024; // 5MB

describe('reels-media — MIME aceito/rejeitado', () => {
  it('aceita MP4 e WebM', () => {
    expect(isAllowedVideoMime('video/mp4')).toBe(true);
    expect(isAllowedVideoMime('video/webm')).toBe(true);
    expect(validateVideoMeta({ mime: 'video/mp4', sizeBytes: OK_SIZE }).ok).toBe(true);
    expect(validateVideoMeta({ mime: 'video/webm', sizeBytes: OK_SIZE }).ok).toBe(true);
  });

  it('é case-insensitive no MIME', () => {
    expect(validateVideoMeta({ mime: 'VIDEO/MP4', sizeBytes: OK_SIZE }).ok).toBe(true);
  });

  it('REJEITA imagem estática (png/jpg/jpeg/webp/gif) com mensagem de imagem', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']) {
      const r = validateVideoMeta({ mime, sizeBytes: OK_SIZE });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('mime');
      expect(r.error).toMatch(/imagens?/i);
    }
  });

  it('REJEITA MOV (video/quicktime) com mensagem específica', () => {
    const r = validateVideoMeta({ mime: 'video/quicktime', sizeBytes: OK_SIZE });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('mime');
    expect(r.error).toMatch(/MOV/);
  });

  it('REJEITA MIME vazio/desconhecido', () => {
    expect(validateVideoMeta({ mime: '', sizeBytes: OK_SIZE }).ok).toBe(false);
    expect(validateVideoMeta({ mime: 'application/octet-stream', sizeBytes: OK_SIZE }).ok).toBe(false);
  });
});

describe('reels-media — caps de tamanho/duração/dimensões', () => {
  it('REJEITA acima do tamanho máximo', () => {
    const r = validateVideoMeta({ mime: 'video/mp4', sizeBytes: MAX_VIDEO_BYTES + 1 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('size');
  });

  it('REJEITA arquivo vazio (0 bytes)', () => {
    expect(validateVideoMeta({ mime: 'video/mp4', sizeBytes: 0 }).ok).toBe(false);
  });

  it('REJEITA acima da duração máxima', () => {
    const r = validateVideoMeta({
      mime: 'video/mp4',
      sizeBytes: OK_SIZE,
      durationSec: MAX_VIDEO_DURATION_SEC + 0.5,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('duration');
  });

  it('REJEITA acima de 1080p (lado maior > 1920)', () => {
    expect(
      validateVideoMeta({ mime: 'video/mp4', sizeBytes: OK_SIZE, width: MAX_VIDEO_DIMENSION + 1, height: 1080 }).code,
    ).toBe('dimensions');
    expect(
      validateVideoMeta({ mime: 'video/mp4', sizeBytes: OK_SIZE, width: 1080, height: MAX_VIDEO_DIMENSION + 1 }).code,
    ).toBe('dimensions');
  });

  it('ACEITA no limite exato (60s, 1080x1920, tamanho máximo)', () => {
    const r = validateVideoMeta({
      mime: 'video/mp4',
      sizeBytes: MAX_VIDEO_BYTES,
      durationSec: MAX_VIDEO_DURATION_SEC,
      width: 1080,
      height: MAX_VIDEO_DIMENSION,
    });
    expect(r.ok).toBe(true);
  });

  it('sem duração/dimensões (servidor), valida só MIME + tamanho', () => {
    expect(validateVideoMeta({ mime: 'video/mp4', sizeBytes: OK_SIZE }).ok).toBe(true);
  });
});

describe('reels-media — extForMime', () => {
  it('mapeia o MIME para a extensão certa', () => {
    expect(extForMime('video/mp4')).toBe('mp4');
    expect(extForMime('video/webm')).toBe('webm');
  });
});
