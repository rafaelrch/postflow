'use client';

import React from 'react';
import { Slide, GlobalSettings, ContentLayout, TextHighlight, DEFAULT_CORNERS } from '@/types';
import { getFontFamilies, getElementFontCSS, getShadowOverlayGradient, getImageLayerStyle, cornerGrowthTop, cornerTop } from '@/lib/utils';
import { getFormat } from '@/lib/formats';
import { renderTextWithHighlights } from '@/lib/text-highlights';


export interface EditorialSlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const PAD_X = 56;           // horizontal padding for content
const META_TOP = 36;        // top offset for metadata bar
const META_FONTSIZE = 21;   // metadata bar font size
const META_H = 60;          // total vertical footprint of meta bar area

// Content layouts — zone boundaries (absolute pixels from slide top)
const CONTENT_TOP = META_TOP + META_H; // ~96

// text-image-text
const TIT_TOP = CONTENT_TOP;       // 96
const IMG_TIT_GAP = 44;
const IMG_HEIGHT = 430;
const IMG_BOTTOM_GAP = 40;

// text-text-image
const TTI_IMG_HEIGHT = 500;

// image-text-text
const ITT_IMG_HEIGHT = 490;

/**
 * Base da faixa dos CANTOS (@handle / título do carrossel), em px do slide.
 *
 * Os cantos são a única coisa desenhada acima do conteúdo, e o usuário mexe na
 * distância às bordas e no tamanho deles — então a faixa não é um número fixo.
 * Devolve 0 quando não há canto visível.
 *
 * Mesma conta do componente `Corners` logo abaixo, de propósito num lugar só:
 * se as duas divergirem, o conteúdo volta a encostar nos cantos.
 */
function cornersBandBottom(corners: GlobalSettings['corners']): number {
  const algumVisivel = corners.topLeft.visible || corners.topRight.visible;
  if (!corners.show || !algumVisivel) return 0;
  const top = cornerTop(
    0,
    cornerGrowthTop(corners.borderDistance, corners.fontSize, DEFAULT_CORNERS.fontSize),
  );
  // `lineHeight: 1` no `cornerStyle` — a caixa tem a altura do próprio corpo.
  return top + corners.fontSize;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function isLightColor(hex: string): boolean {
  try { return hexLuminance(hex) > 0.4; } catch { return false; }
}


// ─────────────────────────────────────────────────────────────────────────────
// MetaBar sub-component
// ─────────────────────────────────────────────────────────────────────────────
function MetaBar({
  metaBar,
  textColor,
  fontFamily,
}: {
  metaBar: GlobalSettings['metaBar'];
  textColor: string;
  fontFamily: string;
}) {
  if (!metaBar?.show) return null;
  const style: React.CSSProperties = {
    position: 'absolute',
    top: META_TOP,
    left: PAD_X,
    right: PAD_X,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: META_FONTSIZE,
    fontFamily,
    fontWeight: 400,
    color: textColor,
    zIndex: 10,
    letterSpacing: '-0.01em',
  };
  return (
    <div style={style}>
      <span>{metaBar.left}</span>
      <span>{metaBar.center}</span>
      <span>{metaBar.right}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Corners sub-component
// ─────────────────────────────────────────────────────────────────────────────
function Corners({
  corners,
  bgIsLight,
  fontBody,
}: {
  corners: GlobalSettings['corners'];
  bgIsLight: boolean;
  fontBody: string;
}) {
  if (!corners.show) return null;

  const cornerFontCSS = corners.elementFont
    ? getElementFontCSS(corners.elementFont)
    : { fontFamily: fontBody, fontWeight: 400, fontStyle: 'normal' as const };

  // A opacidade é uma propriedade à parte, NÃO o alfa da cor. Ela vinha
  // embutida no rgba() do fallback, que só era usado quando `corners.color`
  // estava vazio — e o padrão do produto já traz '#FFFFFF'. Resultado: o
  // slider de opacidade nunca fazia efeito nenhum.
  const cornerTextColor = corners.color || (bgIsLight ? '#000000' : '#FFFFFF');

  const cornerStyle = (): React.CSSProperties => ({
    fontSize: `${corners.fontSize}px`,
    lineHeight: 1,
    display: 'inline-block',
    fontFamily: cornerFontCSS.fontFamily,
    fontWeight: cornerFontCSS.fontWeight,
    fontStyle: cornerFontCSS.fontStyle,
    color: cornerTextColor,
    opacity: corners.opacity / 100,
    zIndex: 20,
  });

  const bd = corners.borderDistance;
  // O canto cresce a partir do próprio centro, sem sair do slide. A base desta
  // faixa é o que `cornersBandBottom` devolve — é ela que o conteúdo respeita
  // na âncora de topo.
  const top = cornerTop(0, cornerGrowthTop(bd, corners.fontSize, DEFAULT_CORNERS.fontSize));

  return (
    <>
      {corners.topLeft.visible && (
        <div style={{ position: 'absolute', top, left: bd, ...cornerStyle() }}>
          {corners.topLeft.text}
        </div>
      )}
      {corners.topRight.visible && (
        <div style={{ position: 'absolute', top, right: bd, ...cornerStyle() }}>
          {corners.topRight.text}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function EditorialSlide({
  slide, globalSettings, slideIndex, totalSlides, forExport,
}: EditorialSlideProps) {
  const { accentColor, fontPair, metaBar, corners } = globalSettings;
  const fonts = getFontFamilies(fontPair);

  // Dimensões do formato ativo — largura sempre 1080; só a altura muda. As zonas
  // verticais dos layouts são derivadas de SLIDE_H, então refluem sem esticar.
  const { width: SLIDE_W, height: SLIDE_H } = getFormat(globalSettings.format);

  const layout: ContentLayout = slide.contentLayout ?? (slideIndex === 0 ? 'cover' : 'text-image-text');

  // Determine background and text colors
  const bgColor = slide.backgroundColor || '#EFEFEE';
  const bgIsLight = isLightColor(bgColor);
  const autoTextColor = bgIsLight ? '#111111' : '#FFFFFF';
  const autoTextSecondary = bgIsLight ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.80)';
  const metaTextColor = bgIsLight ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.42)';

  // Per-element font CSS
  const titleFontCSS = slide.titleFont
    ? getElementFontCSS(slide.titleFont)
    : { fontFamily: fonts.title, fontWeight: 800, fontStyle: 'normal' as const };
  const descFontCSS = slide.descriptionFont
    ? getElementFontCSS(slide.descriptionFont)
    : { fontFamily: fonts.body, fontWeight: 400, fontStyle: 'normal' as const };

  // Highlights
  const allHighlights: TextHighlight[] = slide.highlights?.length
    ? slide.highlights
    : (slide.highlightWord ? [{ text: slide.highlightWord, color: accentColor }] : []);
  const titleHighlights = allHighlights.filter(h => slide.title.toLowerCase().includes(h.text.toLowerCase()));
  const descHighlights = allHighlights.filter(h => (slide.description || '').toLowerCase().includes(h.text.toLowerCase()));

  const align = slide.textAlignment || 'left';
  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  // Faixa vertical derivada de textPosition (top-* / middle-* ou center / bottom-*).
  const vBand: 'top' | 'middle' | 'bottom' = slide.textPosition?.startsWith('top')
    ? 'top'
    : (slide.textPosition?.startsWith('middle') || slide.textPosition === 'center')
      ? 'middle'
      : 'bottom';

  const titleStyle: React.CSSProperties = {
    fontFamily: titleFontCSS.fontFamily,
    fontWeight: titleFontCSS.fontWeight,
    fontStyle: titleFontCSS.fontStyle,
    fontSize: `${slide.fontSize.title}px`,
    lineHeight: slide.lineHeight,
    color: slide.titleColor || autoTextColor,
    margin: 0,
    letterSpacing: slide.titleLetterSpacing !== undefined ? `${slide.titleLetterSpacing}em` : '-0.025em',
    textDecoration: slide.titleUnderline ? 'underline' : undefined,
    whiteSpace: 'pre-wrap',
    display: 'block',
    textAlign: align,
  };

  const descStyle: React.CSSProperties = {
    fontFamily: descFontCSS.fontFamily,
    fontWeight: descFontCSS.fontWeight,
    fontStyle: descFontCSS.fontStyle,
    fontSize: `${slide.fontSize.description}px`,
    lineHeight: slide.lineHeight + 0.1,
    color: slide.descriptionColor || autoTextSecondary,
    margin: 0,
    letterSpacing: slide.titleLetterSpacing !== undefined ? `${slide.titleLetterSpacing}em` : '-0.01em',
    textDecoration: slide.descriptionUnderline ? 'underline' : undefined,
    whiteSpace: 'pre-wrap',
    display: 'block',
    textAlign: align,
  };

  // "Imagem" — shape fixo, posicionado pelo layout, entre os textos. Distinto
  // do "Fundo do Slide" (cor ou imagem full-bleed atrás de tudo, ver bgImageUrl).
  const contentImgUrl = slide.contentImageUrl || '';
  // No editor mostramos o shape vazio (placeholder tracejado) mesmo sem imagem,
  // pra deixar claro onde ela vai entrar; na exportação some se estiver vazio.
  const showImageBox = layout !== 'text-only' && (!!contentImgUrl || !forExport);
  const imageStyle = (height: number): React.CSSProperties => ({
    width: '100%',
    height,
    borderRadius: 20,
    overflow: 'hidden',
    flexShrink: 0,
    position: 'relative',
    ...(contentImgUrl
      ? {}
      : {
          background: bgIsLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
          border: `1.5px dashed ${bgIsLight ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.20)'}`,
          boxSizing: 'border-box',
        }),
  });
  const contentImageLayer = contentImgUrl ? (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundImage: `url(${contentImgUrl})`,
      ...getImageLayerStyle(slide.contentImagePosition),
    }} />
  ) : null;

  // "Fundo do Slide" — cor sólida OU imagem full-bleed atrás de tudo.
  //
  // Só a CAPA usa a imagem: nos demais layouts a imagem vai no CARD (o shape de
  // conteúdo), nunca no fundo — pedido do Rafael. A capa é a exceção porque não
  // tem card nenhum: a imagem dela É o slide, e é por isso que o painel
  // "Imagem" nem aparece nela (ver `TEMPLATE_SIDEBAR_CONFIG`). O `text-only`
  // também fica sem imagem: sem card, não há onde ela entrar.
  const bgImageUrl = layout === 'cover' ? slide.backgroundImageUrl || slide.gridImageUrl || '' : '';
  const backgroundImageLayer = bgImageUrl ? (
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `url(${bgImageUrl})`,
      ...getImageLayerStyle(slide.imagePosition),
      opacity: (slide.backgroundImageOpacity ?? 100) / 100,
    }} />
  ) : null;

  // Sombra/Overlay — mesmo degradê em todos os layouts (antes só a capa tinha).
  // Vem logo após o fundo no DOM, então texto/imagem de conteúdo ficam por cima.
  const shadowOverlayLayer = slide.shadow.style !== 'none' ? (
    <div style={{
      position: 'absolute', inset: 0,
      background: getShadowOverlayGradient(slide.shadow.opacity, slide.shadow.color, slide.shadow.size, slide.shadow.distance),
      pointerEvents: 'none',
    }} />
  ) : null;

  // ── COVER LAYOUT ───────────────────────────────────────────────────────────
  if (layout === 'cover') {
    const panelBg = slide.backgroundColor || '#111111';
    const coverGap = slide.titleDescriptionGap ?? 36;
    // Bloco de texto (título + descrição) posicionado pela faixa vertical do
    // seletor "Posição do texto"; os sliders de offset seguem funcionando.
    //
    // Na faixa de BAIXO a capa é ancorada pelo RODAPÉ, com o mesmo respiro dos
    // slides internos (`CONTENT_TOP`). Antes era `top: 58% da altura`, um ponto
    // fixo que não acompanhava o tamanho do bloco: título de duas linhas descia
    // o conjunto inteiro e a descrição chegava mais perto do rodapé do que a de
    // um título de uma linha. Ancorando por baixo, a distância ao rodapé é
    // sempre a mesma e o bloco cresce para cima — que é o "mais para baixo" que
    // o Rafael pediu, sem número novo.
    const coverBlockPos: React.CSSProperties = vBand === 'top'
      ? { top: CONTENT_TOP + 40 }
      : vBand === 'middle'
        ? { top: '50%', transform: 'translateY(-50%)' }
        : { bottom: CONTENT_TOP };

    return (
      <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', backgroundColor: panelBg }}>
        {backgroundImageLayer}
        {shadowOverlayLayer}

        {/* Metadata bar — white on cover, only when enabled */}
        {metaBar?.show && (
          <div style={{
            position: 'absolute', top: META_TOP, left: PAD_X, right: PAD_X,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: META_FONTSIZE, fontFamily: fonts.body, fontWeight: 400,
            color: 'rgba(255,255,255,0.85)', zIndex: 10, letterSpacing: '-0.01em',
          }}>
            <span>{metaBar.left}</span>
            <span>{metaBar.center}</span>
            <span>{metaBar.right}</span>
          </div>
        )}

        {/* Text block — título e descrição fluem juntos com gap ajustável.
            A CAPA tem posicionamento PRÓPRIO: ela não passa pela coluna flex
            das sequências, então o respiro delas não a alcança. Na faixa de
            baixo ela é ancorada pelo rodapé — ver `coverBlockPos` acima e
            `tests/editorial-respiro-vertical.test.tsx`. */}
        <div data-block="cover-text" style={{
          position: 'absolute',
          ...coverBlockPos,
          left: PAD_X, right: PAD_X,
          zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems,
          gap: coverGap,
        }}>
          <div style={{ transform: `translateY(${slide.editorialTitleOffsetY ?? 0}px)`, display: 'flex', flexDirection: 'column', alignItems, width: '100%' }}>
            {renderTextWithHighlights(
              slide.title,
              titleHighlights,
              slide.highlightWord || '',
              accentColor,
              { ...titleStyle, color: slide.titleColor || '#FFFFFF', fontSize: `${slide.fontSize.title}px` },
            )}
          </div>

          {slide.description && (
            <div style={{ transform: `translateY(${slide.editorialDescOffsetY ?? 0}px)`, display: 'flex', flexDirection: 'column', alignItems, width: '100%' }}>
              {renderTextWithHighlights(
                slide.description,
                descHighlights,
                '',
                accentColor,
                { ...descStyle, color: slide.descriptionColor || 'rgba(255,255,255,0.75)' },
              )}
            </div>
          )}
        </div>

        <Corners corners={corners} bgIsLight={false} fontBody={fonts.body} />
      </div>
    );
  }

  // ── CONTENT LAYOUTS ───────────────────────────────────────────────────────
  // All share: background color, metadata bar, content padding

  const blockContainer: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems,
  };

  const titleBlock = (
    <div style={blockContainer}>
      {renderTextWithHighlights(
        slide.title, titleHighlights, slide.highlightWord || '', accentColor, titleStyle,
      )}
    </div>
  );

  const descBlock = slide.description ? (
    <div style={blockContainer}>
      {renderTextWithHighlights(
        slide.description, descHighlights, '', accentColor, descStyle,
      )}
    </div>
  ) : null;

  const gap = slide.titleDescriptionGap ?? 36;

  // ── SEQUÊNCIAS (text-image-text / text-text-image / image-text-text) ──────
  //
  // As três são a MESMA coluna flex; o que muda é só a ORDEM dos blocos. Antes
  // só o `text-image-text` era assim: as outras duas posicionavam cada bloco
  // por `top` absoluto, com uma faixa fixa reservada para o título (28% da
  // altura ≈ 378 px). Com título curto sobrava um vazio antes da descrição —
  // "como se algo fosse ser inserido ali" (o Rafael), que era exatamente o slot
  // da imagem sendo reservado onde não há imagem. Em coluna flex o vão entre os
  // blocos é sempre o `gap`, e os textos se aproximam sozinhos.
  if (layout === 'text-image-text' || layout === 'text-text-image' || layout === 'image-text-text') {
    const titleOffsetY = slide.editorialTitleOffsetY ?? 0;
    const imageOffsetY = slide.editorialImageOffsetY ?? 0;
    const descOffsetY = slide.editorialDescOffsetY ?? 0;

    // A altura da imagem continua sendo a de cada sequência — o que se unificou
    // é o empilhamento, não o desenho.
    const imgH = layout === 'text-image-text' ? IMG_HEIGHT
      : layout === 'text-text-image' ? TTI_IMG_HEIGHT
      : ITT_IMG_HEIGHT;

    const titleItem = (
      <div key="title" data-block="title" style={{ transform: `translateY(${titleOffsetY}px)` }}>
        {titleBlock}
      </div>
    );
    const imageItem = showImageBox ? (
      <div key="image" data-block="image" style={{
        height: imgH,
        width: '100%',
        flex: 'none',
        transform: `translateY(${imageOffsetY}px)`,
        ...imageStyle(imgH),
      }}>
        {contentImageLayer}
      </div>
    ) : null;
    const descItem = descBlock ? (
      <div key="description" data-block="description" style={{ transform: `translateY(${descOffsetY}px)` }}>
        {descBlock}
      </div>
    ) : null;

    const ordem = layout === 'text-image-text' ? [titleItem, imageItem, descItem]
      : layout === 'text-text-image' ? [titleItem, descItem, imageItem]
      : [imageItem, titleItem, descItem];

    // RESPIRO das âncoras extremas. Medido antes: colado no topo o conteúdo
    // começava a 20 px da base dos cantos, e colado no rodapé parava a 56 px da
    // borda — nas três sequências e nos três formatos.
    //
    // Entra como PADDING da banda extrema, não como novo limite do container:
    // mexer em `top`/`bottom` arrastaria junto a âncora do MEIO, que já está
    // certa. Com `justifyContent` em `flex-start`/`flex-end` o padding empurra
    // exatamente o lado que encosta, e em `center` os dois são zero.
    //
    // Os números vêm do próprio renderer: a folga abaixo dos cantos é o `PAD_X`
    // (o respiro que o template já usa na horizontal) e o recuo do rodapé é o
    // `CONTENT_TOP` (o inset vertical que ele já usava em cima), o que deixa o
    // quadro simétrico em vez de 96 em cima e 56 embaixo.
    const topoSeguro = Math.max(CONTENT_TOP, cornersBandBottom(corners) + PAD_X);
    const padTop = vBand === 'top' ? Math.max(0, topoSeguro - CONTENT_TOP) : 0;
    const padBottom = vBand === 'bottom' ? Math.max(0, CONTENT_TOP - 56) : 0;

    return (
      <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', backgroundColor: bgColor }}>
        {backgroundImageLayer}
        {shadowOverlayLayer}
        <MetaBar metaBar={metaBar} textColor={metaTextColor} fontFamily={fonts.body} />

        <div style={{
          position: 'absolute',
          top: CONTENT_TOP,
          bottom: 56,
          left: PAD_X,
          right: PAD_X,
          display: 'flex',
          flexDirection: 'column',
          // Faixa vertical do seletor "Posição do texto" move o grupo inteiro
          justifyContent: vBand === 'top' ? 'flex-start' : vBand === 'bottom' ? 'flex-end' : 'center',
          paddingTop: padTop,
          paddingBottom: padBottom,
          gap,
        }}>
          {ordem.filter(Boolean)}
        </div>

        <Corners corners={corners} bgIsLight={bgIsLight} fontBody={fonts.body} />
      </div>
    );
  }

  // ── text-only ──────────────────────────────────────────────────────────────
  // layout === 'text-only'
  const titleOffsetY = slide.editorialTitleOffsetY ?? 0;
  const descOffsetY = slide.editorialDescOffsetY ?? 0;
  const titleTop = CONTENT_TOP + titleOffsetY;
  const descTopTextOnly = Math.round(SLIDE_H * 0.54) + descOffsetY; // ~729

  return (
    <div style={{ width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', backgroundColor: bgColor }}>
      {backgroundImageLayer}
      {shadowOverlayLayer}
      <MetaBar metaBar={metaBar} textColor={metaTextColor} fontFamily={fonts.body} />

      {/* Title — large */}
      <div style={{
        position: 'absolute', top: titleTop, left: PAD_X, right: PAD_X,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
      }}>
        {titleBlock}
      </div>

      {/* Description */}
      {descBlock && (
        <div style={{
          position: 'absolute', top: descTopTextOnly, left: PAD_X, right: PAD_X,
          overflow: 'hidden',
        }}>
          {descBlock}
        </div>
      )}

      <Corners corners={corners} bgIsLight={bgIsLight} fontBody={fonts.body} />
    </div>
  );
}
