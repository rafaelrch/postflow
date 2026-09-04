'use client';

import React, { useRef } from 'react';
import { Slide, GlobalSettings } from '@/types';
import { getFormat } from '@/lib/formats';
import { renderTextWithHighlights } from '@/lib/text-highlights';
import { getImageLayerStyle } from '@/lib/utils';

export interface ProfileSlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  profileData: {
    photo: string;
    name: string;
    handle: string;
    followers?: string;
  };
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
  onUpdateProfile?: (updates: { name?: string; handle?: string }) => void;
  onUpdateText?: (updates: { title?: string; description?: string; subtitle?: string }) => void;
}

const CONTENT_WIDTH = 864;

/**
 * O CABEÇALHO INTEIRO ESCALA JUNTO — avatar incluído.
 *
 * Queixa do Rafael (04/09/2026), palavras dele: *"quando eu aumento e diminuo,
 * só aumenta e diminui o texto: o nome, o @ e o verificado. A imagem fica
 * parada. É pra imagem também, a foto de perfil, aumentar junto com o resto."*
 *
 * MEDIDO: o avatar era `const AVATAR_SIZE = 84`, número FIXO, enquanto o nome,
 * o @ e o selo saíam todos de `headerFontSize`. Um escalava, o outro não — e
 * como o texto crescia ao lado de um círculo parado, era o desalinhamento que
 * ele viu, não só o tamanho.
 *
 * 🔴 A ÂNCORA É 26, E ISSO PRECISOU SER MEDIDO. Havia TRÊS "padrões" para
 * `headerFontSize` discordando no repo:
 *   · `DEFAULT_PROFILE_BADGE.headerFontSize` = 26 (types/index.ts) — o objeto
 *     de verdade;
 *   · o slider da barra lateral, que exibe `?? 26`;
 *   · o fallback que ESTE arquivo usava ao desenhar: `?? 30`.
 * O valor real é 26: `slide-mapper` monta `profileBadge` a partir do que está
 * gravado ou, na falta, de `DEFAULT_GLOBAL_SETTINGS.profileBadge` — que traz a
 * chave preenchida com 26. Um `headerFontSize` ausente é quase impossível de
 * produzir, então o `?? 30` era um caminho morto que só servia para o render
 * discordar do slider.
 *
 * Ancorar em 30 teria sido o erro caro: com os 26 que os decks REAIS têm, o
 * avatar cairia de 84 para 73 em todo carrossel de Profile já salvo. Ancorando
 * em 26, `Math.round` devolve exatamente 84 e 22 — os números de sempre — e o
 * fallback foi unificado em 26 para que o caminho raro também caia em 84. Quem
 * nunca mexeu no tamanho não vê diferença nenhuma, nos dois caminhos, e é isso
 * que o teste de não-regressão trava.
 *
 * O GAP entra na conta junto: ele é o respiro entre o avatar e a coluna de
 * texto. Fixo em 22 enquanto o avatar dobra, ele viraria um aperto — a queixa
 * dele de novo, num lugar diferente.
 */
const HEADER_FONT_SIZE_PADRAO = 26;
const AVATAR_TO_HEADER_RATIO = 84 / HEADER_FONT_SIZE_PADRAO;
const AVATAR_TEXT_GAP_RATIO = 22 / HEADER_FONT_SIZE_PADRAO;
const VERIFIED_BLUE = '#1d9bf0';
const MEDIA_HEIGHT = 510;
const MAX_BODY_FONT = 40;

// Theme palettes
const LIGHT = {
  bg: '#FFFFFF',
  text: '#0F1419',
  handle: '#687684',
  mediaBg: '#E8EEF2',
  avatarBg: '#D9D9D9',
  avatarText: '#666666',
};
const DARK = {
  bg: '#000000',
  text: '#E7E9EA',
  handle: '#71767B',
  mediaBg: '#1E2732',
  avatarBg: '#333639',
  avatarText: '#AAAAAA',
};

function VerifiedBadge({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/selo_insta.png"
      alt=""
      width={size}
      height={size}
      crossOrigin="anonymous"
      style={{ display: 'block', flexShrink: 0, width: size, height: size }}
    />
  );
}

export default function ProfileSlide({
  slide,
  globalSettings,
  profileData,
  forExport,
  onUpdateProfile,
  onUpdateText,
}: ProfileSlideProps) {
  // Dimensões do formato ativo — o card é centralizado (top/left 50%), então
  // encaixa em qualquer altura sem esticar.
  const { width: SLIDE_W, height: SLIDE_H } = getFormat(globalSettings.format);

  const imageUrl = slide.gridImageUrl || slide.backgroundImageUrl;
  const hasMedia = Boolean(imageUrl);
  const descText = slide.description?.trim() || '';
  const highlights = slide.highlights ?? [];
  const accentColor = globalSettings.accentColor;
  const titleDescGap = slide.titleDescriptionGap ?? 16;
  const avatarFallback = (profileData.name || 'P').trim().charAt(0).toUpperCase();
  const bodyFontSize = Math.min(slide.fontSize.title, MAX_BODY_FONT);
  const headerFontSize = globalSettings.profileBadge.headerFontSize ?? HEADER_FONT_SIZE_PADRAO;
  const badgeSize = Math.round(headerFontSize * 1.05);
  const handleFontSize = Math.round(headerFontSize * 0.82);
  const isEditable = Boolean(onUpdateProfile || onUpdateText) && !forExport;

  // Alturas do header em pixels fixos — html2canvas diverge do browser ao
  // centralizar flex vertical, então a coluna de texto é posicionada por
  // offset calculado em vez de alignItems/justifyContent.
  // Tudo o que forma o cabeçalho sai daqui: o círculo, o respiro ao lado dele,
  // e (logo acima) o selo e o @. Nenhum número solto sobrou.
  const avatarSize = Math.round(headerFontSize * AVATAR_TO_HEADER_RATIO);
  const avatarTextGap = Math.round(headerFontSize * AVATAR_TEXT_GAP_RATIO);
  const nameRowH = Math.round(headerFontSize * 1.1);
  const handleGap = 6;
  const handleRowH = Math.round(handleFontSize * 1.1);
  const textBlockH = nameRowH + handleGap + handleRowH;
  const textPadTop = Math.max(0, Math.round((avatarSize - textBlockH) / 2));

  // Theme colours
  const C = globalSettings.theme === 'dark' ? DARK : LIGHT;

  const nameRef = useRef<HTMLSpanElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);

  // Tipografia fixa — o Twitter/X usa uma única fonte, então este template
  // ignora o fontPair do carrossel.
  const TWITTER_FONT = "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif";

  // Name / handle inline edit helpers
  const editableProps = (field: 'name' | 'handle') => ({
    contentEditable: isEditable || undefined,
    suppressContentEditableWarning: true,
    onBlur: isEditable
      ? (e: React.FocusEvent<HTMLSpanElement>) => {
          const val = e.currentTarget.textContent?.trim() || '';
          onUpdateProfile?.({ [field]: val });
        }
      : undefined,
    onKeyDown: isEditable
      ? (e: React.KeyboardEvent<HTMLSpanElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.currentTarget as HTMLSpanElement).blur();
          }
        }
      : undefined,
    style: isEditable
      ? { outline: 'none', cursor: 'text', paddingBottom: 2, minWidth: 40, display: 'inline-block' }
      : undefined,
  });

  // Body text blur handler — título e descrição são blocos separados, então o
  // innerText traz a quebra entre eles; linha em branco (\n\n) tem prioridade.
  const handleBodyBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!onUpdateText) return;
    const raw = (e.currentTarget as HTMLElement).innerText || '';
    const doubleIdx = raw.indexOf('\n\n');
    const idx = doubleIdx !== -1 ? doubleIdx : raw.indexOf('\n');
    const sepLen = doubleIdx !== -1 ? 2 : 1;
    if (idx === -1) {
      onUpdateText({ title: raw.trim(), description: '' });
    } else {
      onUpdateText({
        title: raw.slice(0, idx).trim(),
        description: raw.slice(idx + sepLen).trim(),
      });
    }
  };

  return (
    <div
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        overflow: 'hidden',
        backgroundColor: C.bg,
        fontFamily: TWITTER_FONT,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: CONTENT_WIDTH,
        }}
      >
        {/* Profile header — posições absolutas em pixels (sem centralização
            flex vertical) para o html2canvas renderizar igual ao preview */}
        <div style={{ position: 'relative', height: avatarSize }}>
          {/* Avatar */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: avatarSize,
              height: avatarSize,
              borderRadius: '50%',
              overflow: 'hidden',
              backgroundColor: C.avatarBg,
            }}
          >
            {profileData.photo ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundImage: `url(${profileData.photo})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'table' }}>
                <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'center' }}>
                  <span style={{ fontSize: headerFontSize, fontWeight: 700, color: C.avatarText, fontFamily: TWITTER_FONT }}>
                    {avatarFallback}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Name + handle column — top fixo calculado para centralizar no avatar */}
          <div style={{ position: 'absolute', left: avatarSize + avatarTextGap, top: textPadTop }}>
            {/* Row 1: name + spacer + badge, explicit height so html2canvas centers cleanly */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: nameRowH,
              }}
            >
              <span
                ref={nameRef}
                {...editableProps('name')}
                style={{
                  fontSize: headerFontSize,
                  lineHeight: `${nameRowH}px`,
                  fontWeight: 700,
                  color: C.text,
                  letterSpacing: '-0.03em',
                  whiteSpace: 'nowrap',
                  ...(isEditable ? { outline: 'none', cursor: 'text', minWidth: 40 } : {}),
                }}
              >
                {profileData.name || 'Seu Nome'}
              </span>
              <div style={{ width: 8, flexShrink: 0 }} />
              <VerifiedBadge size={badgeSize} />
            </div>

            {/* Row 2: handle */}
            <span
              ref={handleRef}
              {...editableProps('handle')}
              style={{
                display: 'block',
                marginTop: handleGap,
                height: handleRowH,
                fontSize: handleFontSize,
                lineHeight: `${handleRowH}px`,
                fontWeight: 400,
                color: C.handle,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                ...(isEditable ? { outline: 'none', cursor: 'text', minWidth: 40 } : {}),
              }}
            >
              {profileData.handle || '@handle'}
            </span>
          </div>
        </div>

        {/* Spacer — explicit height avoids html2canvas margin-collapse issues */}
        <div style={{ height: 42 }} />

        {/* Body text — editable when onUpdateText is provided */}
        <div
          key={`body-${slide.id}`}
          contentEditable={isEditable && Boolean(onUpdateText) ? true : undefined}
          suppressContentEditableWarning
          onBlur={isEditable ? handleBodyBlur : undefined}
          style={{
            fontFamily: TWITTER_FONT,
            fontSize: bodyFontSize,
            fontWeight: 400,
            lineHeight: slide.lineHeight + 0.12,
            color: C.text,
            letterSpacing: '-0.03em',
            whiteSpace: 'pre-wrap',
            width: '100%',
            outline: 'none',
            cursor: isEditable && onUpdateText ? 'text' : 'default',
          }}
        >
          {/* Destaques por palavra — deixar ALGUMAS palavras em negrito, e não
              o bloco todo. Com o texto em edição inline os destaques continuam
              valendo: o `onBlur` só lê o `innerText`, que ignora os spans.

              O modo `bold` é ordem do Rafael (04/09/2026): aqui marcar uma
              palavra deixa ela em NEGRITO e mais nada — sem cor, sem face
              própria, sem sublinhado. O `accentColor` continua sendo passado
              porque a assinatura o pede, mas neste modo ele não é aplicado a
              nada; o Editorial e o Minimalista, que dividem esta função,
              seguem no modo `color`. */}
          {renderTextWithHighlights(slide.title, highlights, '', accentColor, {}, 'bold')}
          {descText && (
            <span style={{ display: 'block', marginTop: titleDescGap }}>
              {renderTextWithHighlights(descText, highlights, '', accentColor, {}, 'bold')}
            </span>
          )}
        </div>

        {/* Mídia — caixa FIXA de 864x510, e a imagem entra INTEIRA no zoom 100.
            Este bloco já foi as duas coisas, e nenhuma das duas servia sozinha:
            - caixa fixa com `cover`: cortava toda foto que não fosse 864x510, e
              o Rafael reclamou do corte;
            - `<img>` de proporção livre: nunca cortava, mas uma imagem em pé
              virava uma tira estreita dentro de uma caixa larga — e não havia
              nada para os sliders X/Y/zoom ajustarem, porque não existe folga
              numa imagem que cabe inteira por definição.
            O modelo que atende as duas exigências é a caixa fixa com a camada
            em `contain`: no zoom 100 a imagem aparece INTEIRA, na proporção
            original, com o `C.mediaBg` aparecendo em volta do que sobra — o
            corte que o Rafael recusou continua não acontecendo. Acima de 100 a
            camada cresce, passa a transbordar a caixa, e aí X e Y têm folga
            para escolher o enquadramento: é o ajuste que a foto enviada na mão
            precisa.
            🔴 A linha que não pode cair: no zoom 100 nada é cortado.
            O posicionamento é o `getImageLayerStyle` dos outros quatro estilos,
            que já aceitava `objectFit: 'contain'` — ninguém tinha ligado aqui.
            Não escreva uma terceira maneira de posicionar imagem. */}
        {hasMedia && <div style={{ height: 54 }} />}
        {hasMedia && imageUrl && (
          <div
            data-profile-media
            style={{
              position: 'relative',
              width: CONTENT_WIDTH,
              height: MEDIA_HEIGHT,
              overflow: 'hidden',
              borderRadius: 34,
              backgroundColor: C.mediaBg,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${imageUrl})`,
                ...getImageLayerStyle({ ...slide.imagePosition, objectFit: 'contain' }),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
