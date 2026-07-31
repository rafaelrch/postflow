'use client';

import React from 'react';
import { Slide, GlobalSettings } from '@/types';
import { getImageLayerStyle } from '@/lib/utils';
import {
  TEMPLATE_01_SPEC,
  TEMPLATE_01_WIDTH,
  TEMPLATE_01_HEIGHT,
  Template01Slots,
  Template01BlockMetrics,
  template01SpecLines,
  template01Tops,
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

// Família do Figma → família declarada em globals.css. Os nomes são prefixados
// porque o app já tem uma face 'IvyOra Text' que resolve via local() e não
// serve aqui: no template a serifada é a substituta embutida.
const FONT_STACK: Record<string, string> = {
  Inter: "'T01Inter', sans-serif",
  'Inter Display': "'T01InterDisplay', sans-serif",
  'IvyOra Text': "'T01Serif', serif",
};

function fontStack(family: string): string {
  return FONT_STACK[family] ?? `'${family}', sans-serif`;
}

/** Tipografia do bloco depois do override — o spec é só o ponto de partida. */
function effectiveType(node: SpecNode, o: Template01TextOverride) {
  const t = node.typography!;
  const fontSizePx = t.fontSizePx * o.fontScale;
  // A entrelinha acompanha o tamanho: escalar só a fonte colaria as linhas.
  const lineHeightPx =
    o.lineHeightRatio != null ? fontSizePx * o.lineHeightRatio : t.lineHeightPx * o.fontScale;
  return { fontSizePx, lineHeightPx };
}

/** Espelha `node_css()` do render.py, com os overrides do usuário por cima. */
function nodeStyle(node: SpecNode, ov: Template01Overrides, top?: number): React.CSSProperties {
  const b = node.box;
  const css: React.CSSProperties = { position: 'absolute' };

  if (node.type === 'TEXT' && node.typography && node.anchor) {
    const t = node.typography;
    const o = ov[template01Kind(node)];
    const { fontSizePx, lineHeightPx } = effectiveType(node, o);

    if (node.anchor.mode === 'center-x') {
      css.left = '50%';
      css.transform = 'translateX(-50%)';
      css.width = b.w;
    } else if (node.anchor.mode === 'right') {
      css.right = b.right;
      css.width = b.w;
    } else {
      css.left = b.x;
      css.width = b.w;
    }
    css.top = top ?? b.y;
    css.fontFamily = o.font ? o.font.fontFamily : fontStack(t.fontFamily);
    css.fontWeight = o.font ? o.font.fontWeight : t.fontWeight || 400;
    css.fontStyle = o.font ? o.font.fontStyle : t.italic ? 'italic' : 'normal';
    // Os tamanhos são dízimas (80,8654px) de propósito — fidelidade ao Figma.
    css.fontSize = `${fontSizePx}px`;
    css.lineHeight = `${lineHeightPx}px`;
    css.letterSpacing = `${o.letterSpacingEm ?? t.letterSpacingEm}em`;
    css.textAlign = t.textAlignHorizontal.toLowerCase() as React.CSSProperties['textAlign'];
    css.color = o.color ?? node.fills?.[0]?.css;
    if (o.underline) css.textDecoration = 'underline';
    css.margin = 0;
    css.whiteSpace = 'pre-wrap';
  } else {
    css.left = b.x;
    css.top = b.y;
    css.width = b.w;
    css.height = b.h;
    if (node.cornerRadius) css.borderRadius = node.cornerRadius;
    if (node.fills?.length) css.background = node.fills[0].css ?? 'transparent';
    if (node.strokes?.length) {
      css.boxSizing = 'border-box';
      css.border = `${node.strokeWeight || 1}px solid ${node.strokes[0].css}`;
    }
  }

  if (node.opacity !== undefined && node.opacity !== 1) css.opacity = node.opacity;
  if (node.type === 'TEXT') {
    const o = ov[template01Kind(node)];
    if (o.opacity !== undefined) css.opacity = o.opacity;
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
    const end = isLast ? value.length : Math.min(run.end, value.length);
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
 */
function ArrowNode({ node }: { node: SpecNode }) {
  const b = node.box;
  const L = b.h;
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
      style={{ position: 'absolute', left: cx - pad, top: b.y, overflow: 'visible' }}
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
  // O deck tem 6 slides fixos; um índice fora da faixa cai no último.
  const specSlide =
    TEMPLATE_01_SPEC.slides[Math.min(slideIndex, TEMPLATE_01_SPEC.slides.length - 1)];

  const ov = React.useMemo(
    () => template01Overrides(slide, globalSettings),
    [slide, globalSettings]
  );

  const slots: Template01Slots = React.useMemo(() => {
    const fromSlide = slide.templateSlots ?? {};
    // A imagem escolhida pelos controles genéricos do editor vale como imagem
    // do slide quando o slot correspondente ainda está vazio.
    const fallbackImage = slide.backgroundImageUrl || slide.gridImageUrl || slide.contentImageUrl || '';
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
    for (const node of specSlide.nodes) {
      if (node.type !== 'TEXT' || !node.typography || !node.slot) continue;
      out[node.slot] = effectiveType(node, ov[template01Kind(node)]).lineHeightPx;
    }
    return out;
  }, [specSlide, ov]);

  React.useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      const scale = root.getBoundingClientRect().height / TEMPLATE_01_HEIGHT;
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

  const tops = React.useMemo(
    () => template01Tops(specSlide.index, metrics),
    [specSlide.index, metrics]
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
        height: TEMPLATE_01_HEIGHT,
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

      {specSlide.nodes.map((node) => {
        // GROUP não gera caixa: os filhos já vêm achatados no spec.
        if (node.type === 'GROUP') return null;

        const slot = node.slot || node.name;

        if (node.type === 'TEXT' && node.text) {
          if (ov.hideCorners && template01Kind(node) === 'corner') return null;
          const value = slots[slot] ?? slots[node.id] ?? node.text.characters;
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
              style={nodeStyle(node, ov, tops[slot])}
            >
              {runs?.length ? renderRuns(value, runs, hasFontOverride) : value}
            </div>
          );
        }

        if (node.type === 'RECTANGLE') {
          const url = slots[slot] ?? slots[`${node.id}:image`];
          const style = nodeStyle(node, ov);
          if (url) style.overflow = 'hidden';
          return (
            <div key={node.id} data-slot={slot} style={style}>
              {url && <ImageLayer url={url} image={ov.contentImage} />}
            </div>
          );
        }

        if (node.type === 'VECTOR') return <ArrowNode key={node.id} node={node} />;

        return null;
      })}
    </div>
  );
}
