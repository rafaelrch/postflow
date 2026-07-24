/**
 * Validação de mídia dos Reels — regras fechadas pelo Orquestrador (LOG 24/07):
 *   - ACEITA apenas vídeo MP4 e WebM.
 *   - BLOQUEIA imagem estática (png/jpg/jpeg/webp/gif) e MOV (playback só Safari).
 *   - Caps para manter o export via ffmpeg.wasm tratável no browser:
 *       duração <= 60s, dimensões <= 1080p (lado maior 1920), tamanho <= 100MB.
 *
 * Funções PURAS e sem DOM — chamadas tanto no cliente (antes do upload direto
 * pro Storage) quanto no servidor (rota da signed URL). Mesma fonte de verdade.
 */

export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm'] as const;
export type AllowedVideoMime = (typeof ALLOWED_VIDEO_MIME)[number];

/** Extensões aceitas, na mesma ordem dos MIMEs acima. */
export const ALLOWED_VIDEO_EXT = ['mp4', 'webm'] as const;

/** Tamanho máximo do arquivo (100 MB). */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Duração máxima do vídeo em segundos. */
export const MAX_VIDEO_DURATION_SEC = 60;

/**
 * Lado MAIOR máximo em pixels. "1080p" = 1920x1080; um Reel vertical é
 * 1080x1920. Em ambos o lado maior é 1920, então esse é o teto por dimensão.
 */
export const MAX_VIDEO_DIMENSION = 1920;

export interface VideoMeta {
  mime: string;
  sizeBytes: number;
  /** Opcionais: só o cliente consegue medir (via elemento <video>). */
  durationSec?: number;
  width?: number;
  height?: number;
}

export interface ValidationResult {
  ok: boolean;
  /** Código estável para teste/telemetria. */
  code?:
    | 'mime'
    | 'size'
    | 'duration'
    | 'dimensions';
  /** Mensagem pronta para o usuário (pt-BR). */
  error?: string;
}

export function isAllowedVideoMime(mime: string | undefined | null): mime is AllowedVideoMime {
  return !!mime && (ALLOWED_VIDEO_MIME as readonly string[]).includes(mime.toLowerCase());
}

/**
 * Valida o que dá para validar sem tocar no DOM. `durationSec`/`width`/`height`
 * são opcionais: quando ausentes (ex.: no servidor, só com o MIME e o tamanho),
 * apenas MIME e tamanho são checados — o cliente completa a checagem de duração
 * e dimensões antes de disparar o upload.
 */
export function validateVideoMeta(meta: VideoMeta): ValidationResult {
  const mime = (meta.mime || '').toLowerCase();

  if (!isAllowedVideoMime(mime)) {
    // Mensagem específica para os casos mais prováveis de erro do usuário.
    if (mime.startsWith('image/')) {
      return { ok: false, code: 'mime', error: 'Envie um vídeo (MP4 ou WebM). Imagens não são aceitas aqui.' };
    }
    if (mime === 'video/quicktime') {
      return { ok: false, code: 'mime', error: 'MOV não é suportado. Converta para MP4 ou WebM antes de enviar.' };
    }
    return { ok: false, code: 'mime', error: 'Formato inválido. Aceita apenas vídeo MP4 ou WebM.' };
  }

  if (!(meta.sizeBytes > 0) || meta.sizeBytes > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      code: 'size',
      error: `Vídeo muito grande. Máximo ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB.`,
    };
  }

  if (typeof meta.durationSec === 'number' && meta.durationSec > MAX_VIDEO_DURATION_SEC) {
    return {
      ok: false,
      code: 'duration',
      error: `Vídeo muito longo. Máximo ${MAX_VIDEO_DURATION_SEC}s.`,
    };
  }

  if (
    (typeof meta.width === 'number' && meta.width > MAX_VIDEO_DIMENSION) ||
    (typeof meta.height === 'number' && meta.height > MAX_VIDEO_DIMENSION)
  ) {
    return {
      ok: false,
      code: 'dimensions',
      error: 'Resolução acima de 1080p. Reduza o vídeo antes de enviar.',
    };
  }

  return { ok: true };
}

/** Deriva a extensão do arquivo a partir do MIME aceito. */
export function extForMime(mime: AllowedVideoMime): string {
  return mime === 'video/webm' ? 'webm' : 'mp4';
}
