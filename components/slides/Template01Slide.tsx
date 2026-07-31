'use client';

import React from 'react';
import { Slide, GlobalSettings } from '@/types';
import {
  TEMPLATE_01_SPEC,
  TEMPLATE_01_WIDTH,
  TEMPLATE_01_HEIGHT,
  Template01Slots,
  SpecNode,
  SpecSlide,
  SpecStyledRun,
} from '@/lib/templates/template-01';

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
 * de string de HTML. Nada de forma é decidido aqui: posição, cor, tipografia,
 * degradê e espaçamento saem do spec. O componente só injeta texto e imagem.
 *
 * Diferença deliberada em relação ao render.py: quando um slot com runs de
 * estilo (o `s1.eyebrow`, bold + light) é editado, os runs são reaplicados por
 * índice de caractere em vez de descartados — o spec define o ponto de virada
 * por caractere, e perder isso mudaria o desenho do slide.
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

/** Espelha `node_css()` do render.py. */
function nodeStyle(node: SpecNode): React.CSSProperties {
  const b = node.box;
  const css: React.CSSProperties = { position: 'absolute' };

  if (node.type === 'TEXT' && node.typography && node.anchor) {
    const t = node.typography;
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
    css.top = b.y;
    css.fontFamily = fontStack(t.fontFamily);
    css.fontWeight = t.fontWeight || 400;
    css.fontStyle = t.italic ? 'italic' : 'normal';
    // Os tamanhos são dízimas (80,8654px) de propósito — fidelidade ao Figma.
    css.fontSize = `${t.fontSizePx}px`;
    css.lineHeight = `${t.lineHeightPx}px`;
    css.letterSpacing = `${t.letterSpacingEm}em`;
    css.textAlign = t.textAlignHorizontal.toLowerCase() as React.CSSProperties['textAlign'];
    css.color = node.fills?.[0]?.css;
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
  return css;
}

/**
 * Aplica os runs de estilo do spec ao texto atual. Com o texto original a saída
 * é idêntica ao Figma; com texto editado os limites são fatiados por caractere e
 * o excedente herda o estilo do último run.
 */
function renderRuns(value: string, runs: SpecStyledRun[]): React.ReactNode {
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
    if (ov.fontWeight) style.fontWeight = ov.fontWeight;
    if (ov.fontFamily) style.fontFamily = fontStack(ov.fontFamily);
    if (ov.italic) style.fontStyle = 'italic';
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

/** Fundo do slide: imagem + scrim quando o spec declara camadas, senão a cor. */
function slideBackground(spec: SpecSlide, slots: Template01Slots): string {
  const layers = spec.backgroundLayers;
  if (!layers?.length) return spec.background[0]?.css ?? '#fff';

  const scrim = layers.find((l) => l.type === 'GRADIENT_SCRIM')?.css;
  const imageSlot = layers.find((l) => l.type === 'IMAGE_SLOT')?.slot;
  const url = imageSlot ? slots[imageSlot] : undefined;
  if (url && scrim) return `${scrim}, url('${url}') center/cover no-repeat`;
  // Sem imagem, mostra o degradê original do Figma — mesmo comportamento do
  // render.py, que serve de gabarito de inspeção.
  return spec.background[0]?.css ?? '#fff';
}

export default function Template01Slide({ slide, slideIndex }: Template01SlideProps) {
  // O deck tem 6 slides fixos; um índice fora da faixa cai no último.
  const specSlide =
    TEMPLATE_01_SPEC.slides[Math.min(slideIndex, TEMPLATE_01_SPEC.slides.length - 1)];

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

  return (
    <div
      className="t01-slide"
      style={{
        position: 'relative',
        width: TEMPLATE_01_WIDTH,
        height: TEMPLATE_01_HEIGHT,
        overflow: 'hidden',
        background: slideBackground(specSlide, slots),
        fontKerning: 'normal',
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'geometricPrecision',
      }}
    >
      {specSlide.nodes.map((node) => {
        // GROUP não gera caixa: os filhos já vêm achatados no spec.
        if (node.type === 'GROUP') return null;

        const slot = node.slot || node.name;

        if (node.type === 'TEXT' && node.text) {
          const value = slots[slot] ?? slots[node.id] ?? node.text.characters;
          const runs = node.text.styledRuns;
          return (
            <div key={node.id} data-slot={slot} style={nodeStyle(node)}>
              {runs?.length ? renderRuns(value, runs) : value}
            </div>
          );
        }

        if (node.type === 'RECTANGLE') {
          const url = slots[slot] ?? slots[`${node.id}:image`];
          const style = nodeStyle(node);
          if (url) {
            style.backgroundImage = `url('${url}')`;
            style.backgroundSize = 'cover';
            style.backgroundPosition = 'center';
          }
          return <div key={node.id} data-slot={slot} style={style} />;
        }

        if (node.type === 'VECTOR') return <ArrowNode key={node.id} node={node} />;

        return null;
      })}
    </div>
  );
}
