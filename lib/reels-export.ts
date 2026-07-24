/**
 * Export do Reel — CLIENT-SIDE via ffmpeg.wasm -> MP4 (decisão fechada,
 * LOG 24/07). O card (cabeçalho + legenda) é rasterizado para PNG pelo caminho
 * html2canvas já usado no News Card; aqui o ffmpeg.wasm empilha esse PNG SOBRE
 * o vídeo enviado e devolve um MP4 postável (IG/TikTok aceitam MP4, não WebM).
 *
 * Composição (bloco header+vídeo CENTRADO VERTICALMENTE, sem transparência):
 *   ┌───────────────────────────┐
 *   │        (preto)            │  ← sobra preta = padY (igual em cima/baixo)
 *   ├───────────────────────────┤
 *   │  avatar · nome · legenda  │  ← header PNG (W × headerHeight)
 *   ├───────────────────────────┤
 *   │        vídeo (contain,    │  ← vídeo na proporção NATIVA (W × videoBoxH)
 *   │        proporção nativa)  │
 *   ├───────────────────────────┤
 *   │        (preto)            │  ← sobra preta = padY
 *   └───────────────────────────┘
 * A altura do BLOCO (header+vídeo) depende do vídeo nativo; o card 1080×1920 é
 * fixo e o bloco fica centrado (letterbox simétrico). PREVIEW e EXPORT usam a
 * MESMA `computeReelLayout` para baterem pixel a pixel.
 *
 * `computeReelLayout`/`buildFfmpegArgs` são PURAS (testáveis sem wasm).
 */

/** Card do Reel (fixo, Stories 9:16). */
export const REEL_CARD_WIDTH = 1080;
export const REEL_CARD_HEIGHT = 1920;

/** Arredonda para baixo até o par mais próximo (yuv420p exige dimensões pares). */
export function toEven(n: number): number {
  const v = Math.floor(n);
  return v % 2 === 0 ? v : v - 1;
}

export interface ReelLayout {
  /** Altura (par) do cabeçalho no espaço 1080. */
  headerHeight: number;
  /** Altura (par) da caixa do vídeo (vídeo em contain dentro de 1080×esta). */
  videoBoxHeight: number;
  /**
   * Sobra preta (par) EM CIMA do bloco. Sem offset é o letterbox simétrico
   * (centro); com offset é o centro deslocado e já clampado. A sobra de baixo é
   * `cardH - blockHeight - padY`.
   */
  padY: number;
  /** Altura do bloco = headerHeight + videoBoxHeight. */
  blockHeight: number;
  /**
   * Deslocamento vertical REALMENTE aplicado (par), já clampado ao espaço livre:
   * `padY - centroPadY`. O preview usa isto como `translateY` sobre o bloco
   * centrado; o export soma no y do pad. Assim preview e MP4 batem pixel a pixel.
   */
  offsetY: number;
}

/**
 * Layout compartilhado do Reel. Dado o cabeçalho medido e as dimensões NATIVAS
 * do vídeo, resolve a caixa do vídeo (ajuste-à-largura preservando a proporção
 * nativa, com clamp para caber na altura restante) e o padding vertical que
 * posiciona o bloco [header+vídeo] no card 1080×1920.
 *
 * Sem `offsetY` o bloco fica CENTRADO (letterbox simétrico). Com `offsetY`
 * (px no espaço 1080, + desce / − sobe) o centro é deslocado e CLAMPADO ao
 * espaço livre — o bloco nunca vaza cortando conteúdo (quando o vídeo já
 * preenche o card, o offset não tem efeito).
 */
export function computeReelLayout(input: {
  headerHeight: number;
  videoWidth?: number | null;
  videoHeight?: number | null;
  cardWidth?: number;
  cardHeight?: number;
  /** Deslocamento vertical pedido (px no espaço 1080; + desce / − sobe). */
  offsetY?: number;
  /**
   * Há vídeo no card? Default `true` (o export SEMPRE tem vídeo). Quando `false`
   * (estado vazio no preview, antes de subir vídeo), a caixa de vídeo é 0 e só o
   * cabeçalho é centrado — o perfil já nasce no centro, não colado no topo.
   */
  hasVideo?: boolean;
}): ReelLayout {
  const W = input.cardWidth ?? REEL_CARD_WIDTH;
  const cardH = input.cardHeight ?? REEL_CARD_HEIGHT;
  const HH = Math.min(toEven(Math.max(input.headerHeight, 0)), cardH);
  const avail = Math.max(cardH - HH, 0);
  const hasVideo = input.hasVideo ?? true;

  let VB: number;
  if (!hasVideo) {
    // Sem vídeo: a caixa é 0 e só o cabeçalho é centrado no card 9:16.
    VB = 0;
  } else if (input.videoWidth && input.videoHeight && input.videoWidth > 0 && input.videoHeight > 0) {
    // Ajuste-à-largura: altura = W * (nativeH/nativeW). Clamp na altura restante.
    const widthFitH = W * (input.videoHeight / input.videoWidth);
    VB = toEven(Math.min(widthFitH, avail));
  } else {
    // Vídeo presente, dimensões desconhecidas: preenche o restante (fallback).
    VB = toEven(avail);
  }

  const blockHeight = HH + VB;
  // Espaço livre total (preto) e a posição CENTRADA (letterbox simétrico).
  const room = Math.max(cardH - blockHeight, 0);
  const centerPadY = toEven(room / 2);
  // Aplica o offset sobre o centro e clampa em [0, room] — nunca corta conteúdo.
  const requested = toEven(input.offsetY ?? 0);
  const padY = Math.min(Math.max(centerPadY + requested, 0), room);
  const offsetY = padY - centerPadY;
  return { headerHeight: HH, videoBoxHeight: VB, padY, blockHeight, offsetY };
}

export interface FfmpegArgsInput {
  /** Largura do card (1080). Deve ser par. */
  width: number;
  /** Altura do card (1920). Deve ser par. */
  cardHeight: number;
  /** Altura da faixa do cabeçalho (PNG). Deve ser par. */
  headerHeight: number;
  /** Altura da caixa do vídeo. Deve ser par. */
  videoBoxHeight: number;
  /** Sobra preta em cima/embaixo (letterbox simétrico). Deve ser par. */
  padY: number;
  /** Sem áudio no export quando true (mute on). */
  muted: boolean;
  /** Nome do arquivo de vídeo escrito no FS virtual do ffmpeg. */
  inputName: string;
  /** Nome do PNG do cabeçalho no FS virtual. */
  headerName: string;
  /** Nome do arquivo de saída. */
  outputName: string;
}

/**
 * Monta os argumentos do ffmpeg. O vídeo (input 0) é escalado com
 * `force_original_aspect_ratio=decrease` (contain, nunca deforma) para dentro da
 * caixa W×videoBoxHeight e centrado nela. O cabeçalho (input 1) é a faixa de
 * cima. `vstack` junta os dois e o `pad` final centraliza o bloco no card
 * 1080×1920 com sobra preta IGUAL em cima e embaixo (padY) — igual ao preview.
 */
export function buildFfmpegArgs(input: FfmpegArgsInput): string[] {
  const W = toEven(input.width);
  const CH = toEven(input.cardHeight);
  const HH = toEven(input.headerHeight);
  const VB = toEven(input.videoBoxHeight);
  const PADY = toEven(input.padY);

  const filter =
    `[1:v]scale=${W}:${HH},setsar=1[hdr];` +
    `[0:v]scale=${W}:${VB}:force_original_aspect_ratio=decrease,` +
    `pad=${W}:${VB}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[vid];` +
    `[hdr][vid]vstack=inputs=2[stacked];` +
    `[stacked]pad=${W}:${CH}:0:${PADY}:color=black[outv]`;

  const args = [
    '-i', input.inputName,
    '-i', input.headerName,
    '-filter_complex', filter,
    '-map', '[outv]',
  ];

  if (input.muted) {
    args.push('-an');
  } else {
    // `?` = o stream de áudio é opcional (vídeo sem áudio não quebra o encode).
    args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '128k');
  }

  args.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
    '-shortest',
    '-y', input.outputName,
  );

  return args;
}

/**
 * Sanitiza o nome escolhido pelo usuário no modal de download e garante o
 * sufixo .mp4. Remove tudo que não seja letra/número/espaço/-/_, colapsa
 * espaços em hífen e cai em "reel" quando sobra vazio.
 */
export function sanitizeReelFilename(name: string | undefined): string {
  const base = (name || '').trim().replace(/\.mp4$/i, '');
  const cleaned = base
    .replace(/[^a-zA-Z0-9\-_ ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${cleaned || 'reel'}.mp4`;
}

// ── ffmpeg.wasm runtime ───────────────────────────────────────────────────────

/** Base do core do ffmpeg.wasm (single-thread). Sem segredo — CDN público. */
const FFMPEG_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

// Import dinâmico: mantém os ~25MB do wasm fora do bundle inicial e só carrega
// quando o usuário realmente exporta.
type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg;
let ffmpegSingleton: FFmpegInstance | null = null;

// Callback de progresso do export atual. Registramos o listener `on('progress')`
// UMA vez (na criação do singleton) e trocamos só a referência — assim a barra é
// fiel e não acumula handlers a cada export.
let progressCb: ((ratio: number) => void) | null = null;

async function getFFmpeg(): Promise<FFmpegInstance> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');

  if (!ffmpegSingleton) {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress }: { progress: number }) => {
      progressCb?.(Math.min(Math.max(progress, 0), 1));
    });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegSingleton = ffmpeg;
  }
  return ffmpegSingleton;
}

export interface ComposeReelInput {
  /** Vídeo enviado pelo usuário (mp4/webm). */
  videoBlob: Blob;
  /** Extensão do vídeo ("mp4" | "webm") para nomear o arquivo virtual. */
  videoExt: string;
  /** PNG do cabeçalho renderizado (html2canvas -> toBlob). */
  headerPng: Blob;
  /** Altura do cabeçalho rasterizado (px no espaço 1080). */
  headerHeight: number;
  /** Dimensões NATIVAS do vídeo (para o layout bater com o preview). */
  videoWidth?: number | null;
  videoHeight?: number | null;
  /** Deslocamento vertical do bloco (px 1080; + desce / − sobe) — igual ao preview. */
  offsetY?: number;
  muted: boolean;
  onProgress?: (ratio: number) => void;
}

/**
 * Roda o encode e devolve o MP4 final como Blob. O caller baixa via file-saver.
 * O layout (bloco centrado verticalmente, letterbox simétrico) sai da MESMA
 * `computeReelLayout` usada no preview — preview e export batem pixel a pixel.
 */
export async function composeReelVideo(input: ComposeReelInput): Promise<Blob> {
  const { fetchFile } = await import('@ffmpeg/util');
  // Barra fiel: o listener já está registrado no singleton; aqui só apontamos
  // o callback do export atual (e zeramos no fim).
  progressCb = input.onProgress ?? null;
  const ffmpeg = await getFFmpeg();

  const inputName = `input.${input.videoExt === 'webm' ? 'webm' : 'mp4'}`;
  const headerName = 'header.png';
  const outputName = 'reel.mp4';

  const layout = computeReelLayout({
    headerHeight: input.headerHeight,
    videoWidth: input.videoWidth,
    videoHeight: input.videoHeight,
    offsetY: input.offsetY,
  });
  if (layout.videoBoxHeight < 2) {
    throw new Error('Legenda muito longa para 9:16. Encurte o texto.');
  }

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(input.videoBlob));
    await ffmpeg.writeFile(headerName, await fetchFile(input.headerPng));

    const args = buildFfmpegArgs({
      width: REEL_CARD_WIDTH,
      cardHeight: REEL_CARD_HEIGHT,
      headerHeight: layout.headerHeight,
      videoBoxHeight: layout.videoBoxHeight,
      padY: layout.padY,
      muted: input.muted,
      inputName,
      headerName,
      outputName,
    });

    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(outputName);
    // readFile devolve Uint8Array (modo binário). Copiamos para um ArrayBuffer
    // "puro" para o Blob, evitando prender o heap do wasm.
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const buffer = bytes.slice().buffer;

    // Garante 100% ao terminar (o ffmpeg nem sempre emite o ratio final exato).
    input.onProgress?.(1);

    // Limpeza best-effort do FS virtual (não bloqueia o retorno).
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(headerName);
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* limpeza não é crítica */
    }

    return new Blob([buffer], { type: 'video/mp4' });
  } finally {
    progressCb = null;
  }
}
