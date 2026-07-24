import type { SlideFormat } from '@/types';

/**
 * Formato FIXO do template de Reels: Stories 9:16 (decisão do Rafael pós teste
 * manual v1). Diferente do carrossel/News (ETAPA 2), o Reel não tem seletor de
 * formato — é sempre 9:16.
 */
export const REEL_FORMAT: SlideFormat = '9:16';

/**
 * O handle é guardado e renderizado SEM o "@" (o "@" é prefixado só na hora de
 * exibir). Isto evita o "@@" quando o valor já vem com "@" do perfil/input.
 */
export function stripHandle(handle: string | undefined): string {
  return (handle || '').replace(/^@+/, '').trim();
}

/**
 * Formata a duração do vídeo (segundos) como "m:ss" para o selinho do card na
 * lista. Retorna '' quando não há duração conhecida (esconde o selo).
 */
export function formatReelDuration(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Modelo de dados de um Reel (card estilo NOT JOURNAL com vídeo).
 *
 * ESCOPO TRAVADO (LOG 24/07 — Rafael): os ÚNICOS campos editáveis são
 * avatar/foto, nome, @handle, legenda, o vídeo e o mute on/off. O formato NÃO é
 * editável: o template é FIXO em 9:16 (ver `REEL_FORMAT` acima), sem o seletor
 * 4:5/1:1/9:16 da ETAPA 2. Nada de zoom, positionX/Y, rotação, trim, poster,
 * volume ou customHeight.
 */
export interface ReelData {
  /** id da linha em `reels` quando o reel está salvo no Supabase. */
  dbId?: string;
  /** Nome exibido no cabeçalho (ex.: "NOT JOURNAL"). */
  name: string;
  /** @handle exibido abaixo do nome, sem o "@" (ex.: "notjournal.ai"). */
  handle: string;
  /** Legenda/texto do card, com padding horizontal (acima do vídeo). */
  caption: string;
  /** URL do avatar circular (público/assinado ou blob local em edição). */
  avatarUrl?: string;
  /** Selo de verificado azul ao lado do nome. */
  verified: boolean;
  /** Formato/proporção do CARD (não do vídeo). Reusa lib/formats.ts. */
  format: SlideFormat;
  /** Áudio do vídeo no export: true = sem som (`-an`). */
  muted: boolean;
  /**
   * Deslocamento vertical do bloco [header+vídeo] dentro do card 9:16, em px no
   * espaço 1080 (+ desce / − sobe). 0 = centrado (letterbox simétrico). O valor
   * é clampado ao espaço preto livre no layout — nunca corta conteúdo. Preview e
   * export usam o MESMO valor (via `computeReelLayout`).
   */
  contentOffsetY: number;

  // ── Vídeo enviado ──────────────────────────────────────────────────────────
  /** URL tocável do vídeo (blob local em edição, ou signed/public URL). */
  videoUrl?: string;
  /** Caminho no Storage (`${userId}/...`) — o que é persistido, não a URL. */
  videoPath?: string;
  /** MIME do vídeo (video/mp4 | video/webm). */
  videoMime?: string;
  /** Dimensões e duração nativas — usadas nos caps e no export. */
  videoWidth?: number;
  videoHeight?: number;
  videoDurationSec?: number;
  videoSizeBytes?: number;
}

export const DEFAULT_REEL: ReelData = {
  name: '',
  handle: '',
  caption: '',
  avatarUrl: undefined,
  verified: true,
  format: REEL_FORMAT,
  muted: false,
  contentOffsetY: 0,
  videoUrl: undefined,
  videoPath: undefined,
  videoMime: undefined,
  videoWidth: undefined,
  videoHeight: undefined,
  videoDurationSec: undefined,
  videoSizeBytes: undefined,
};
