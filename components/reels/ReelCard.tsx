'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ReelData } from '@/lib/reels';
import { stripHandle } from '@/lib/reels';
import { getFormat } from '@/lib/formats';
import { computeReelLayout } from '@/lib/reels-export';

/**
 * Card de Reel estilo NOT JOURNAL (referência docs/reels-reference/
 * notjournal-template.png). Análogo direto do NewsCard, reusando o mesmo padrão
 * de avatar circular, tipografia e captura via html2canvas.
 *
 * LAYOUT (travado por Rafael):
 *   - Cabeçalho (avatar + nome + @handle, sem selo) e legenda COM padding
 *     horizontal.
 *   - Bloco de vídeo FULL-BLEED: 100% da largura, começa na borda (sem o padding
 *     do cabeçalho), fundo preto, sem borda/radius/shadow, overflow hidden,
 *     na proporção NATIVA do vídeo (object-fit: contain). Nunca deforma.
 *   - O BLOCO [header + vídeo] fica CENTRADO VERTICALMENTE no card 9:16, com a
 *     sobra preta IGUAL em cima e embaixo (letterbox simétrico). A altura da
 *     caixa do vídeo vem de `computeReelLayout` (a MESMA do export), então
 *     preview e MP4 batem pixel a pixel.
 *
 * O cabeçalho tem altura natural; medimos essa altura (offsetHeight, que não
 * sofre com o `transform: scale`) para calcular a caixa do vídeo e o padding.
 */

/** Largura base do card — igual ao NewsCard e à fonte única lib/formats.ts. */
export const REEL_WIDTH = 1080;

const PADDING_X = 52;
const AVATAR_SIZE = 132;
const AVATAR_TEXT_GAP = 24;
const NAME_FONT = 42;
const HANDLE_FONT = 34;

// Alturas fixas do cabeçalho (mesma solução do ProfileSlide do carrossel Twitter):
// o html2canvas NÃO centraliza flex vertical igual ao browser, então a coluna
// nome+@handle é posicionada por offset absoluto calculado — e cada linha tem
// HEIGHT + lineHeight explícitos, para o avatar e o texto baterem pixel a pixel
// no PNG exportado. Sem selo de verificado (removido a pedido do Rafael), o
// alinhamento é trivial: avatar à esquerda + [nome / @handle] centrados nele.
const NAME_ROW_H = Math.round(NAME_FONT * 1.15); // linha do nome
const HANDLE_GAP = 6;
const HANDLE_ROW_H = Math.round(HANDLE_FONT * 1.2); // linha do @handle
const TEXT_BLOCK_H = NAME_ROW_H + HANDLE_GAP + HANDLE_ROW_H;
// Top que centraliza a coluna de texto na altura do avatar.
const TEXT_PAD_TOP = Math.max(0, Math.round((AVATAR_SIZE - TEXT_BLOCK_H) / 2));

/** Placeholder de legenda no PREVIEW (nunca vai pro MP4 exportado). */
const CAPTION_PLACEHOLDER = 'Insira aqui o texto do seu conteúdo';

interface ReelCardProps {
  reel: ReelData;
  /** Escala de preview. 1 = 1080px de largura. */
  scale?: number;
  /**
   * `ref` no NÓ DO CABEÇALHO (não no card inteiro) — é essa faixa que o export
   * rasteriza para PNG antes do overlay via ffmpeg.
   */
  headerRef?: React.Ref<HTMLDivElement>;
  /** `ref` no elemento <video>, para controlar play/pause/mute no editor. */
  videoRef?: React.Ref<HTMLVideoElement>;
  /** No export não renderizamos o <video> (o ffmpeg cuida do vídeo). */
  hideVideo?: boolean;
  /** data-testid opcional para o card raiz. */
  testId?: string;
}

const ReelCard = React.forwardRef<HTMLDivElement, ReelCardProps>(function ReelCard(
  { reel, scale = 1, headerRef, videoRef, hideVideo = false, testId },
  ref,
) {
  const fmt = getFormat(reel.format);

  // Mede a altura natural do cabeçalho (offsetHeight = espaço 1080, imune ao
  // transform:scale). Com ela + as dimensões nativas do vídeo, o layout do
  // preview é o MESMO do export (computeReelLayout).
  const innerHeaderRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(0);

  const setHeaderRef = useCallback(
    (node: HTMLDivElement | null) => {
      innerHeaderRef.current = node;
      if (typeof headerRef === 'function') headerRef(node);
      else if (headerRef) (headerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [headerRef],
  );

  useLayoutEffect(() => {
    const node = innerHeaderRef.current;
    if (!node) return;
    const measure = () => setHeaderH(node.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [reel.name, reel.handle, reel.caption, reel.avatarUrl]);

  // Há vídeo neste card? Sem vídeo (reel novo), o layout centra só o cabeçalho —
  // o perfil já nasce no centro em vez de colado no topo. O card escondido do
  // export mantém `videoUrl`, então lá `hasVideo` é true e o layout usa as dims.
  const hasVideo = Boolean(reel.videoUrl);

  const layout = computeReelLayout({
    headerHeight: headerH,
    videoWidth: reel.videoWidth,
    videoHeight: reel.videoHeight,
    cardHeight: fmt.height,
    offsetY: reel.contentOffsetY,
    hasVideo,
  });

  return (
    <div
      ref={ref}
      data-testid={testId}
      data-reel-card
      data-format={fmt.id}
      style={{
        position: 'relative',
        width: REEL_WIDTH,
        height: fmt.height,
        overflow: 'hidden',
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        // Bloco [header + vídeo] CENTRADO VERTICALMENTE — sobra preta igual em
        // cima e embaixo. `stretch` mantém header e vídeo full-width (centrado
        // horizontalmente, sem offset).
        justifyContent: 'center',
        alignItems: 'stretch',
        flexShrink: 0,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
      }}
    >
      {/* ── Bloco [header + vídeo] — centrado verticalmente e então DESLOCADO
          pelo offset (translateY). O card centraliza; o translate move sobre o
          centro. layout.offsetY já vem clampado (nunca corta conteúdo) e é o
          MESMO valor que o export soma no y do pad — preview == MP4. ── */}
      <div
        data-reel-block
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          transform: layout.offsetY ? `translateY(${layout.offsetY}px)` : undefined,
        }}
      >
        {/* ── Cabeçalho + legenda (COM padding horizontal) — faixa capturada ── */}
        <div
          ref={setHeaderRef}
          data-reel-header
          style={{
            padding: `${PADDING_X}px ${PADDING_X}px ${Math.round(PADDING_X * 0.7)}px`,
            background: '#000000',
            flexShrink: 0,
          }}
        >
          {/* Avatar + nome + @handle (sem selo).
              Posições ABSOLUTAS em px (sem centralização flex vertical), para o
              html2canvas rasterizar igual ao preview — mesmo padrão do
              ProfileSlide (Twitter/X) do carrossel. */}
          <div style={{ position: 'relative', height: AVATAR_SIZE }}>
            {/* Avatar via background-image (o html2canvas trata melhor que
                objectFit em <img>). */}
            <div
              data-reel-avatar
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#1a1a1a',
                backgroundImage: reel.avatarUrl ? `url(${reel.avatarUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />

            {/* Coluna nome+@handle — top fixo que a centraliza no avatar. */}
            <div
              data-reel-textcol
              style={{ position: 'absolute', left: AVATAR_SIZE + AVATAR_TEXT_GAP, top: TEXT_PAD_TOP }}
            >
              {/* Linha do nome: height + lineHeight explícitos => bate pixel a
                  pixel no html2canvas. */}
              <div
                data-reel-namerow
                style={{ display: 'flex', alignItems: 'center', height: NAME_ROW_H }}
              >
                <span
                  style={{
                    color: '#ffffff',
                    fontFamily: "'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif",
                    fontWeight: 700,
                    fontSize: NAME_FONT,
                    lineHeight: `${NAME_ROW_H}px`,
                    letterSpacing: '0.2px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {reel.name || 'Seu nome'}
                </span>
              </div>

              {/* Linha do @handle: block com height + lineHeight explícitos. */}
              <span
                style={{
                  display: 'block',
                  marginTop: HANDLE_GAP,
                  height: HANDLE_ROW_H,
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: "'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif",
                  fontWeight: 400,
                  fontSize: HANDLE_FONT,
                  lineHeight: `${HANDLE_ROW_H}px`,
                  whiteSpace: 'nowrap',
                }}
              >
                @{stripHandle(reel.handle) || 'seuhandle'}
              </span>
            </div>
          </div>

          {/* Legenda. Com texto: renderiza normal. Sem texto: mostra um
              PLACEHOLDER (afordância) SÓ no preview — no export (`hideVideo`, o
              card fonte do PNG) nunca bakeamos o placeholder no MP4. */}
          {reel.caption ? (
            <p
              style={{
                margin: 0,
                marginTop: 32,
                color: '#ffffff',
                fontFamily: "'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif",
                fontWeight: 400,
                fontSize: 46,
                lineHeight: 1.28,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {reel.caption}
            </p>
          ) : (
            !hideVideo && (
              <p
                data-reel-caption-placeholder
                style={{
                  margin: 0,
                  marginTop: 32,
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: "'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif",
                  fontWeight: 400,
                  fontSize: 46,
                  lineHeight: 1.28,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {CAPTION_PLACEHOLDER}
              </p>
            )
          )}
        </div>

        {/* ── Bloco de vídeo FULL-BLEED (sem padding, preto, contain) ──
            Altura = caixa nativa do vídeo (computeReelLayout). O bloco NÃO cresce
            para preencher o card: é o card que centraliza [header+vídeo]. */}
        <div
          data-reel-video-block
          style={{
            position: 'relative',
            width: '100%',
            height: layout.videoBoxHeight,
            flexShrink: 0,
            background: '#000000',
            overflow: 'hidden',
          }}
        >
          {!hideVideo && reel.videoUrl && (
            <video
              ref={videoRef}
              src={reel.videoUrl}
              muted={reel.muted}
              playsInline
              loop
              // Sem `controls`: o conteúdo exportado não tem controles nativos.
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center',
                background: '#000000',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
});

export default ReelCard;
