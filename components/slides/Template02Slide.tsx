'use client';

import React from 'react';
import { Slide, GlobalSettings } from '@/types';
import { getFormat } from '@/lib/formats';
import { getImageLayerStyle } from '@/lib/utils';
import {
  TEMPLATE_02_COLORS,
  TEMPLATE_02_GRID,
  TEMPLATE_02_HEADER_MARGIN_X,
  TEMPLATE_02_HEADER_Y,
  TEMPLATE_02_SPEC,
  TEMPLATE_02_WIDTH,
  Template02BackgroundLayer,
  Template02Slots,
  template02Background,
  template02ContentBox,
  template02CoverTops,
  template02ElementX,
  template02HighlightLine,
  template02LayoutOf,
  template02ModelOf,
  template02SlotColor,
  template02SlotsForModel,
  template02Type,
} from '@/lib/templates/template-02';
import {
  Template02ImageOverride,
  Template02Overrides,
  template02Overrides,
  template02TypeFor,
} from '@/lib/templates/template-02/overrides';

export interface Template02SlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
}

/**
 * TEMPLATE 2 — renderiza um slide a partir de `template-02/spec.json`.
 *
 * Porte do `scripts/generate.py` da skill (spec → CSS absoluto), com React no
 * lugar de string de HTML. O spec é o VALOR PADRÃO de tudo — posição, cor,
 * tipografia, degradê e espaçamento: sem override do usuário a saída é idêntica
 * ao gabarito. As exceções deliberadas estão listadas num lugar só, em
 * `TEMPLATE_02_GABARITO_DIVERGENCES`.
 *
 * Não há motor de reflow por âncora como no Template 1: nos slides internos o
 * grupo título+corpo é centrado com flexbox dentro do container de conteúdo
 * (`top:147`, `height:1089` no 4:5), e é isso que absorve o crescimento do
 * texto. A regra estruturante do spec é essa centralização, não um `y` fixo.
 *
 * Os controles da barra lateral entram por cima, via `template02Overrides`.
 */

const { radius } = TEMPLATE_02_SPEC.tokens;

/**
 * Estilo CSS de um bloco de texto: o do spec com o estilo por slot por cima.
 *
 * Sem estilo nenhum, os números saem intactos do spec — é isso que preserva a
 * fidelidade de 0px contra o gabarito.
 */
function textStyle(slot: string, specColor: string, ov: Template02Overrides): React.CSSProperties {
  const t = template02TypeFor(slot, specColor, ov);
  return {
    fontFamily: t.font ? t.font.fontFamily : t.fontFamily,
    fontWeight: t.font ? t.font.fontWeight : t.fontWeight,
    fontStyle: t.font ? t.font.fontStyle : 'normal',
    // Os tamanhos são dízimas (76.5495px) de propósito — fidelidade ao Figma.
    fontSize: `${t.fontSize}px`,
    letterSpacing: `${t.letterSpacing}px`,
    lineHeight: `${t.lineHeight}px`,
    color: t.color,
    ...(t.underline ? { textDecoration: 'underline' } : {}),
  };
}

/**
 * Camada de imagem com posição/zoom/opacidade — os mesmos controles do editor.
 *
 * Sem ajuste do usuário o enquadramento é o `focus` do spec (`defaultPosition`),
 * que é o que o gabarito desenha.
 */
function ImageLayer({
  url,
  image,
  defaultPosition = 'center',
}: {
  url: string;
  image: Template02ImageOverride;
  defaultPosition?: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url('${url}')`,
        opacity: image.opacity,
        ...(image.position
          ? getImageLayerStyle(image.position)
          : {
              backgroundSize: 'cover',
              backgroundPosition: defaultPosition,
              backgroundRepeat: 'no-repeat',
            }),
      }}
    />
  );
}

/**
 * Cabeçalho: categoria à esquerda, @ à direita, no mesmo `y` em todo formato.
 *
 * A cor é CONDICIONAL na capa (`regraCabecalho` do spec): com imagem de fundo
 * fica branco, sem imagem fica o cinza `#767682`. Não é preciosismo — o cinza
 * tem luminância quase igual à da foto depois do scrim (contraste 1.07:1) e o
 * texto some.
 */
function Header({
  category,
  handle,
  onImage,
  ov,
}: {
  category: string;
  handle: string;
  onImage: boolean;
  ov: Template02Overrides;
}) {
  const color = onImage ? TEMPLATE_02_COLORS.textHeaderOnImage : TEMPLATE_02_COLORS.textHeader;
  const base: React.CSSProperties = { position: 'absolute', zIndex: 2, top: TEMPLATE_02_HEADER_Y };
  return (
    <>
      <div
        data-slot="header.category"
        style={{
          ...textStyle('header.category', color, ov),
          ...base,
          left: TEMPLATE_02_HEADER_MARGIN_X,
          textAlign: 'left',
        }}
      >
        {category}
      </div>
      <div
        data-slot="header.handle"
        style={{
          ...textStyle('header.handle', color, ov),
          ...base,
          right: TEMPLATE_02_HEADER_MARGIN_X,
          textAlign: 'right',
        }}
      >
        {handle}
      </div>
    </>
  );
}

/** Bloco de imagem dos slides internos. Sem imagem, o placeholder do spec. */
function ImageBlock({
  x,
  url,
  top,
  height,
  image,
}: {
  x: number;
  url?: string;
  top: number;
  height: number;
  image: Template02ImageOverride;
}) {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top,
    width: TEMPLATE_02_GRID.imageColumnWidth,
    height,
    borderRadius: radius.card,
    overflow: 'hidden',
  };
  if (url) {
    return (
      <div data-slot="content.image" style={base}>
        <ImageLayer url={url} image={image} />
      </div>
    );
  }
  // O rótulo "Imagem" não é editável: some no instante em que existe imagem, e
  // por isso não tem slot nem estilo por slot.
  const label = template02Type('imageLabel');
  return (
    <div
      data-slot="content.image"
      style={{
        ...base,
        background: TEMPLATE_02_COLORS.imagePlaceholder,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: label.fontFamily,
          fontSize: `${label.fontSize}px`,
          letterSpacing: `${label.letterSpacing}px`,
          lineHeight: `${label.lineHeight}px`,
          fontWeight: label.fontWeight,
          color: TEMPLATE_02_COLORS.textMuted,
        }}
      >
        Imagem
      </span>
    </div>
  );
}

/**
 * Coluna de texto dos slides internos.
 *
 * `justify-content: center` no container de conteúdo É a regra de centralização
 * do spec (o grupo fica centrado no mesmo eixo do bloco de imagem). Os
 * parágrafos do corpo se separam por `\n\n`; a linha vazia do meio vira um
 * parágrafo com `&nbsp;`, que é o que abre o vão — igual ao gabarito.
 */
function TextColumn({
  x,
  title,
  body,
  top,
  height,
  model,
  ov,
}: {
  x: number;
  title: string;
  body: string;
  top: number;
  height: number;
  model: number;
  ov: Template02Overrides;
}) {
  const gap = TEMPLATE_02_SPEC.regrasDeLayout.gapTituloCorpo;
  return (
    <div
      data-block="content.column"
      style={{
        position: 'absolute',
        left: x,
        top,
        width: TEMPLATE_02_GRID.textColumnWidth,
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        data-slot="content.title"
        style={textStyle('content.title', template02SlotColor('content.title', model), ov)}
      >
        {title}
      </div>
      <div style={{ height: gap, flex: 'none' }} />
      <div
        data-slot="content.body"
        style={textStyle('content.body', template02SlotColor('content.body', model), ov)}
      >
        {body.split('\n').map((p, i) => (
          // Linha vazia entre parágrafos: o `&nbsp;` do gabarito é o que abre
          // o vão — um espaço comum colapsaria.
          <p key={i} style={{ margin: 0 }}>
            {p.trim() ? p : '\u00A0'}
          </p>
        ))}
      </div>
    </div>
  );
}

const FOCUS_POSITION: Record<string, string> = {
  top: '50% 0%',
  center: '50% 50%',
  bottom: '50% 100%',
};

/** CSS do scrim da capa, montado com as paradas do spec. */
function scrimCss(layers: Template02BackgroundLayer[]): string {
  const scrim = layers.find((c) => c.tipo === 'gradient');
  const stops = (scrim?.stops ?? [])
    .map((s) => `${s.color} ${Math.round(s.pos * 100)}%`)
    .join(', ');
  return `linear-gradient(180deg, ${stops})`;
}

/**
 * Fundo da capa: camada 0 é a imagem cobrindo o frame inteiro, camada 1 é o
 * scrim preto. As duas são full-bleed e acompanham a altura do formato.
 *
 * Sem imagem o fundo cai para preto sólido e o scrim continua ali, invisível —
 * o visual original do Figma, e o mesmo comportamento do gabarito.
 */
function CoverBackground({
  url,
  layers,
  height,
  image,
}: {
  url?: string;
  layers: Template02BackgroundLayer[];
  height: number;
  image: Template02ImageOverride;
}) {
  const imgLayer = layers.find((c) => c.tipo === 'imageSlot');
  const focus = FOCUS_POSITION[imgLayer?.focus ?? 'center'] ?? '50% 50%';
  return (
    <>
      {url && (
        <div
          data-slot="cover.image"
          style={{
            position: 'absolute',
            inset: 0,
            width: TEMPLATE_02_WIDTH,
            height,
            overflow: 'hidden',
            zIndex: 0,
          }}
        >
          <ImageLayer url={url} image={image} defaultPosition={focus} />
        </div>
      )}
      <div
        data-slot="cover.scrim"
        style={{ position: 'absolute', inset: 0, zIndex: 1, background: scrimCss(layers) }}
      />
    </>
  );
}

/**
 * Headline da capa com o marcador lime.
 *
 * As quebras são MANUAIS (`\n`): cada linha vira um bloco de altura igual à
 * entrelinha. O marcador é procurado dentro de UMA linha — é o que garante a
 * regra do spec de que ele nunca cruza duas faixas. O texto sobre o lime fica
 * preto.
 */
function CoverHeadline({
  text,
  highlight,
  top,
  ov,
}: {
  text: string;
  highlight: string;
  top: number;
  ov: Template02Overrides;
}) {
  const style = textStyle('cover.headline', TEMPLATE_02_COLORS.surface, ov);
  const lineHeight = template02TypeFor('cover.headline', TEMPLATE_02_COLORS.surface, ov).lineHeight;
  const lines = text.split('\n');
  const hlLine = template02HighlightLine(text, highlight);
  // A cor do marcador acompanha o estilo do próprio marcador, que o usuário
  // pode ter mexido; o fundo lime é do template.
  const hlColor = template02TypeFor('cover.highlight', TEMPLATE_02_COLORS.ink, ov).color;
  return (
    <div
      data-slot="cover.headline"
      style={{
        position: 'absolute',
        left: 0,
        top,
        width: TEMPLATE_02_WIDTH,
        ...style,
        textAlign: 'center',
        zIndex: 2,
      }}
    >
      {lines.map((line, i) => {
        if (i !== hlLine) {
          return (
            <div key={i} style={{ height: lineHeight }}>
              {line}
            </div>
          );
        }
        const at = line.indexOf(highlight);
        return (
          <div key={i} style={{ height: lineHeight }}>
            {line.slice(0, at)}
            <span
              data-slot="cover.highlight"
              style={{
                background: TEMPLATE_02_COLORS.accent,
                color: hlColor,
                padding: '0 14px',
                margin: '0 -2px',
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              }}
            >
              {highlight}
            </span>
            {line.slice(at + highlight.length)}
          </div>
        );
      })}
    </div>
  );
}

/** Pílula branca do CTA, centrada e ancorada ao rodapé. */
function CtaPill({ text, top, ov }: { text: string; top: number; ov: Template02Overrides }) {
  const pill = template02LayoutOf(1).elementos.find((e) => e.id === 'cover.ctaPill');
  return (
    <div
      data-slot="cover.cta"
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        top,
        background: TEMPLATE_02_COLORS.surface,
        borderRadius: radius.pill,
        zIndex: 2,
        padding: `${pill?.paddingY ?? 18}px ${pill?.paddingX ?? 78}px`,
        ...textStyle('cover.cta', TEMPLATE_02_COLORS.ink, ov),
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

export default function Template02Slide({ slide, globalSettings, slideIndex }: Template02SlideProps) {
  // O desenho vem do MODELO do slide, não da posição dele no deck: o T2 não tem
  // número fixo de slides, então a posição não identifica nada. Slide sem modelo
  // gravado (deck antigo) volta a derivar da posição — ver `template02ModelOf`.
  const model = template02ModelOf(slide, slideIndex);
  const layout = template02LayoutOf(model);

  // Formato ativo. Os três compartilham a largura 1080 — só a ALTURA muda, e é
  // só ela que o template adapta. No 4:5 a razão é 1 e todo o desenho sai igual
  // ao gabarito.
  const fmt = getFormat(globalSettings.format);

  const ov = React.useMemo(() => template02Overrides(slide), [slide]);

  const slots: Template02Slots = slide.templateSlots ?? {};
  const value = (slot: string): string => {
    if (slots[slot] != null) return slots[slot];
    return template02SlotsForModel(model).find((d) => d.slot === slot)?.defaultValue ?? '';
  };

  const category = value('header.category');
  const handle = value('header.handle');

  const root: React.CSSProperties = {
    position: 'relative',
    width: TEMPLATE_02_WIDTH,
    height: fmt.height,
    overflow: 'hidden',
    background: ov.background ?? template02Background(model),
    fontKerning: 'normal',
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'geometricPrecision',
  };

  if (model === 1) {
    const bg = layout.background;
    const layers = typeof bg === 'object' ? bg.camadas : [];
    const image = slots['cover.image'] || '';
    const tops = template02CoverTops(fmt.height);
    return (
      <div className="t02-slide" data-model={model} style={root}>
        <CoverBackground
          url={image || undefined}
          layers={layers}
          height={fmt.height}
          image={ov.coverImage}
        />
        <Header category={category} handle={handle} onImage={!!image} ov={ov} />
        <CoverHeadline
          text={value('cover.headline')}
          highlight={value('cover.highlight')}
          top={tops.headline}
          ov={ov}
        />
        {/* Sem chamada, a pílula some em vez de sair como uma cápsula branca
            vazia. Um deck gerado nasce com o slot VAZIO quando a IA não
            escreveu nada — nunca com a copy do spec. */}
        {value('cover.cta').trim() !== '' && (
          <CtaPill text={value('cover.cta')} top={tops.pill} ov={ov} />
        )}
      </div>
    );
  }

  const box = template02ContentBox(fmt.height);
  return (
    <div className="t02-slide" data-model={model} style={root}>
      <Header category={category} handle={handle} onImage={false} ov={ov} />
      <ImageBlock
        x={template02ElementX(model, 'content.image')}
        url={slots['content.image'] || undefined}
        top={box.top}
        height={box.height}
        image={ov.contentImage}
      />
      <TextColumn
        x={template02ElementX(model, 'content.title')}
        title={value('content.title')}
        body={value('content.body')}
        top={box.top}
        height={box.height}
        model={model}
        ov={ov}
      />
    </div>
  );
}
