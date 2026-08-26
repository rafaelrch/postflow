'use client';

import React from 'react';
import { Slide, GlobalSettings, Template03ContentAlign, Template03GradientDirection } from '@/types';
import { getFormat } from '@/lib/formats';
import {
  TEMPLATE_03_DESIGN_TWEAKS,
  TEMPLATE_03_BADGE_ASSET,
  TEMPLATE_03_HEIGHT,
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_PALETTE,
  TEMPLATE_03_SPEC,
  TEMPLATE_03_STEP_TITULO_Y,
  TEMPLATE_03_TITULO_Y_COVER,
  TEMPLATE_03_WIDTH,
  Template03Node,
  Template03Slots,
  template03AvatarSlot,
  template03ImageSlot,
  template03ModelOf,
  template03SlotsForModel,
  template03SpecSlideOf,
  template03StepIndex,
  template03TituloY,
} from '@/lib/templates/template-03';
import {
  Template03Overrides,
  template03ContentAlignFor,
  template03ContentPositionFor,
  template03GradientSlide,
  template03GradientCss,
  template03GradientDirectionFor,
  template03Overrides,
  template03TypeFor,
} from '@/lib/templates/template-03/overrides';
import {
  Template03ProfilePart,
  Template03ProfileStyle,
  template03ProfileGeometry,
  template03ProfileStyleFor,
} from '@/lib/templates/template-03/profile';
import { getImageLayerStyle } from '@/lib/utils';

export interface Template03SlideProps {
  slide: Slide;
  globalSettings: GlobalSettings;
  slideIndex: number;
  totalSlides: number;
  forExport?: boolean;
}

/**
 * TEMPLATE 3 — "FlowLine": renderiza um slide a partir de `template-03/spec.json`.
 *
 * PORTE do `render.py` que veio no material (`creatools-flowline`), com React no
 * lugar de string de HTML — não é adaptação do `Template01Slide` nem do
 * `Template02Slide`. Nada do motor de reflow por âncora do T1
 * (`template01Tops`, `template01FormatShift`, os grupos de fluxo) existe aqui, e
 * nada dele foi importado: o FlowLine é posicionamento absoluto puro, como o
 * `render.py` faz, com UM bloco em fluxo (título + corpo) — ver `ContentBlock`.
 *
 * O spec é o valor padrão de tudo: posição, cor, tipografia, degradê. Sem
 * conteúdo do usuário a saída é o gabarito. Os desvios deliberados estão
 * listados num lugar só, em `TEMPLATE_03_DESIGN_TWEAKS` (fatia S1), e os três
 * que este componente aplica estão citados no ponto onde acontecem.
 *
 * Os controles da barra lateral (overrides) entram na fatia S3 — este componente
 * ainda desenha o spec cru.
 */

// ─── Fontes ─────────────────────────────────────────────────────
//
// As seis faces do material são byte-idênticas às que o app já serve em
// `public/fonts/template-01/` (md5 conferido no gate do plano), então NENHUM
// `@font-face` novo é declarado: reusamos as famílias já em `app/globals.css`.
//
// ⚠️ NUNCA escreva `'IvyOra Text'` nesta pilha. O app declara um `@font-face`
// com esse nome que resolve só por `local()`; quando não acha nada, o Chrome
// trata a família como definida-e-vazia e pula direto para a `serif` genérica
// (Georgia) em vez de cair no `T01Serif`. Medido no T1: 334px contra 305px.
// A pilha certa vem de `TEMPLATE_03_DESIGN_TWEAKS.serif.stack`, que já a
// registra — armadilha #5 do estudo, uma sessão inteira já queimada nela.

const FONT_STACK: Record<string, string> = {
  Inter: "'T01Inter', sans-serif",
  'Inter Display': "'T01InterDisplay', sans-serif",
  'IvyOra Text': TEMPLATE_03_DESIGN_TWEAKS.serif.stack,
};

function fontStack(family: string): string {
  return FONT_STACK[family] ?? `'${family}', sans-serif`;
}

/**
 * Corta o ruído de ponto flutuante das contas derivadas do spec.
 *
 * `955.1 − (702 + 228)` dá 25.100000000000023 em binário, e esse número inteiro
 * vai parar no CSS. Quatro casas é mais precisão do que qualquer tela tem e
 * mantém o valor idêntico ao do gabarito.
 */
function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

// ─── Os dots ────────────────────────────────────────────────────
//
// Números do `render.py` do material (o gabarito), não do spec: o spec só traz o
// texto "....." do Figma, que é justamente o que NÃO se usa.

/** Raio do ponto ACESO. */
const DOT_RADIUS = 4.2;
/** Os apagados são menores, na mesma proporção do gabarito. */
const DOT_DIM_SCALE = 0.72;
const DOT_ON = '#FFFFFF';
const DOT_OFF = 'rgba(255,255,255,0.45)';
/** Ajuste visual explícito: desce os dots sem romper a folga inferior do spec. */
export const TEMPLATE_03_DOTS_OFFSET_Y = 24;

// ─── Leitura do spec ────────────────────────────────────────────

/** O nó do spec de um slot do MODELO — `title`, `body`, `handle`, `dots`… */
function nodeOf(model: number, name: string): Template03Node | undefined {
  const slide = template03SpecSlideOf(model);
  const slot = name.startsWith('cantos.') ? name : `s${slide.index}.${name}`;
  return slide.nodes.find((n) => n.slot === slot);
}

/**
 * O slide do spec de onde sai o DEGRADÊ de cada modelo.
 *
 * 🔸 Vem de `template03GradientSlide` (overrides.ts), e não de um mapa local,
 * porque o seletor de cor da barra lateral abre com a MESMA cor que este
 * componente pinta. Dois mapas seriam duas verdades. O desvio está registrado em
 * `TEMPLATE_03_DESIGN_TWEAKS.scrimDoPasso`: o slide 2 do spec traz o degradê a
 * 358.75deg e os slides 3 e 4 a 180deg — é o MESMO passo em direções opostas, e
 * num deck ABERTO alternar por paridade faz o carrossel piscar.
 */
const gradientSlideOf = template03GradientSlide;

/**
 * O scrim que vai POR CIMA da imagem.
 *
 * 🔴 É um degradê de FAIXA, não de borda a borda: os handles do Figma definem um
 * trecho do eixo (ex.: de 17.53% a 94.13%) e o `extract_spec.py` já reprojetou
 * as paradas para a % de CSS em `cssStopsPercent`. O `css` de `backgroundLayers`
 * é essa reprojeção pronta — usá-lo verbatim é o que impede o degradê de sair
 * esticado. Nunca normalize as paradas para 0%/100%.
 */
function scrimCss(model: number, direction: Template03GradientDirection): string {
  const layer = gradientSlideOf(model).backgroundLayers?.find((l) => l.type === 'GRADIENT_SCRIM');
  return template03GradientCss(
    model,
    layer?.css ?? 'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000000 100%)',
    direction
  );
}

/**
 * O degradê CHAPADO do Figma — o que aparece quando não há imagem.
 *
 * Sem foto o slide não fica quebrado: o degradê sozinho é um slide válido, e é
 * exatamente o que a referência do Figma mostra (`reference/slide1.png` e
 * `slide3.png`). O scrim não serve aqui porque ele é transparente no topo — sem
 * imagem por baixo, sobraria o fundo do editor.
 */
function solidGradientCss(model: number, direction: Template03GradientDirection): string {
  return template03GradientCss(
    model,
    gradientSlideOf(model).background?.[0]?.css ?? TEMPLATE_03_PALETTE.preto,
    direction
  );
}

/**
 * Estilo de um bloco de texto, espelhando `node_css()` do `render.py`.
 *
 * Tudo sai do nó do spec: corpo, entrelinha em px, tracking em em, alinhamento e
 * cor. Nenhum número é redigitado — e um teste confere que a entrelinha e o
 * tracking de cada nó batem com as razões de `designSystem`
 * (100.5% título / 109.14% corpo; -0.06 / -0.03 / -0.05 / +0.17 em).
 *
 * 🔴 SEM `height`. A armadilha #6 do estudo: com a altura travada no
 * `lineHeight`, a segunda linha visual de um texto que não coube caía POR CIMA
 * da linha seguinte. Aqui a altura é a natural — uma linha que quebra EMPURRA.
 */
function textStyle(node: Template03Node, ov: Template03Overrides): React.CSSProperties {
  const t = node.typography!;
  const e = template03TypeFor(node, fontStack(t.fontFamily), ov);
  // A MARGEM empurra o bloco para DENTRO a partir da borda em que o spec o
  // ancorou: somar à esquerda um bloco ancorado à direita o empurraria para
  // fora da tela.
  const inset =
    node.anchor?.mode === 'right' ? { marginRight: e.margin } : { marginLeft: e.margin };
  return {
    fontFamily: e.font ? e.font.fontFamily : e.fontFamily,
    fontWeight: e.font ? e.font.fontWeight : e.fontWeight,
    fontStyle: e.font ? e.font.fontStyle : e.fontStyle,
    fontSize: `${round(e.fontSize)}px`,
    lineHeight: `${round(e.lineHeight)}px`,
    // O spec guarda o tracking em `em`; sem override o valor sai idêntico ao
    // gabarito, e com override ele já vem convertido para px.
    letterSpacing: ov.slotStyles[node.slot ?? '']?.letterSpacing != null
      ? `${round(e.letterSpacing)}px`
      : `${t.letterSpacingEm}em`,
    textAlign: t.textAlignHorizontal.toLowerCase() as React.CSSProperties['textAlign'],
    color: e.color,
    ...(e.underline ? { textDecoration: 'underline' } : {}),
    ...(e.opacity !== 100 ? { opacity: e.opacity / 100 } : {}),
    margin: 0,
    ...(e.margin ? { marginTop: e.margin, ...inset } : {}),
    whiteSpace: 'pre-wrap',
  };
}

/** `false` esconde o bloco — o toggle do olho na barra lateral. */
function isVisible(node: Template03Node, ov: Template03Overrides): boolean {
  return ov.slotStyles[node.slot ?? '']?.visible !== false;
}

/**
 * Largura de um bloco de texto — decidida pelo `textAutoResize` do Figma.
 *
 * `HEIGHT` = largura FIXA e altura automática: a caixa é uma restrição real do
 * desenho (o corpo, o @) e vale o número do spec.
 *
 * `WIDTH_AND_HEIGHT` = a caixa ABRAÇA o texto de fábrica; o número não é
 * restrição nenhuma, é a medida daquele texto. Usá-lo como `width` faria o texto
 * do usuário quebrar cedo — os cantos ("LOREM IPSUM" mede 104px, mas o spec
 * permite 19 caracteres) quebrariam em duas linhas ao primeiro nome de marca um
 * pouco maior. `max-content` acompanha o texto, e no tamanho de fábrica as
 * âncoras (`left`/`right` + `text-align`) põem os glifos exatamente onde o
 * gabarito põe. É a mesma correção que o Template 1 já fez nos cantos dele.
 *
 * O TÍTULO é a exceção: também é `WIDTH_AND_HEIGHT`, mas ele precisa quebrar
 * DENTRO da coluna em vez de correr para fora do canvas — ver `ContentBlock`.
 */
function textWidth(node: Template03Node): number | 'max-content' {
  return node.typography?.textAutoResize === 'HEIGHT' ? node.box.w : 'max-content';
}

/** Posição horizontal de um bloco, espelhando o `anchor` do `render.py`. */
function anchorX(node: Template03Node): React.CSSProperties {
  const width = textWidth(node);
  const mode = node.anchor?.mode;
  if (mode === 'center-x') {
    return { left: '50%', transform: 'translateX(-50%)', width };
  }
  if (mode === 'right') {
    return { right: node.box.right, width };
  }
  return { left: node.box.x, width };
}

// ─── Peças ──────────────────────────────────────────────────────

/** Um bloco de texto do spec, posicionado por `top` absoluto. */
function SpecText({
  node,
  top,
  text,
  ov,
  geometry,
  fixedProfile = false,
  inFlow = false,
}: {
  node: Template03Node;
  top: number;
  text: string;
  ov: Template03Overrides;
  geometry?: Template03ProfilePart;
  fixedProfile?: boolean;
  /** Em fluxo: sem `position:absolute` nem largura fixa — acompanha o texto. */
  inFlow?: boolean;
}) {
  if (!isVisible(node, ov)) return null;
  const horizontal = inFlow
    ? {}
    : geometry
      ? { left: geometry.left, width: geometry.width }
      : anchorX(node);
  return (
    <div
      data-slot={node.slot}
      style={{
        ...(inFlow ? {} : { position: 'absolute', top: geometry?.top ?? top }),
        ...horizontal,
        ...textStyle(node, ov),
        // No fluxo o @ não deve quebrar: ele cresce e empurra o selo.
        ...(inFlow ? { whiteSpace: 'nowrap' } : {}),
        ...(fixedProfile ? { color: TEMPLATE_03_PALETTE.branco } : {}),
        zIndex: 2,
      }}
    >
      {text}
    </div>
  );
}

/**
 * Indicador de posição — "ponto N aceso de M total", CALCULADO.
 *
 * 🔴 O texto "....." do slot `sN.dots` do spec é ignorado. O arquivo do Figma
 * tem bug de autoria documentado no `SKILL.md` do material: os frames dos slides
 * 3 e 4 foram copiados do 2 sem atualizar o ponto aceso, e os dois acendem o
 * SEGUNDO. Além disso o estado gravado é sempre de um deck de 4, e o FlowLine é
 * ABERTO — o número de pontos é o tamanho do deck, não o do Figma.
 *
 * ⚠️ As coordenadas dos círculos são LOCAIS ao SVG (0..w, 0..h), nunca as da
 * página. O `SKILL.md` avisa que o erro é fácil de cometer dentro de um SVG já
 * posicionado, e que o elemento some da área visível sem erro nenhum.
 */
function Dots({
  node,
  top,
  total,
  active,
}: {
  node: Template03Node;
  top: number;
  total: number;
  active: number;
}) {
  const { w, h, x } = node.box;
  const count = Math.max(1, Math.trunc(total));
  const on = Math.min(Math.max(1, Math.trunc(active)), count);
  const gap = w / count;
  return (
    <svg
      data-slot={node.slot}
      data-dots-total={count}
      data-dots-active={on}
      width={w}
      height={h}
      style={{ position: 'absolute', left: x, top, zIndex: 3 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <circle
          key={i}
          cx={gap / 2 + gap * i}
          cy={h / 2}
          r={i + 1 === on ? DOT_RADIUS : DOT_RADIUS * DOT_DIM_SCALE}
          fill={i + 1 === on ? DOT_ON : DOT_OFF}
        />
      ))}
    </svg>
  );
}

/**
 * Badge de verificado — asset SVG local fornecido pelo Rafael, não o asset do Figma.
 *
 * No spec o badge é um RECTANGLE com `imageRef`, que exigiria baixar mais uma
 * imagem da API. O `<img>` mantém o selo inteiro no DOM e permite que preview e
 * export usem a mesma URL local. Não é editável nem slot de conteúdo — não aparece
 * na barra lateral.
 *
 * O `viewBox` 48×48 do asset escala para a caixa do spec tanto no preview quanto
 * no DOM usado pelo export.
 */
function Badge({ node, geometry }: { node: Template03Node; geometry: Template03ProfilePart }) {
  return (
    <img
      data-slot={node.slot}
      data-badge-asset
      src={TEMPLATE_03_BADGE_ASSET}
      alt="Perfil verificado"
      draggable={false}
      width={geometry.width}
      height={geometry.height}
      style={{
        // Em fluxo dentro do wrapper `data-profile-handle-layout`: acompanha o
        // @ em vez de ficar colado no `left:409px` do spec. A caixa do spec
        // (width/height) é preservada; só a ancoragem absoluta sai.
        flexShrink: 0,
        verticalAlign: 'middle',
        overflow: 'visible',
      }}
    />
  );
}

/**
 * Avatar: elipse com a foto do perfil, ou a cor sólida do spec.
 *
 * `TEMPLATE_03_DESIGN_TWEAKS.avatarEditavel`: o spec marca o nó `editable:false`
 * e o pinta de `#DA4F4F`; aqui ele é slot de imagem. SEM foto o desenho é
 * exatamente o do spec — a fidelidade contra a referência não se mexe.
 */
function Avatar({
  node,
  geometry,
  url,
  profileStyle,
}: {
  node: Template03Node;
  geometry: Template03ProfilePart;
  url?: string;
  profileStyle: Required<Template03ProfileStyle>;
}) {
  const stroke = node.strokes?.[0];
  return (
    <div
      data-slot={node.slot}
      style={{
        position: 'absolute',
        left: geometry.left,
        top: geometry.top,
        width: geometry.width,
        height: geometry.height,
        borderRadius: '50%',
        zIndex: 3,
        overflow: 'hidden',
        ...(url
          ? { background: node.fills?.[0]?.css ?? TEMPLATE_03_PALETTE.vermelho_avatar }
          : { background: node.fills?.[0]?.css ?? TEMPLATE_03_PALETTE.vermelho_avatar }),
        ...(stroke
          ? {
              boxSizing: 'border-box' as const,
              border: `${node.strokeWeight ?? 1}px solid ${stroke.css ?? TEMPLATE_03_PALETTE.branco}`,
            }
          : {}),
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-avatar-photo
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${profileStyle.avatarPositionX}% ${profileStyle.avatarPositionY}%`,
            transform: `scale(${profileStyle.avatarZoom / 100})`,
            transformOrigin: `${profileStyle.avatarPositionX}% ${profileStyle.avatarPositionY}%`,
          }}
        />
      )}
    </div>
  );
}

/**
 * Título + corpo, o único bloco em FLUXO do template.
 *
 * O `render.py` põe os dois em `position:absolute` com `y` fixo, o que basta
 * para o texto do Figma mas não para o do usuário: um título que quebra numa
 * terceira linha passaria POR CIMA do corpo. Aqui o par vive num container
 * ancorado em `tituloY`, e o corpo herda a distância do spec como `marginTop` —
 * então o título que cresce EMPURRA o corpo, em vez de sobrepor (armadilha #6).
 *
 * Com o texto de fábrica o resultado é idêntico ao gabarito: a distância é
 * `body.y − (title.y + title.h)`, lida do spec, e as duas linhas do título
 * ocupam exatamente a altura da caixa dele.
 *
 * A COLUNA tem a largura do corpo (a única das duas caixas que é restrição de
 * verdade — o `textAutoResize` do título é `WIDTH_AND_HEIGHT`, ou seja, a caixa
 * abraça o texto de fábrica). Assim o título do usuário quebra dentro da mesma
 * coluna do corpo em vez de correr para fora do canvas.
 */
function ContentBlock({
  titleNode,
  bodyNode,
  top,
  title,
  body,
  ov,
  align,
  left,
}: {
  titleNode: Template03Node;
  bodyNode: Template03Node;
  top: number;
  title: string;
  body: string;
  ov: Template03Overrides;
  align: Template03ContentAlign;
  left: number;
}) {
  const gap = round(bodyNode.box.y - (titleNode.box.y + titleNode.box.h));
  // 'esquerda' é o gabarito (o spec do FlowLine alinha à esquerda): sem override
  // de alinhamento, mantém o text-align do spec. Só 'centro'/'direita' o
  // sobrescrevem — assim o "Restaurar" volta ao alinhamento original.
  const overrideAlign =
    align === 'centro' ? 'center' : align === 'direita' ? 'right' : null;
  // A largura permanece a do corpo no spec. Para passos ela é menor que a
  // tela, então centro/direita também movem a coluna; na capa o corpo já ocupa
  // quase toda a largura e centro coincide naturalmente com o spec.
  const titleStyle =
    overrideAlign != null
      ? ({ ...textStyle(titleNode, ov), textAlign: overrideAlign } as React.CSSProperties)
      : textStyle(titleNode, ov);
  const bodyStyle =
    overrideAlign != null
      ? ({
          ...textStyle(bodyNode, ov),
          marginTop: gap + (ov.slotStyles[bodyNode.slot ?? '']?.margin ?? 0),
          textAlign: overrideAlign,
        } as React.CSSProperties)
      : ({ ...textStyle(bodyNode, ov), marginTop: gap + (ov.slotStyles[bodyNode.slot ?? '']?.margin ?? 0) } as React.CSSProperties);
  return (
    <div
      data-block="conteudo"
      style={{
        position: 'absolute',
        left,
        top,
        width: bodyNode.box.w,
        zIndex: 2,
      }}
    >
      {isVisible(titleNode, ov) && (
        <div data-slot={titleNode.slot} style={titleStyle}>
          {title}
        </div>
      )}
      {isVisible(bodyNode, ov) && (
        <div
          data-slot={bodyNode.slot}
          style={bodyStyle}
        >
          {body}
        </div>
      )}
    </div>
  );
}

/**
 * Limite direito visual dos nós que o usuário vê, não da caixa técnica criada
 * para reflow. O alinhamento direita ancora nos bounds reais do título/corpo;
 * uma margem que o slot tenha gravado do lado direito é espaço não visual.
 */
function contentVisualRightFor(
  nodes: Template03Node[],
  ov: Template03Overrides,
): number {
  const visible = nodes.filter((node) => isVisible(node, ov));
  const candidates = (visible.length > 0 ? visible : nodes).map((node) => {
    const margin = ov.slotStyles[node.slot ?? '']?.margin ?? 0;
    const rightInset = node.anchor?.mode === 'right' ? margin : 0;
    return node.box.x + node.box.w - rightInset;
  });
  return Math.max(...candidates);
}

function contentLeftFor(
  align: Template03ContentAlign,
  bodyWidth: number,
  defaultLeft: number,
  visualRight: number,
): number {
  return align === 'centro'
    ? Math.round((TEMPLATE_03_WIDTH - bodyWidth) / 2)
    : align === 'direita'
      ? Math.round(visualRight - bodyWidth)
      : defaultLeft;
}

// ─── Adaptação de formato ───────────────────────────────────────
//
// Os três formatos compartilham a LARGURA 1080 (`lib/formats.ts`) — só a altura
// muda, e é só ela que o template adapta. Nada horizontal se mexe.
//
// 🔴 No 4:5 toda conta daqui é NO-OP: `fmt.height === TEMPLATE_03_HEIGHT`, a
// razão é 1 e as distâncias absolutas devolvem o próprio `y` do spec. Se algo
// mudar 1px ali, a régua contra o gabarito já era.

/**
 * Distância ABSOLUTA ao rodapé de um bloco ancorado embaixo.
 *
 * Margem que escala vira margem gigante no 9:16 — por isso os dots ficam sempre
 * a 120px do rodapé (1350 − 1184 − 46), em qualquer formato.
 */
function bottomAnchored(node: Template03Node, height: number): number {
  const gapToBottom = TEMPLATE_03_HEIGHT - node.box.y - node.box.h;
  return round(height - gapToBottom - node.box.h);
}

/**
 * Altura MÁXIMA que o bloco título+corpo pode ocupar, pelos limites do spec.
 *
 * `maxLines` do título × entrelinha + o vão do spec + `maxLines` do corpo ×
 * entrelinha. Texto maior que isto o contador da barra lateral já acusa em
 * vermelho, então é o pior caso que o desenho precisa aguentar.
 */
function maxBlockHeight(model: number): number {
  const title = nodeOf(model, 'title')!;
  const body = nodeOf(model, 'body')!;
  const d = template03SlotsForModel(model);
  const maxTitle = d.find((x) => x.slot === title.slot)?.maxLines ?? 3;
  const maxBody = d.find((x) => x.slot === body.slot)?.maxLines ?? 2;
  const gap = body.box.y - (title.box.y + title.box.h);
  return maxTitle * title.typography!.lineHeightPx + gap + maxBody * body.typography!.lineHeightPx;
}

/** O `tituloY` mais FUNDO que o modelo alcança — a capa é fixa; o passo cicla. */
function deepestTituloY(model: number): number {
  return model === TEMPLATE_03_MODEL_COVER
    ? TEMPLATE_03_TITULO_Y_COVER
    : Math.max(...TEMPLATE_03_STEP_TITULO_Y);
}

/**
 * O VÃO que o spec deixa entre a base do bloco e o topo dos dots, no 4:5.
 *
 * Não é número escolhido: é a folga que o próprio gabarito tem na posição mais
 * funda do modelo. É ela que o teto preserva nos outros formatos.
 */
function specClearance(model: number): number {
  const dotsTop = bottomAnchored(nodeOf(model, 'dots')!, TEMPLATE_03_HEIGHT);
  return dotsTop - (deepestTituloY(model) + maxBlockHeight(model));
}

/**
 * `y` do bloco de título no formato ativo.
 *
 * A regra é PROPORCIONAL, e não absoluta como nos cantos e nos dots: a descida
 * progressiva do FlowLine (358 → 536 → 750) é uma proporção do canvas, é ela que
 * dá a sensação de avanço. Uma distância absoluta ao topo faria o terceiro passo
 * do 9:16 parar no primeiro terço da tela.
 *
 * 🔴 COM TETO. O proporcional puro COLIDE no 1:1: ali a altura cai 270px, os
 * dots sobem os mesmos 270 (são absolutos ao rodapé) e o bloco sobe só
 * `270 × tituloY / 1350`. Medido no navegador, com o conteúdo de exemplo do
 * próprio material — nem é o pior caso dos limites: a capa invadia os dots em
 * **38,69px** e o passo mais fundo em **92,02px**. Texto por cima dos dots não é
 * escolha de desenho, é defeito.
 *
 * O teto: a base do bloco nunca passa do topo dos dots menos o vão do spec.
 *
 * ⚠️ No 4:5 ele NUNCA engata, e isso é aritmética, não sorte: ali o teto vale
 * exatamente `deepestTituloY(model)` — é dele que o vão foi derivado —, então o
 * `Math.min` devolve o proporcional em toda posição do ciclo e empata na mais
 * funda. A régua contra o gabarito continua intacta, e o teste de no-op prova.
 *
 * Custo aceito (decisão do Tech Lead, 25/08, §4.1 do plano): no 1:1 os três
 * passos do ciclo ficam mais perto uns dos outros e a sensação de avanço encolhe
 * NAQUELE formato.
 */
export function template03BlockTop(tituloY: number, height: number, model: number): number {
  const proporcional = (tituloY * height) / TEMPLATE_03_HEIGHT;
  const dotsTop = bottomAnchored(nodeOf(model, 'dots')!, height);
  const teto = dotsTop - specClearance(model) - maxBlockHeight(model);
  return round(Math.min(proporcional, teto));
}

// ─── O slide ────────────────────────────────────────────────────

export default function Template03Slide({
  slide,
  globalSettings,
  slideIndex,
  totalSlides,
}: Template03SlideProps) {
  // O desenho vem do MODELO do slide, não da posição: o FlowLine é um deck
  // ABERTO, então a posição não identifica nada. Slide sem modelo gravado volta
  // a derivar da posição — ver `template03ModelOf`.
  const model = template03ModelOf(slide, slideIndex);
  const isCover = model === TEMPLATE_03_MODEL_COVER;
  const gradientDirection = template03GradientDirectionFor(slide, model);
  const fmt = getFormat(globalSettings.format);

  // Só o que o usuário de fato MARCOU. Sem gesto nenhum isto vem vazio e o
  // desenho sai idêntico ao spec — é o que faz o "Restaurar" voltar ao gabarito
  // apagando `templateOverrides` e `templateSlotStyles`.
  const ov = React.useMemo(
    () => template03Overrides(slide, globalSettings),
    [slide, globalSettings]
  );

  const slots: Template03Slots = slide.templateSlots ?? {};
  const value = (slot: string): string => {
    if (slots[slot] != null) return slots[slot];
    return template03SlotsForModel(model).find((d) => d.slot === slot)?.defaultValue ?? '';
  };

  const titleNode = nodeOf(model, 'title')!;
  const bodyNode = nodeOf(model, 'body')!;
  const handleNode = nodeOf(model, 'handle')!;
  const avatarNode = nodeOf(model, 'avatar')!;
  const badgeNode = nodeOf(model, 'badge')!;
  const dotsNode = nodeOf(model, 'dots')!;
  const leftNode = nodeOf(model, 'cantos.left')!;
  const rightNode = nodeOf(model, 'cantos.right')!;

  // A capa fica em 702; o passo entra no ciclo [358, 536, 750], que nunca
  // estoura o canvas (ver TEMPLATE_03_DESIGN_TWEAKS.tituloYCiclico).
  const tituloY = isCover
    ? TEMPLATE_03_TITULO_Y_COVER
    : template03TituloY(template03StepIndex(slideIndex));
  const blockTopBase = template03BlockTop(tituloY, fmt.height, model);
  // Sem override, a posição do modelo é soberana: capa 702 e passos
  // 358/536/750. Só um gesto explícito troca para as âncoras do painel.
  const contentPosition = template03ContentPositionFor(slide, model);
  const contentAlign = template03ContentAlignFor(slide, model);
  let blockTop = blockTopBase;
  const explicitPosition = slide.templateOverrides?.contentPosition;
  if (explicitPosition === 'topo') {
    blockTop = 160;
  } else if (explicitPosition === 'centro') {
    blockTop = Math.round((fmt.height - maxBlockHeight(model)) / 2);
  } else if (explicitPosition === 'baixo') {
    blockTop = Math.max(0, Math.round(fmt.height - maxBlockHeight(model) - 140));
  }

  const profileStyle = template03ProfileStyleFor(slide, model);
  // O wrapper renderizado tem a MESMA âncora e largura da coluna título+corpo.
  // O visual interno conserva as coordenadas do spec; isso separa o referencial
  // da barra da caixa que deve acompanhar o alinhamento do conteúdo.
  const profile = template03ProfileGeometry(model, blockTop, profileStyle);
  const visualContentRight = contentVisualRightFor([titleNode, bodyNode], ov);
  const contentLeft = contentLeftFor(
    contentAlign,
    bodyNode.box.w,
    titleNode.box.x,
    visualContentRight,
  );
  const profileParts = [profile.avatar, profile.handle, profile.badge];
  const profileBoundsLeft = Math.min(...profileParts.map((part) => part.left));
  const profileBoundsRight = Math.max(...profileParts.map((part) => part.left + part.width));
  const profileBoundsTop = Math.min(...profileParts.map((part) => part.top));
  const profileBoundsBottom = Math.max(...profileParts.map((part) => part.top + part.height));
  const profileWidth = profileBoundsRight - profileBoundsLeft;
  const profileHeight = profileBoundsBottom - profileBoundsTop;
  const profileVisualOffsetX = contentAlign === 'esquerda'
    ? 0
    : contentAlign === 'direita'
      ? bodyNode.box.w - profileWidth
      : (bodyNode.box.w - profileWidth) / 2;
  const profileTransformOriginX = contentAlign === 'esquerda'
    ? 0
    : contentAlign === 'direita'
      ? bodyNode.box.w
      : bodyNode.box.w / 2;
  const profileVisible = ov.slotStyles[handleNode.slot!]?.visible !== false;
  // A Barra de perfil ignora overrides tipográficos históricos: o grupo segue a
  // fonte/cor e as medidas do spec, mantendo apenas a visibilidade do @.
  const profileOv: Template03Overrides = {
    ...ov,
    slotStyles: {
      ...ov.slotStyles,
      [handleNode.slot!]: { visible: ov.slotStyles[handleNode.slot!]?.visible },
    },
  };

  const image = slots[template03ImageSlot(model)] || '';
  const avatar = slots[template03AvatarSlot(model)] || '';

  const root: React.CSSProperties = {
    position: 'relative',
    width: TEMPLATE_03_WIDTH,
    height: fmt.height,
    overflow: 'hidden',
    // Cor escolhida pelo usuário substitui o degradê inteiro. Sem a MARCA, o
    // degradê do Figma é o fundo — e sozinho já é um slide válido.
    background: ov.background ?? (image ? TEMPLATE_03_PALETTE.preto : solidGradientCss(model, gradientDirection)),
    fontKerning: 'normal',
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'geometricPrecision',
  };

  return (
    <div className="t03-slide" data-model={model} style={root}>
      {/* Camadas, de baixo para cima: foto → scrim → texto. */}
      {image && (
        <div
          data-layer="imagem"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url('${image}')`,
            // Sem ajuste do usuário o enquadramento é o do gabarito: cover,
            // centrado. Com ajuste, valem os sliders do painel de imagem.
            ...(ov.image.position
              ? getImageLayerStyle(ov.image.position)
              : {
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }),
            ...(ov.image.opacity != null ? { opacity: ov.image.opacity } : {}),
            zIndex: 0,
          }}
        />
      )}
      {image && (
        <div
          data-layer="scrim"
          style={{ position: 'absolute', inset: 0, background: scrimCss(model, gradientDirection), zIndex: 1 }}
        />
      )}

      {/* Cantos: distância ABSOLUTA ao topo, igual nos três formatos. */}
      <SpecText node={leftNode} top={leftNode.box.y} text={value('cantos.left')} ov={ov} />
      <SpecText node={rightNode} top={rightNode.box.y} text={value('cantos.right')} ov={ov} />

      {/* Barra de perfil: uma transformação única mantém @, avatar, selo e check sincronizados. */}
      <div
        data-profile-group
        data-profile-visible={profileVisible}
        aria-hidden={!profileVisible}
        style={{
          position: 'absolute',
          left: contentLeft,
          top: blockTop,
          width: bodyNode.box.w,
          height: profileHeight,
          transform: `scale(${profile.group.scale})`,
          // Esquerda ancora a borda esquerda; centro preserva o centro; direita
          // ancora a borda direita, inclusive quando profileScale transforma o wrapper.
          transformOrigin: `${profileTransformOriginX}px 0px`,
          zIndex: 3,
          pointerEvents: 'none',
          ...(profileVisible ? {} : { display: 'none' }),
        }}
      >
        <div
          data-profile-visual
          style={{
            position: 'absolute',
            left: profileVisualOffsetX - profileBoundsLeft,
            top: -blockTop,
            width: profileWidth,
            height: profileHeight,
          }}
        >
          <Avatar
            node={avatarNode}
            geometry={profile.avatar}
            url={avatar || undefined}
            profileStyle={profileStyle}
          />
          {/* Handle + selo verificado vivem em fluxo ancorado no @; ambos estão
              dentro do mesmo visual para receber exatamente a mesma escala e
              translação do avatar. */}
          <div
            data-profile-handle-layout
            style={{
              position: 'absolute',
              top: profile.handle.top,
              left: profile.handle.left,
              display: 'inline-flex',
              minWidth: `${profile.handle.width}px`,
              alignItems: 'center',
              gap: 6,
            }}
          >
            <SpecText
              node={handleNode}
              top={profile.handle.top}
              geometry={profile.handle}
              text={value(handleNode.slot!)}
              ov={profileOv}
              fixedProfile
              inFlow
            />
            <Badge node={badgeNode} geometry={profile.badge} />
          </div>
        </div>
      </div>

      <ContentBlock
        titleNode={titleNode}
        bodyNode={bodyNode}
        top={blockTop}
        title={value(titleNode.slot!)}
        body={value(bodyNode.slot!)}
        ov={ov}
        align={contentAlign}
        left={contentLeft}
      />

      <Dots
        node={dotsNode}
        top={bottomAnchored(dotsNode, fmt.height) + TEMPLATE_03_DOTS_OFFSET_Y}
        total={totalSlides}
        active={slideIndex + 1}
      />
    </div>
  );
}
