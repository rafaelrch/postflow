'use client';

import React from 'react';
import { Slide, GlobalSettings, DEFAULT_CORNERS } from '@/types';
import { getImageLayerStyle } from '@/lib/utils';
import { getFormat } from '@/lib/formats';
import { cornerGrowthTop, cornerTop } from '@/lib/utils';
import {
  TEMPLATE_01_WIDTH,
  TEMPLATE_01_DEFAULT_CORNERS,
  template01HeightRatio,
  template01NodeSpan,
  Template01Slots,
  Template01BlockMetrics,
  template01SpecLines,
  template01Tops,
  template01AlignBoxes,
  template01BaseType,
  template01Nodes,
  template01FallbackImage,
  template01ModelOf,
  template01SpecSlideOf,
  SpecBox,
  SpecNode,
  SpecSlide,
  SpecStyledRun,
} from '@/lib/templates/template-01';
import {
  Template01ImageOverride,
  Template01Overrides,
  Template01TextOverride,
  template01Kind,
  template01Overrides,
  template01TextOverrideFor,
} from '@/lib/templates/template-01/overrides';

export interface Template01SlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
}

/**
 * TEMPLATE 1 — renderiza um slide diretamente de `template-01.spec.json`.
 *
 * Porte 1:1 do `render.py` da skill (spec → CSS absoluto), com React no lugar
 * de string de HTML. O spec é o VALOR PADRÃO de tudo — posição, cor, tipografia,
 * degradê e espaçamento: sem override do usuário a saída é idêntica ao gabarito,
 * pixel a pixel. Os controles da barra lateral entram por cima (ver
 * `template01Overrides`).
 *
 * Duas diferenças deliberadas em relação ao render.py:
 *
 * 1. Quando um slot com runs de estilo (o `s1.eyebrow`, bold + light) é editado,
 *    os runs são reaplicados por índice de caractere em vez de descartados — o
 *    spec define o ponto de virada por caractere, e perder isso mudaria o
 *    desenho do slide.
 * 2. Os blocos de texto não ficam presos ao `top` do spec: eles fluem a partir
 *    de uma âncora, preservando o vão do desenho (ver `template01Tops`). O `y`
 *    do spec pressupõe a contagem de linhas do texto do Figma; com texto do
 *    usuário, `top` fixo abre buraco quando encurta e sobrepõe quando cresce.
 */

// Família do Figma → família declarada em globals.css. Os nomes das sem-serifa
// são prefixados para não colidirem com as faces do resto do app.
//
// A serifada é a IvyOra Text de verdade, servida pelo projeto web do Adobe
// Fonts sob o nome `ivyora-text` (ver o <link> em app/layout.tsx). O `T01Serif`
// (Cormorant Garamond, embutido) fica como rede: se o CDN do Adobe cair, o
// slide sai no substituto que o spec ranqueou como mais próximo, em vez de
// numa serifada qualquer do sistema.
//
// ⚠️ Não escreva `'IvyOra Text'` nesta pilha. O app declara um @font-face com
// esse nome que resolve só por local(); quando ele não acha nada, o Chrome
// trata a família como definida-e-vazia e pula direto para a `serif` genérica
// — Georgia — sem cair no T01Serif. Medido: 334px (Georgia) contra 305px (o
// substituto correto). `ivyora-text` não tem esse problema porque é uma face
// que baixa de verdade: se o download falhar, a família some da cascata e o
// próximo nome da lista vale.
const FONT_STACK: Record<string, string> = {
  Inter: "'T01Inter', sans-serif",
  'Inter Display': "'T01InterDisplay', sans-serif",
  'IvyOra Text': "'ivyora-text', 'T01Serif', serif",
};

function fontStack(family: string): string {
  return FONT_STACK[family] ?? `'${family}', sans-serif`;
}

/**
 * Tipografia do bloco depois do override. O ponto de partida é o spec passado
 * pela camada de ajuste (`template01BaseType`), não o `node.typography` cru:
 * é ali que mora o tamanho novo dos títulos-coluna do slide 5.
 */
function effectiveType(node: SpecNode, o: Template01TextOverride) {
  const base = template01BaseType(node);
  // Tamanho por SLOT vence a escala por papel: quem escolheu o tamanho daquele
  // bloco pediu aquele número, não uma proporção.
  const fontSizePx = o.fontSizePx ?? base.fontSizePx * o.fontScale;
  const scale = base.fontSizePx ? fontSizePx / base.fontSizePx : 1;
  // A entrelinha acompanha o tamanho: escalar só a fonte colaria as linhas.
  const lineHeightPx =
    o.lineHeightRatio != null ? fontSizePx * o.lineHeightRatio : base.lineHeightPx * scale;
  return { fontSizePx, lineHeightPx };
}

/**
 * Deslocamento dos cantos pelo controle "distância das bordas".
 *
 * O spec põe os cantos em x=71/right=63 e y=44 — três números diferentes, então
 * não dá para tratar o controle como distância absoluta sem redesenhar a linha.
 * O que ele move é a DIFERENÇA para o padrão do editor, preservando o desenho
 * quando o usuário não mexe.
 */
function cornerShift(ov: Template01Overrides): number {
  return ov.cornerDistance == null ? 0 : ov.cornerDistance - DEFAULT_CORNERS.borderDistance;
}

/**
 * Espelha `node_css()` do render.py, com os overrides do usuário por cima.
 *
 * `ratio` é a razão de altura do formato ativo e só toca a BANDA (imagem, seta):
 * o texto é margem absoluta e nada nele — nem `x`, nem largura, nem corpo —
 * depende do formato. No 4:5 a razão é 1 e a função devolve o spec cru.
 */
function nodeStyle(
  node: SpecNode,
  ov: Template01Overrides,
  top?: number,
  alignBox?: SpecBox,
  ratio = 1
): React.CSSProperties {
  // Com override de alinhamento os blocos da mesma coluna passam a usar a caixa
  // mais larga do grupo, senão as bordas divergem (ver TEMPLATE_01_ALIGN_GROUPS).
  const b = alignBox ?? node.box;
  const css: React.CSSProperties = { position: 'absolute' };

  if (node.type === 'TEXT' && node.typography && node.anchor) {
    const base = template01BaseType(node);
    const t = node.typography;
    const kind = template01Kind(node);
    const o = template01TextOverrideFor(node, ov);
    const { fontSizePx, lineHeightPx } = effectiveType(node, o);
    // Os cantos têm controle próprio (distância às bordas); o resto do texto
    // anda junto no deslocamento do bloco.
    const isCorner = kind === 'corner';
    // MARGEM por slot — a mesma da aba Cantos, agora em qualquer bloco de
    // texto: empurra para DENTRO a partir da borda em que o spec ancorou.
    const slotMargin = node.slot ? ov.slotStyles[node.slot]?.margin ?? 0 : 0;
    const offX = isCorner ? cornerShift(ov) : ov.textOffset?.x ?? 0;
    const offY = isCorner ? cornerShift(ov) : ov.textOffset?.y ?? 0;
    // No eixo Y o CANTO cresce a partir do próprio centro. O bloco de corpo não
    // ganha essa correção de propósito: ele reflui por medição
    // (`template01Tops`), e recentrar ali brigaria com o reflow e mexeria em
    // quem só mudou o tamanho do texto.
    const dy = isCorner
      ? offY + cornerGrowthTop(slotMargin, fontSizePx, t.fontSizePx)
      : offY + slotMargin;

    // O CANTO não usa a largura do spec. A caixa do Figma é justa para o texto
    // de fábrica (233 px no esquerdo, 121 px no direito): crescer a fonte fazia
    // o "LOREM IPSUM" quebrar em duas linhas e o "@LOREMIPSUM" vazar da caixa,
    // que é o defeito que o Rafael viu no controle de tamanho. Com
    // `max-content` a caixa acompanha o texto, como o canto do Editorial —
    // e, no tamanho de fábrica, as âncoras (left/right + text-align) põem os
    // glifos exatamente onde o gabarito põe, então a fidelidade não se mexe.
    // No bloco de corpo a caixa encolhe pela margem: margem que não estreita o
    // bloco só o faria vazar pelo outro lado.
    const width = isCorner ? 'max-content' : Math.max(0, b.w - slotMargin);

    if (node.anchor.mode === 'center-x') {
      // Bloco centrado não tem borda de referência: a margem só vale no Y.
      css.left = '50%';
      css.transform = offX ? `translateX(calc(-50% + ${offX}px))` : 'translateX(-50%)';
      css.width = width;
    } else if (node.anchor.mode === 'right') {
      // A distância é medida da borda direita. O deslocamento de bloco empurra
      // para a direita (aproxima da borda); a MARGEM sempre afasta dela.
      css.right = b.right + (isCorner ? offX : -offX) + slotMargin;
      css.width = width;
    } else {
      css.left = b.x + offX + slotMargin;
      css.width = width;
    }
    // No canto o piso é a borda do slide; nos demais blocos o `top` do fluxo
    // manda como sempre.
    css.top = isCorner ? cornerTop(top ?? b.y, dy) : (top ?? b.y) + dy;
    css.fontFamily = o.font ? o.font.fontFamily : fontStack(t.fontFamily);
    css.fontWeight = o.font ? o.font.fontWeight : t.fontWeight || 400;
    css.fontStyle = o.font ? o.font.fontStyle : t.italic ? 'italic' : 'normal';
    // Os tamanhos são dízimas (80,8654px) de propósito — fidelidade ao Figma.
    css.fontSize = `${fontSizePx}px`;
    css.lineHeight = `${lineHeightPx}px`;
    css.letterSpacing = `${o.letterSpacingEm ?? t.letterSpacingEm}em`;
    // `base.align` já traz o desvio pedido pelo Rafael (s3.title centralizado).
    css.textAlign = (o.align ?? base.align) as React.CSSProperties['textAlign'];
    css.color = o.color ?? node.fills?.[0]?.css;
    if (o.underline) css.textDecoration = 'underline';
    css.margin = 0;
    css.whiteSpace = 'pre-wrap';
  } else {
    const span = template01NodeSpan(node, ratio);
    css.left = b.x;
    css.top = span.y;
    css.width = b.w;
    css.height = span.h;
    if (node.cornerRadius) css.borderRadius = node.cornerRadius;
    if (node.fills?.length) css.background = node.fills[0].css ?? 'transparent';
    if (node.strokes?.length) {
      css.boxSizing = 'border-box';
      css.border = `${node.strokeWeight || 1}px solid ${node.strokes[0].css}`;
    }
  }

  if (node.opacity !== undefined && node.opacity !== 1) css.opacity = node.opacity;
  if (node.type === 'TEXT') {
    const o = template01TextOverrideFor(node, ov);
    if (o.opacity !== undefined) css.opacity = o.opacity;
    // O controle da aba Cantos escreve por slot e vence o override legado.
    const slotOpacity = node.slot ? ov.slotStyles[node.slot]?.opacity : undefined;
    if (slotOpacity !== undefined) css.opacity = slotOpacity / 100;
  }
  return css;
}

/**
 * Aplica os runs de estilo do spec ao texto atual. Com o texto original a saída
 * é idêntica ao Figma; com texto editado os limites são fatiados por caractere e
 * o excedente herda o estilo do último run. Quando o usuário escolhe uma fonte
 * na barra lateral, os runs deixam de mexer em família e peso: a escolha dele
 * vale para o bloco inteiro.
 */
/**
 * O corte entre runs vem por índice de CARACTERE do spec. Com outro texto isso
 * cai no meio de uma palavra ("*Torrefação artesanal mud|a o sabor"), o que
 * parece defeito. Aqui o corte anda para o início da palavra mais próxima.
 *
 * O espaço fica sempre com o run da ESQUERDA (por isso `+ 1`): é assim que o
 * spec corta, então com o texto do Figma esta função devolve o mesmo índice e a
 * fidelidade de 0 px não se mexe.
 */
function snapToWord(value: string, end: number, cursor: number): number {
  if (end <= cursor || end >= value.length) return end;
  const before = value.lastIndexOf(' ', end);
  const after = value.indexOf(' ', end);
  const candidates = [before, after].filter((i) => i >= 0 && i + 1 > cursor).map((i) => i + 1);
  if (!candidates.length) return end;
  return candidates.reduce((best, i) => (Math.abs(i - end) < Math.abs(best - end) ? i : best));
}

function renderRuns(
  value: string,
  runs: SpecStyledRun[],
  hasFontOverride: boolean
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  runs.forEach((run, i) => {
    if (cursor >= value.length) return;
    const isLast = i === runs.length - 1;
    const end = isLast ? value.length : snapToWord(value, Math.min(run.end, value.length), cursor);
    const chunk = value.slice(cursor, end);
    cursor = end;
    if (!chunk) return;
    const ov = run.override ?? {};
    const style: React.CSSProperties = {};
    if (!hasFontOverride) {
      if (ov.fontWeight) style.fontWeight = ov.fontWeight;
      if (ov.fontFamily) style.fontFamily = fontStack(ov.fontFamily);
      if (ov.italic) style.fontStyle = 'italic';
    }
    if (ov.fills?.length) style.color = ov.fills[0].css;
    parts.push(
      <span key={i} style={style}>
        {chunk}
      </span>
    );
  });
  if (cursor < value.length) parts.push(<span key="rest">{value.slice(cursor)}</span>);
  return parts;
}

/**
 * Seta vertical do slide 6. O `rotation: 90°` do Figma já vem aplicado no
 * bounding box (w≈0, h=127), então a linha é vertical; a ponta é desenhada pelo
 * stroke cap e extrapola o bbox — daí o `overflow: visible` e o padding lateral.
 *
 * A seta é BANDA: o comprimento e o `y` acompanham a altura do formato. A
 * espessura do traço e a largura da ponta são horizontais e ficam intactas.
 */
function ArrowNode({ node, ratio = 1 }: { node: SpecNode; ratio?: number }) {
  const b = node.box;
  const span = template01NodeSpan(node, ratio);
  const L = span.h;
  const sw = node.strokeWeight || 2;
  const color = node.strokes?.[0]?.css ?? '#FFFFFF';
  const headW = node.arrowHeadWidth ?? 14.73;
  const hh = headW / 2;
  const cx = b.x + b.w / 2;
  const pad = hh + sw;
  const w = pad * 2;
  const h = L + sw;
  return (
    <svg
      data-slot={node.slot}
      style={{ position: 'absolute', left: cx - pad, top: span.y, overflow: 'visible' }}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
    >
      <line x1={pad} y1={0} x2={pad} y2={L} stroke={color} strokeWidth={sw} />
      <polyline
        points={`${pad - hh},${L - hh} ${pad},${L} ${pad + hh},${L - hh}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/** Camada de imagem com posição/zoom/opacidade — os mesmos controles do editor. */
function ImageLayer({ url, image }: { url: string; image: Template01ImageOverride }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url('${url}')`,
        opacity: image.opacity,
        ...(image.position
          ? getImageLayerStyle(image.position)
          : { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }),
      }}
    />
  );
}

/** Fundo do slide: o do spec, ou a cor escolhida no controle "Fundo do Slide". */
function slideBackground(spec: SpecSlide, ov: Template01Overrides): string {
  return ov.background ?? spec.background[0]?.css ?? '#fff';
}

function sameMetrics(
  a: Record<string, Template01BlockMetrics>,
  b: Record<string, Template01BlockMetrics>
): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(
    (k) => b[k] && b[k].lines === a[k].lines && b[k].lineHeightPx === a[k].lineHeightPx
  );
}

export default function Template01Slide({ slide, globalSettings, slideIndex }: Template01SlideProps) {
  // O desenho vem do MODELO do slide, não da posição dele no deck: com modelo
  // repetido ou mais de 6 slides a posição não identifica mais nada. Slide sem
  // modelo gravado (deck antigo) volta a derivar da posição — ver
  // `template01ModelOf`.
  const specSlide = template01SpecSlideOf(template01ModelOf(slide, slideIndex));

  // Formato ativo. Os três compartilham a largura 1080 — só a ALTURA muda, e é
  // só ela que o template adapta (ver a seção "Adaptação de formato" no módulo
  // do template). No 4:5 a razão é 1 e todo o desenho sai igual ao gabarito.
  const fmt = getFormat(globalSettings.format);
  const ratio = template01HeightRatio(fmt.height);

  const ov = React.useMemo(
    () => template01Overrides(slide, globalSettings),
    [slide, globalSettings]
  );

  // Os nós DEPOIS da camada de ajuste: nos slides que o Figma deixou sem canto
  // é aqui que o par entra (ver TEMPLATE_01_DESIGN_TWEAKS.extraCorners).
  const nodes = React.useMemo(() => template01Nodes(specSlide), [specSlide]);

  const slots: Template01Slots = React.useMemo(() => {
    const fromSlide = slide.templateSlots ?? {};
    // A imagem escolhida pelos controles genéricos do editor vale como imagem
    // do slide quando o slot correspondente ainda está vazio.
    const fallbackImage = template01FallbackImage(slide);
    if (!fallbackImage) return fromSlide;
    const merged = { ...fromSlide };
    for (const node of specSlide.nodes) {
      if (node.type === 'RECTANGLE' && node.slot && !merged[node.slot]) merged[node.slot] = fallbackImage;
    }
    for (const layer of specSlide.backgroundLayers ?? []) {
      if (layer.type === 'IMAGE_SLOT' && layer.slot && !merged[layer.slot]) merged[layer.slot] = fallbackImage;
    }
    return merged;
  }, [slide.templateSlots, slide.backgroundImageUrl, slide.gridImageUrl, slide.contentImageUrl, specSlide]);

  // ── Reflow ────────────────────────────────────────────────────
  // A contagem de linhas depende da quebra do navegador, então vem de medição:
  // altura renderizada ÷ entrelinha, arredondada. Arredondar para inteiro é o
  // que garante o 0 px — com o texto de fábrica a medida bate com a do spec e
  // todos os deltas dão exatamente zero.
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const textRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const [metrics, setMetrics] = React.useState<Record<string, Template01BlockMetrics>>({});

  const lineHeights = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const node of nodes) {
      if (node.type !== 'TEXT' || !node.typography || !node.slot) continue;
      out[node.slot] = effectiveType(node, template01TextOverrideFor(node, ov)).lineHeightPx;
    }
    return out;
  }, [nodes, ov]);

  React.useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      const scale = root.getBoundingClientRect().height / fmt.height;
      if (!scale || !isFinite(scale)) return;
      const next: Record<string, Template01BlockMetrics> = {};
      textRefs.current.forEach((el, slot) => {
        const lh = lineHeights[slot];
        if (!lh) return;
        const h = el.getBoundingClientRect().height / scale;
        next[slot] = { lines: Math.max(1, Math.round(h / lh)), lineHeightPx: lh };
      });
      setMetrics((prev) => (sameMetrics(prev, next) ? prev : next));
    };

    measure();

    let alive = true;
    // As faces do template carregam de forma assíncrona: a quebra de linha muda
    // quando elas chegam.
    document.fonts?.ready.then(() => alive && measure());

    if (typeof ResizeObserver === 'undefined') return () => { alive = false; };
    const ro = new ResizeObserver(measure);
    textRefs.current.forEach((el) => ro.observe(el));
    if (rootRef.current) ro.observe(rootRef.current);
    return () => {
      alive = false;
      ro.disconnect();
    };
  });

  const isTitleSlot = React.useCallback(
    (slot: string) => {
      const node = nodes.find((n) => n.slot === slot);
      return !!node && template01Kind(node) === 'title';
    },
    [nodes]
  );

  const tops = React.useMemo(
    () =>
      template01Tops(specSlide.index, metrics, {
        titleGapDelta: ov.titleGapDelta,
        isTitleSlot,
        ratio,
      }),
    [specSlide.index, metrics, ov.titleGapDelta, isTitleSlot, ratio]
  );

  // Caixa compartilhada só existe quando o usuário troca o alinhamento: é a
  // troca que revela o desencontro das bordas. Sem ela, o spec manda — e é isso
  // que preserva o 0 px contra o gabarito.
  const alignBoxes = React.useMemo(
    () => (ov.title.align || ov.body.align ? template01AlignBoxes(specSlide.index) : {}),
    [specSlide.index, ov.title.align, ov.body.align]
  );

  const bgLayers = specSlide.backgroundLayers ?? [];
  const bgImageSlot = bgLayers.find((l) => l.type === 'IMAGE_SLOT')?.slot;
  const bgImageUrl = bgImageSlot ? slots[bgImageSlot] : undefined;
  const scrim = bgLayers.find((l) => l.type === 'GRADIENT_SCRIM')?.css;

  return (
    <div
      ref={rootRef}
      className="t01-slide"
      style={{
        position: 'relative',
        width: TEMPLATE_01_WIDTH,
        height: fmt.height,
        overflow: 'hidden',
        // Sem imagem, mostra o degradê original do Figma — mesmo comportamento
        // do render.py, que serve de gabarito de inspeção.
        background: bgImageUrl ? ov.background ?? 'transparent' : slideBackground(specSlide, ov),
        fontKerning: 'normal',
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'geometricPrecision',
      }}
    >
      {bgImageUrl && <ImageLayer url={bgImageUrl} image={ov.backgroundImage} />}
      {bgImageUrl && scrim && (
        <div style={{ position: 'absolute', inset: 0, background: scrim }} />
      )}
      {ov.shadow && <div style={{ position: 'absolute', inset: 0, background: ov.shadow }} />}

      {nodes.map((node) => {
        // GROUP não gera caixa: os filhos já vêm achatados no spec.
        if (node.type === 'GROUP') return null;

        const slot = node.slot || node.name;

        if (node.type === 'TEXT' && node.text) {
          const isCorner = template01Kind(node) === 'corner';
          const slotVisibility = ov.slotStyles[slot]?.visible;
          // A configuração global fica como fallback de decks antigos. Assim
          // que este slide recebe seu próprio toggle, ele passa a mandar.
          if (isCorner && (slotVisibility === false || (slotVisibility == null && ov.hideCorners))) {
            return null;
          }
          const fallback = isCorner
            ? TEMPLATE_01_DEFAULT_CORNERS[slot] ?? node.text.characters
            : node.text.characters;
          const value = slots[slot] ?? slots[node.id] ?? fallback;
          const runs = node.text.styledRuns;
          const hasFontOverride = !!ov[template01Kind(node)].font;
          return (
            <div
              key={node.id}
              data-slot={slot}
              data-spec-lines={template01SpecLines(node)}
              ref={(el) => {
                if (el) textRefs.current.set(slot, el);
                else textRefs.current.delete(slot);
              }}
              style={nodeStyle(node, ov, tops[slot], alignBoxes[slot], ratio)}
            >
              {runs?.length ? renderRuns(value, runs, hasFontOverride) : value}
            </div>
          );
        }

        if (node.type === 'RECTANGLE') {
          const url = slots[slot] ?? slots[`${node.id}:image`];
          const style = nodeStyle(node, ov, undefined, undefined, ratio);
          if (url) style.overflow = 'hidden';
          return (
            <div key={node.id} data-slot={slot} style={style}>
              {url && <ImageLayer url={url} image={ov.contentImage} />}
            </div>
          );
        }

        if (node.type === 'VECTOR') return <ArrowNode key={node.id} node={node} ratio={ratio} />;

        return null;
      })}
    </div>
  );
}
