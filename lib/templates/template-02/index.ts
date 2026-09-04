import specJson from './spec.json';

/**
 * TEMPLATE 2 — spec tipado + helpers.
 *
 * O `spec.json` é cópia VERBATIM do spec da skill `creatools-template-2` e é
 * read-only: é a régua contra a qual a fidelidade é medida. Este módulo lê dali
 * tudo o que descreve a forma (posição, cor, tipografia, limites) e não redigita
 * número nenhum.
 *
 * Diferença estrutural em relação ao Template 1: o spec do T1 é um dump de nós
 * do Figma (`slides[].nodes[]` com box e tipografia), então o render percorre
 * nós. O do T2 é uma descrição de TOKENS + LAYOUTS, e quem descreve o desenho de
 * verdade é o renderizador de referência (`scripts/generate.py` da skill). Por
 * isso o `Template02Slide.tsx` é um porte do `generate.py`, e nada do motor do
 * T1 (`template01Nodes`, `template01Tops`, o reflow por âncora) vale aqui: o T2
 * centra o grupo título+corpo com flexbox dentro do container de conteúdo, o que
 * já resolve crescimento de texto sozinho.
 */

// ─── Tipos do spec ──────────────────────────────────────────────

export interface Template02ColorToken {
  value: string;
  uso?: string;
  razao?: string;
}

export interface Template02FontToken {
  family: string;
  postScript: string;
  weight: number;
  uso?: string;
}

/** Papel tipográfico do spec — a chave de `tokens.font`. */
export type Template02FontRole = 'display' | 'serif' | 'body' | 'ui';

export interface Template02TypeToken {
  /** Tamanho com as casas decimais do Figma. Arredondar muda a quebra de linha. */
  exact: number;
  normalized: number;
  letterSpacing: number;
  lineHeight: number;
  font: Template02FontRole;
  case?: string;
  align?: string;
}

export type Template02TypeName =
  | 'coverHeadline'
  | 'slideTitle'
  | 'slideBody'
  | 'ctaLabel'
  | 'imageLabel'
  | 'headerMeta';

export interface Template02Grid {
  marginX: number;
  contentTop: number;
  contentBottom: number;
  contentHeight: number;
  verticalCenter: number;
  headerY: number;
  headerMarginX: number;
  imageColumnWidth: number;
  textColumnWidth: number;
  columnGap: number;
  nota?: string;
}

export interface Template02GradientStop {
  pos: number;
  color: string;
  razao?: string;
}

export interface Template02BackgroundLayer {
  z: number;
  tipo: 'imageSlot' | 'gradient' | 'conteudo';
  id?: string;
  focus?: string;
  stops?: Template02GradientStop[];
}

export interface Template02Element {
  id: string;
  tipo: string;
  /** `"auto"` nos elementos centrados da capa. */
  x?: number | string;
  y?: number;
  w?: number;
  h?: number;
  radius?: number;
  paddingX?: number;
  paddingY?: number;
  style?: Template02TypeName;
  color?: string;
  align?: string;
  conteudoExemplo?: string;
}

export type Template02LayoutId = 'cover' | 'content-left' | 'content-right';

export interface Template02Layout {
  id: Template02LayoutId;
  nome: string;
  background: string | { tipo: string; camadas: Template02BackgroundLayer[] };
  elementos: Template02Element[];
}

export interface Template02Limits {
  maxChar?: number;
  maxCharPorLinha?: number;
  maxLinhas?: number;
  regra?: string;
  /** Como o corpo se divide, em português — o prompt da IA cita isto. */
  paragrafos?: string;
  quebra?: string;
  medidoEm?: string;
}

export interface Template02Spec {
  id: string;
  name: string;
  canvas: { width: number; height: number; aspectRatio: string };
  tokens: {
    color: Record<string, Template02ColorToken>;
    font: Record<Template02FontRole, Template02FontToken>;
    /**
     * As duas constantes que valem para TODOS os textos do template:
     * entrelinha = 109.14% do corpo, tracking = -6% nos display e -5% nos de
     * corpo/UI. Cada entrada de `typeScale` já traz os números aplicados; isto
     * é a régua que prova que continuam batendo.
     */
    typeRules: {
      lineHeightRatio: number;
      letterSpacingRatio: { display: number; body: number };
      nota?: string;
    };
    typeScale: Record<Template02TypeName, Template02TypeToken>;
    radius: { none: number; card: number; pill: number };
    grid: Template02Grid;
  };
  chrome: { descricao: string; elementos: Template02Element[] };
  layouts: Template02Layout[];
  regrasDeLayout: { gapTituloCorpo: number; [k: string]: unknown };
  regrasDeGeracao: {
    sequenciaPadrao: Template02LayoutId[];
    limitesDeTexto: Record<string, Template02Limits>;
    [k: string]: unknown;
  };
  camposEditaveis: {
    global: Record<string, { tipo: string; default: string; case?: string; maxChar?: number }>;
    [k: string]: unknown;
  };
}

export const TEMPLATE_02_SPEC = specJson as unknown as Template02Spec;

export const TEMPLATE_02_WIDTH = TEMPLATE_02_SPEC.canvas.width;
export const TEMPLATE_02_HEIGHT = TEMPLATE_02_SPEC.canvas.height;

/** Hex de cada token de cor, pelo nome do spec (`ink`, `paper`, `accent`…). */
export const TEMPLATE_02_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(TEMPLATE_02_SPEC.tokens.color).map(([k, v]) => [k, v.value])
);

export const TEMPLATE_02_GRID = TEMPLATE_02_SPEC.tokens.grid;

// ─── Desvios deliberados do spec ────────────────────────────────

/**
 * AJUSTES DE DESIGN PEDIDOS PELO RAFAEL (dono do produto) — desvios conscientes
 * do spec, e o ÚNICO lugar onde eles existem.
 *
 * O `spec.json` é read-only: é o gabarito contra o qual a fidelidade é medida, e
 * editá-lo apagaria a régua junto com o desvio. Por isso o ajuste vive aqui,
 * como camada por cima, com o valor ORIGINAL do spec anotado ao lado.
 *
 * Critério de fidelidade: 0px contra o gabarito em tudo, EXCETO o que estiver
 * listado aqui.
 */
export const TEMPLATE_02_DESIGN_TWEAKS = {
  /**
   * Família serifada dos títulos internos (`slideTitle`).
   *
   * spec: `Newsreader` (Google Fonts / SIL OFL). O motivo está escrito no
   * próprio spec — *"IvyOra Text é fonte comercial (Ivy Foundry). Precisa de
   * licença de webfont"*.
   *
   * **Esse motivo não vale mais.** O Rafael tem a licença e o projeto web do
   * Adobe Fonts já está carregado (o `<link>` do Typekit em `app/layout.tsx`),
   * servindo a família `ivyora-text`. Ele pediu explicitamente que o serifado do
   * T2 seja IvyOra, como no Template 1.
   *
   * ⚠️ Nunca escreva `'IvyOra Text'` nesta pilha. O app declara um `@font-face`
   * com esse nome que resolve só por `local()`; quando não acha nada, o Chrome
   * trata a família como definida-e-vazia e pula direto para a `serif` genérica
   * (Georgia) em vez de cair no `T01Serif`. Medido no T1: 334px contra 305px.
   * `ivyora-text` não tem esse problema porque é uma face que baixa de verdade:
   * se o download falhar, a família some da cascata e o próximo nome vale.
   */
  serif: {
    spec: TEMPLATE_02_SPEC.tokens.font.serif.family, // 'Newsreader'
    stack: "'ivyora-text', 'T01Serif', serif",
    motivo: 'Rafael tem a licença da IvyOra; o Typekit já serve `ivyora-text`.',
  },

  /**
   * Paradas do scrim da capa.
   *
   * spec (`layouts[0].background.camadas[1].stops`):
   *   0% rgba(0,0,0,.60) · 22% .25 · 62% .75 · 100% .96
   *
   * Pedido do Rafael, palavras dele: *"deixe menor, pelo menos até a metade do
   * card. Deixe um pouco mais forte da base e até o final mais transparente."*
   * Ou seja: metade de cima limpa, escurecendo só a partir do meio e chegando
   * mais forte na base do que os .96 de hoje.
   *
   * ⚠️ CUSTO MEDIDO: a parada de topo do spec existia para o CABEÇALHO — sem
   * ela o texto passa a sentar na foto crua. O contraste foi medido depois da
   * troca e está no relatório da fatia 5; a decisão de aceitar é do Rafael.
   */
  scrim: {
    spec: [
      { pos: 0, color: 'rgba(0,0,0,0.60)' },
      { pos: 0.22, color: 'rgba(0,0,0,0.25)' },
      { pos: 0.62, color: 'rgba(0,0,0,0.75)' },
      { pos: 1, color: 'rgba(0,0,0,0.96)' },
    ],
    stops: [
      { pos: 0, color: 'rgba(0,0,0,0)' },
      // Metade de cima inteiramente limpa — "pelo menos até a metade do card".
      { pos: 0.5, color: 'rgba(0,0,0,0)' },
      // Base mais forte que o spec (.96 → 1), e o escurecimento acelera no
      // último quarto para não subir cedo demais na foto.
      { pos: 0.78, color: 'rgba(0,0,0,0.45)' },
      { pos: 1, color: 'rgba(0,0,0,1)' },
    ],
    motivo: 'Pedido do Rafael em 05/08/2026 — degradê ocupando só a metade de baixo.',
  },

  /**
   * Fundo chapado da CAPA.
   *
   * spec (`tokens.color.ink`): `#000000`.
   *
   * Pedido do Rafael (02/09/2026), palavras dele: *"hoje o fundo da capa do
   * Radar está totalmente preto, a pessoa está vendo o fundo preto e não
   * consegue ver o degradê. Ao invés de ser o fundo preto, eu quero que seja o
   * fundo cinza."* A ordem das camadas que ele pediu — fundo cinza, degradê
   * padrão por cima, textos acima de tudo — é a que já existia; o que faltava
   * era o fundo deixar o degradê APARECER.
   *
   * MEDIDO, e é a razão de a queixa proceder: o scrim vai de transparente até
   * PRETO SÓLIDO na base. Sobre um fundo `#000000` ele existe e é invisível —
   * preto sobre preto. Com foto o problema não aparece, porque a imagem fica
   * entre o fundo e o scrim; sem foto, a capa é um retângulo preto liso.
   *
   * ⚠️ SEGUNDA ORDEM DELE (03/09/2026), que SUBSTITUI o `#2E2E2E`: *"a capa do
   * radar pode ter o fundo mais claro, use a cor #B5B5B5."* Cor escolhida por
   * ele, não derivada de token — a escolha é dele e está registrada aqui.
   *
   * POR QUE o `#2E2E2E` existiu, e o que a troca custa: o `#2E2E2E` era o cinza
   * MAIS CLARO que ainda mantinha o CABEÇALHO (`#767682`) em 3.03:1, o piso de
   * 3:1 de texto grande. O cabeçalho mora em `headerY` = 44, na metade de cima,
   * onde o scrim é 100% transparente — ele é desenhado direto sobre este fundo.
   *
   * ⚠️ CUSTO MEDIDO DO `#B5B5B5`, calculado em 03/09/2026 e comunicado ao
   * Rafael ANTES de a troca entrar:
   *   · CABEÇALHO `#767682` sobre o fundo: 3.03:1 → **2.19:1**. Passa a NÃO
   *     cumprir o piso de 3:1 de texto grande. A cor de cabeçalho mais clara
   *     que voltaria a passar, preservando a matiz do `#767682`, é `#606069`
   *     (3.03:1); `#4A4A52` daria 4.28:1, com folga. NÃO aplicadas — a decisão
   *     é do Rafael e ele não pediu.
   *   · HEADLINE BRANCA, achado NOVO que o pedido não previa: ela pendura pela
   *     base a partir de y=755 (55.9% da altura), onde o scrim ainda está em
   *     9.5% de opacidade. Composto sobre o fundo novo, o topo do bloco cai de
   *     14.35:1 para **2.49:1** — também abaixo de 3:1. Na base do bloco
   *     (y≈1089, scrim a 51.7%) ainda dá 7.23:1. Ou seja: a primeira linha da
   *     headline fica difícil de ler numa capa SEM foto. Com foto o problema
   *     não aparece, porque a imagem entra entre o fundo e o scrim.
   *   · contra o preto da base do scrim dá 10.24:1 — o degradê, que era a
   *     queixa original, agora se vê com sobra.
   *
   * O Rafael já demonstrou preferir o efeito visual ao contraste (o mesmo caso
   * do lime sobre o creme nos internos). A troca está feita por ordem dele, com
   * os números registrados aqui para ninguém "consertar" isso sem saber o que
   * está desfazendo.
   */
  coverBackground: {
    spec: TEMPLATE_02_SPEC.tokens.color.ink.value, // '#000000'
    value: '#B5B5B5',
    motivo:
      'Rafael, 03/09/2026 — fundo mais claro, cor escolhida por ele. ' +
      'Custo: cabeçalho 3.03:1 → 2.19:1 e topo da headline 14.35:1 → 2.49:1.',
  },

  /**
   * Limites de texto que substituem os de `regrasDeGeracao.limitesDeTexto`.
   *
   * 🔴 Não são chute: cada número saiu de MEDIÇÃO no Chromium, com a face, o
   * corpo e o tracking reais, na caixa que o render de fato desenha.
   *
   * `cover.headline` — spec: 17 car./linha, "medido em Inter Bold 76.55 / caixa
   * 836px". **A caixa está errada**: o render (e o próprio `generate.py`)
   * desenha a headline em `left:0; width:1080`, não numa caixa de 836. Medido a
   * 76.5495px / tracking -4.593 / Inter Bold:
   *   · "SEM GRITAR EM ANÚNCIOS QUE NINGUÉM LÊ NO FEED" → 25 car. em 1080 (19 em 836)
   *   · "POR QUE 9 EM CADA 10 STARTUPS ERRAM A IDENTIDADE" → 26 car. em 1080 (21 em 836)
   * O limite vira 25: o menor dos dois, para o contador avisar antes de quebrar.
   *
   * `content.title` / `content.body` — os totais do spec (40 e 220) estão
   * CERTOS para a contagem de linhas que ele assume: medidos na coluna de 409px
   * dão ~13 car./linha no título (×3 = 40) e ~25 no corpo (×9 = 225). O que
   * afrouxa aqui é o ORÇAMENTO VERTICAL, que sobrava:
   *   título 3 linhas (239.6) + vão 31.74 + corpo 9 linhas (376.1) = 647.4px
   *   num container de 1089px — 441.6px ociosos.
   * Com 4 linhas de título e 12 de corpo: 319.4 + 31.74 + 501.4 = 852.5px, ainda
   * 236px de folga. Daí 4×13 = 52 e 12×25 = 300.
   */
  limitesDeTexto: {
    'cover.headline': { maxCharPorLinha: 25, maxLinhas: 4 },
    'content.title': { maxChar: 52, maxLinhas: 4 },
    'content.body': { maxChar: 300, maxLinhas: 12 },
  } as Record<string, Template02Limits>,
} as const;

/** Paradas do scrim que o render usa: as do ajuste, com as do spec de lado. */
export function template02ScrimStops(): { pos: number; color: string }[] {
  return TEMPLATE_02_DESIGN_TWEAKS.scrim.stops.map((s) => ({ ...s }));
}

/**
 * Limites EFETIVOS de um slot: os do spec, com o ajuste por cima.
 *
 * Fonte única — a barra lateral, a auditoria de estouro e o addendum da IA leem
 * todos daqui. Um deles lendo o spec cru mostraria número diferente dos outros.
 */
/**
 * EXTENSÕES — o que existe no PRODUTO e NÃO existe no spec.
 *
 * Ao contrário de `TEMPLATE_02_DESIGN_TWEAKS`, aqui NÃO há valor de spec para
 * anotar ao lado, porque não há contraparte: o spec nunca desenhou isto. Um
 * desvio muda um número que o gabarito já tinha; uma extensão acrescenta algo
 * que ele não tem. Misturar os dois no mesmo objeto apagaria a distinção que
 * faz o mecanismo de desvios valer — por isso a estrutura é separada e o nome
 * diz o que ela é.
 *
 * 🔴 O `spec.json` continua sendo a RÉGUA e não é editado, igual na T8.
 *
 * ⚠️ REGRA DESTA ESTRUTURA: como o spec não conhece estes slots, ele não dá
 * limite, nem default, nem cor, nem tipografia a eles — medido: `template02Limits`
 * devolve `{}`, `template02SlotDefaults` devolve `undefined` e
 * `template02SlotColor` cairia no preto por falta de elemento. Então TUDO tem de
 * estar escrito aqui, explicitamente. Nada pode depender de fallback silencioso:
 * fallback silencioso é o que produziu metade dos bugs deste ciclo.
 */
export const TEMPLATE_02_EXTENSIONS = {
  /**
   * Marcador de destaque nos slides INTERNOS (modelos 2 e 3).
   *
   * O spec só tem `cover.highlight`, com `models: [1]` — a capa. O Rafael pediu
   * o mesmo destaque nos internos em 02/09/2026: *"o template ele já tem o
   * destaque, tanto que na sidebar do editor o usuário consegue mudar a cor,
   * então tem que ter esse destaque"*. O argumento dele sobre o seletor de cor
   * procede, e por isso o seletor existe aqui também.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * 🔴 A COR É LIME DE PROPÓSITO. NÃO "CONSERTE" ISTO SEM LER.
   *
   * O marcador da capa é lime (`accent`) sobre fundo PRETO: 18.51:1, e a tarja
   * salta. Nos internos o fundo é CREME (`paper`), e o mesmo lime dá 1.10:1
   * contra ele. Isso foi MEDIDO antes de escolher, e as três saídas foram
   * levadas ao Rafael com os números na mão:
   *
   *   · lime (accent #E1FF00) ....... tarja 1.10:1  ← ELE ESCOLHEU ESTA
   *   · ink invertido (#000000) ..... tarja 16.85:1
   *   · cinza (textMuted #727272) ... tarja  3.86:1
   *
   * Ele escolheu o lime priorizando a CONSISTÊNCIA VISUAL com a capa. Decisão
   * informada do dono do produto, não descuido de quem escreveu — se daqui a
   * seis meses alguém achar que é bug, é isto aqui que responde.
   *
   * O QUE ATENUA, e também foi medido: o 1.10:1 é a relação MARCADOR × FUNDO,
   * ou seja a percepção da TARJA. A LEITURA da palavra não sofre — o texto
   * sobre o marcador sai em 18.51:1, porque `template02HighlightTextColor`
   * escolhe a cor do texto sozinha. É mais contraste do que o próprio título
   * normal tem sobre o creme (16.85:1). E contraste WCAG mede LUMINÂNCIA: lime
   * e creme diferem muito em MATIZ, então a tarja não é "invisível" — é fraca
   * por luminância, some em escala de cinza e enfraquece em baixa visão.
   *
   * A saída, se ele não gostar ao ver no ar, já está na tela: o seletor de cor
   * do destaque, na barra lateral, vale para os internos também.
   * ─────────────────────────────────────────────────────────────────────────
   */
  contentHighlight: {
    slot: 'content.highlight',
    models: [2, 3],
    label: 'Destaque',
    /** Nasce VAZIO: o spec não tem `conteudoExemplo` para um slot que não existe. */
    default: '',
    /**
     * Sem limite de caracteres. Na capa o spec impõe "contido em 1 linha do
     * headline" porque lá as linhas são escritas à mão (`\n`). No
     * `content.title` a quebra é AUTOMÁTICA e o código não sabe onde ela cai —
     * a regra seria inverificável. Decisão do Rafael: marcar a frase e deixar
     * quebrar, virando dois retângulos, que é como marca-texto funciona.
     */
    limits: { regra: 'frase marcada pode quebrar entre linhas' },
    /** Espelha o `cover.highlight` do spec: fill accent, texto ink, padding 14. */
    fill: 'accent' as const,
    textColor: 'ink' as const,
    paddingX: 14,
    /** Tipografia do slot que ele marca — como na capa o marcador segue a headline. */
    style: 'slideTitle' as const,
    motivo: 'Rafael, 02/09/2026 — os internos passam a ter destaque, no lime da capa.',
  },
} as const;

export function template02Limits(slot: string): Template02Limits {
  // A extensão entra PRIMEIRO e explicitamente: o spec não tem entrada para ela,
  // e cair no `{}` faria o contador da barra lateral mentir em silêncio.
  const extensao =
    slot === TEMPLATE_02_EXTENSIONS.contentHighlight.slot
      ? TEMPLATE_02_EXTENSIONS.contentHighlight.limits
      : {};
  return {
    ...extensao,
    ...(TEMPLATE_02_SPEC.regrasDeGeracao.limitesDeTexto[slot] ?? {}),
    ...(TEMPLATE_02_DESIGN_TWEAKS.limitesDeTexto[slot] ?? {}),
  };
}

/**
 * DIVERGÊNCIAS CONHECIDAS CONTRA O GABARITO (`scripts/generate.py` da skill).
 *
 * Quem rodar o `generate.py` e comparar com o app VAI ver diferença. São estas
 * quatro, todas deliberadas e todas já decididas — a lista existe para ninguém
 * recomeçar a investigação. Antes da S5, a conferência de 05/08/2026 mediu
 * **0.00px** em toda a geometria do spec (bloco de imagem, coluna de texto,
 * container da headline, pílula de CTA e canvas). A S5 preserva essa geometria,
 * mas troca deliberadamente os pixels do scrim.
 *
 * O critério, então, é: 0px contra o gabarito EXCETO nos três itens abaixo.
 */
export const TEMPLATE_02_GABARITO_DIVERGENCES = [
  {
    o_que: 'família serifada dos títulos internos',
    gabarito: 'Newsreader (Google Fonts)',
    aqui: "'ivyora-text', 'T01Serif', serif",
    porque:
      'O spec trocou a IvyOra por Newsreader alegando licença comercial. O motivo caducou: ' +
      'o Rafael tem a licença, o Typekit já está no layout.tsx e ele pediu IvyOra. ' +
      'Ver TEMPLATE_02_DESIGN_TWEAKS.serif.',
  },
  {
    o_que: 'margem horizontal do cabeçalho',
    gabarito: '85px (o generate.py usa `grid.marginX`)',
    aqui: '71px (`grid.headerMarginX`)',
    porque:
      'O spec diz 71 em três lugares (grid.headerMarginX e os dois chrome.elementos[].x) e ' +
      'ainda lista o 71/63 do Figma em `inconsistenciasDetectadas` recomendando normalizar ' +
      'para 71/71. No Figma o cabeçalho é MAIS largo que o conteúdo; o generate.py colapsou ' +
      'as duas margens numa só. Onde o gabarito contradiz o spec E o spec explica o próprio ' +
      'número, vale o spec. Decidido pelo Orquestrador em 05/08/2026.',
  },
  {
    o_que: 'família de `body` e `ui` (corpo, CTA, cabeçalho, label da imagem)',
    gabarito: "'Inter'",
    aqui: "'T01InterDisplay' (o corte Display, como o spec manda)",
    porque:
      'O spec pede `Inter Display` (postScript InterDisplay-Regular/Medium). O generate.py ' +
      'colapsa os três papéis em Inter porque só carrega essa família do Google Fonts, que ' +
      'não serve o corte Display — o próprio spec anota isso em `riscosDeImplementacao`. ' +
      'É limitação do gabarito, não decisão de desenho. Efeito visível: o corpo quebra em ' +
      'MENOS linhas que no PNG de referência, ou seja, os limites de caractere do spec ' +
      'continuam valendo com folga e nunca estouram. Decidido pelo Orquestrador em 05/08/2026.',
  },
  {
    o_que: 'scrim da capa',
    gabarito: '0% .60 · 22% .25 · 62% .75 · 100% .96',
    aqui: '0% e 50% transparentes · 78% .45 · 100% 1',
    porque:
      'Rafael pediu o degradê apenas na metade de baixo e mais forte na base. ' +
      'O custo de contraste do cabeçalho sobre foto clara foi medido e está documentado ' +
      'em docs/template-02-integracao.md. Decidido por Rafael em 05/08/2026.',
  },
] as const;

/**
 * Família CSS de cada papel tipográfico.
 *
 * As sem-serifa são as faces já embutidas em `app/globals.css` (`T01Inter`,
 * `T01InterDisplay`), prefixadas para não colidirem com as do resto do app.
 * A serifada é o desvio acima.
 *
 * 🔸 `body` e `ui` seguem o SPEC (`Inter Display`, o corte optical-size). O
 * `generate.py` colapsa os três papéis em `'Inter'` porque carrega só a família
 * `Inter` do Google Fonts, que não serve o corte Display — limitação do
 * gabarito, não decisão de desenho. Aqui as duas faces existem localmente, então
 * o spec manda.
 */
const FONT_STACK: Record<Template02FontRole, string> = {
  display: "'T01Inter', sans-serif",
  body: "'T01InterDisplay', sans-serif",
  ui: "'T01InterDisplay', sans-serif",
  serif: TEMPLATE_02_DESIGN_TWEAKS.serif.stack,
};

export function template02FontStack(role: Template02FontRole): string {
  return FONT_STACK[role];
}

// ─── Tipografia ─────────────────────────────────────────────────

export interface Template02Type {
  fontFamily: string;
  /** Dízima de propósito (76.5495px) — fidelidade ao Figma. */
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  fontWeight: number;
  /** `true` quando o spec marca o bloco como caixa-alta. */
  upper: boolean;
}

/** Tipografia de um papel do spec, já com a família resolvida. */
export function template02Type(name: Template02TypeName): Template02Type {
  const t = TEMPLATE_02_SPEC.tokens.typeScale[name];
  return {
    fontFamily: template02FontStack(t.font),
    fontSize: t.exact,
    letterSpacing: t.letterSpacing,
    lineHeight: t.lineHeight,
    fontWeight: TEMPLATE_02_SPEC.tokens.font[t.font].weight,
    upper: t.case === 'UPPERCASE',
  };
}

// ─── Modelos ────────────────────────────────────────────────────
//
// O template tem 3 MODELOS de slide (capa, conteúdo-à-esquerda,
// conteúdo-à-direita) e, ao contrário do T1, NÃO tem número fixo de slides — o
// deck padrão é 5, mas o usuário adiciona quantos quiser alternando os modelos
// 2 e 3.
//
// 🔴 O modelo é DADO do slide (`Slide.templateModel`), nunca a posição. Deck
// reordenado, com modelo repetido ou com 12 slides continua desenhando certo.

export const TEMPLATE_02_MODELS: number[] = [1, 2, 3];

/** Modelo → layout do spec, na ordem de `layouts`. */
export const TEMPLATE_02_MODEL_LAYOUTS: Record<number, Template02LayoutId> = {
  1: 'cover',
  2: 'content-left',
  3: 'content-right',
};

/** O deck padrão do spec (`regrasDeGeracao.sequenciaPadrao`), em modelos. */
export const TEMPLATE_02_DEFAULT_MODELS: number[] =
  TEMPLATE_02_SPEC.regrasDeGeracao.sequenciaPadrao.map(
    (id) => Number(Object.keys(TEMPLATE_02_MODEL_LAYOUTS).find((m) => TEMPLATE_02_MODEL_LAYOUTS[Number(m)] === id))
  );

export function isTemplate02Model(value: unknown): value is number {
  return typeof value === 'number' && TEMPLATE_02_MODELS.includes(value);
}

/** Só o que interessa do slide para resolver o modelo. */
export interface Template02Modeled {
  templateModel?: number;
}

/**
 * O modelo do slide.
 *
 * 🔴 COMPATIBILIDADE: deck salvo (ou recém-gerado) sem `templateModel` deriva o
 * modelo da POSIÇÃO, seguindo a `sequenciaPadrao` do spec: posição 0 é a capa e
 * daí em diante alterna 2, 3, 2, 3… Nunca dois iguais seguidos.
 */
export function template02ModelOf(
  slide: Template02Modeled | null | undefined,
  position: number
): number {
  if (isTemplate02Model(slide?.templateModel)) return slide.templateModel;
  return template02ModelAt(position);
}

/**
 * O modelo que a POSIÇÃO pede, seguindo a `sequenciaPadrao` do spec: a capa
 * primeiro, e daí em diante alternando 2, 3, 2, 3…
 *
 * A geração usa isto para GRAVAR `templateModel` em cada slide. Deixar o modelo
 * sair da posição na hora de desenhar é o que quebra quando o usuário reordena
 * ou insere um slide no meio — por isso ele é gravado, não inferido.
 */
export function template02ModelAt(position: number): number {
  const p = Math.max(0, Math.trunc(position));
  if (p === 0) return 1;
  return p % 2 === 1 ? 2 : 3;
}

/**
 * O próximo modelo da alternância. Depois da capa vem o modelo 2; depois de um
 * slide de conteúdo vem o outro. É a regra `alternancia` do spec.
 */
export function template02NextModel(model: number): number {
  return model === 2 ? 3 : 2;
}

/** O layout do spec de um modelo. Cai na capa se pedirem um inexistente. */
export function template02LayoutOf(model: number): Template02Layout {
  const id = TEMPLATE_02_MODEL_LAYOUTS[model] ?? 'cover';
  return TEMPLATE_02_SPEC.layouts.find((l) => l.id === id) ?? TEMPLATE_02_SPEC.layouts[0];
}

/** `x` de um elemento do layout — os slides internos espelham por este número. */
export function template02ElementX(model: number, elementId: string): number {
  const el = template02LayoutOf(model).elementos.find((e) => e.id === elementId);
  return typeof el?.x === 'number' ? el.x : 0;
}

/**
 * Fundo chapado do modelo: CINZA na capa, creme nos internos.
 *
 * A capa era preta (`tokens.color.ink`) e o degradê sumia em cima dela. O cinza
 * é desvio deliberado, com a medição e o custo anotados em
 * `TEMPLATE_02_DESIGN_TWEAKS.coverBackground` — é de lá que o valor sai, nunca
 * escrito à mão aqui.
 */
export function template02Background(model: number): string {
  return model === 1
    ? TEMPLATE_02_DESIGN_TWEAKS.coverBackground.value
    : TEMPLATE_02_COLORS.paper;
}

// ─── Adaptação de formato ───────────────────────────────────────
//
// Os três formatos (4:5 · 1:1 · 9:16) compartilham a LARGURA 1080 — só a altura
// muda (ver `lib/formats.ts`). Nada horizontal se mexe.
//
// 🔴 No 4:5 toda conta daqui tem de ser NO-OP: se algo mudar 1px ali, a régua
// contra o gabarito já era. Por isso as distâncias são ABSOLUTAS (medidas do
// topo ou do rodapé), nunca proporcionais — margem que escala vira margem
// gigante no 9:16.

/** Distância ABSOLUTA da base do bloco de conteúdo ao rodapé: 1350 − 1236. */
const CONTENT_BOTTOM_GAP = TEMPLATE_02_HEIGHT - TEMPLATE_02_GRID.contentBottom;

/**
 * Caixa do conteúdo dos slides internos: mesmo `top` do spec e a mesma distância
 * do rodapé, em qualquer formato. O bloco de imagem e a coluna de texto usam a
 * MESMA caixa — o centro vertical do texto acompanha sozinho.
 */
export function template02ContentBox(height: number): { top: number; height: number } {
  return {
    top: TEMPLATE_02_GRID.contentTop,
    height: height - TEMPLATE_02_GRID.contentTop - CONTENT_BOTTOM_GAP,
  };
}

/** Distância ABSOLUTA da headline da capa ao rodapé: 1350 − 755. */
const COVER_HEADLINE_BOTTOM = TEMPLATE_02_HEIGHT - 755;
/** Distância ABSOLUTA da pílula de CTA ao rodapé: 1350 − 1127. */
const COVER_PILL_BOTTOM = TEMPLATE_02_HEIGHT - 1127;

/**
 * Distância da BASE da headline ao rodapé.
 *
 * O bloco pendura pela base e cresce para cima, não para baixo: crescer para
 * baixo o joga contra a pílula de CTA (ver o comentário do `CoverHeadline`). O
 * número é derivado do desenho — com as `linhas` que o spec desenha, a base fica
 * em `755 + linhas × entrelinha`, então o topo de uma headline do tamanho do
 * gabarito continua caindo exatamente em 755 e a fidelidade não se mexe.
 */
const COVER_HEADLINE_BASE = (() => {
  const el = TEMPLATE_02_SPEC.layouts[0].elementos.find((e) => e.id === 'cover.headline');
  const linhas = (el as { linhas?: number } | undefined)?.linhas ?? 4;
  return TEMPLATE_02_HEIGHT - (755 + linhas * TEMPLATE_02_SPEC.tokens.typeScale.coverHeadline.lineHeight);
})();

/**
 * Âncoras da composição da capa. Todas ao RODAPÉ: a imagem e o scrim são
 * full-bleed e acompanham a altura, mas o texto encosta embaixo.
 *
 * `headline` continua exposto (é o `top` que a headline do gabarito ocupa) para
 * o teste de formato poder afirmar a distância absoluta; quem desenha usa o
 * `headlineBottom`.
 */
export function template02CoverTops(
  height: number
): { headline: number; headlineBottom: number; pill: number } {
  return {
    headline: height - COVER_HEADLINE_BOTTOM,
    headlineBottom: COVER_HEADLINE_BASE,
    pill: height - COVER_PILL_BOTTOM,
  };
}

/** `y` do cabeçalho — absoluto em todo formato. */
export const TEMPLATE_02_HEADER_Y = TEMPLATE_02_GRID.headerY;

/**
 * Margem horizontal do cabeçalho.
 *
 * 🔸 Vem do spec (`grid.headerMarginX` = 71, e `chrome.elementos[].x` = 71). O
 * Figma original tinha 71 à esquerda e 63 à direita — o spec lista isso em
 * `inconsistenciasDetectadas` e recomenda normalizar para 71/71, que é o que
 * fazemos.
 *
 * O `generate.py` usa `grid.marginX` (85) nos dois lados. É divergência do
 * gabarito em relação ao próprio spec; aqui manda o spec, que é a fonte da
 * verdade da forma e diz 71 em três lugares.
 */
export const TEMPLATE_02_HEADER_MARGIN_X = TEMPLATE_02_GRID.headerMarginX;

// ─── Slots ──────────────────────────────────────────────────────
//
// As chaves são as do spec e NÃO mudam: é o que fica gravado no `templateSlots`
// de todo carrossel salvo. Rótulo é só interface.

/** Texto ou URL de imagem por slot, ex: `{ 'content.title': 'Marca não é logo' }`. */
export type Template02Slots = Record<string, string>;

/** Texto inicial do cabeçalho de cada slide novo. */
export const TEMPLATE_02_DEFAULT_HEADER: Template02Slots = {
  'header.category': 'LOREM IPSUM',
  'header.handle': '@LOREMIPSUM',
};

export interface Template02SlotDescriptor {
  slot: string;
  kind: 'text' | 'image';
  /** Rótulo da barra lateral. É só interface — a CHAVE do slot nunca muda. */
  label: string;
  /**
   * `header` = cabeçalho do slide, com painel próprio.
   * `slide` = demais slots do slide.
   */
  scope: 'slide' | 'header';
  /** Ordem VISUAL do campo no slide — a barra lateral segue esta ordem. */
  order: number;
  /** Quebras manuais (`\n`) fazem parte do conteúdo. */
  multiline: boolean;
  /** O spec marca o bloco como caixa-alta. */
  upper: boolean;
  maxLines?: number;
  maxCharsPerLine?: number;
  maxChars?: number;
  /** Texto de exemplo do spec; usado quando o slot não foi preenchido. */
  defaultValue: string;
}

interface SlotDef {
  slot: string;
  models: number[];
  kind: 'text' | 'image';
  label: string;
  scope: 'slide' | 'header';
  order: number;
  multiline: boolean;
  /** Papel tipográfico, para derivar a caixa-alta do spec. */
  style?: Template02TypeName;
}

/**
 * Os slots do template, na ordem visual do slide.
 *
 * Todos os slots vivem no slide. `header.*` só recebe um escopo separado para
 * aparecer em seu próprio painel.
 */
const SLOT_DEFS: SlotDef[] = [
  { slot: 'header.category', models: [1, 2, 3], kind: 'text',  label: 'Categoria',       scope: 'header', order: 0, multiline: false, style: 'headerMeta' },
  { slot: 'header.handle',   models: [1, 2, 3], kind: 'text',  label: '@ do perfil',     scope: 'header', order: 1, multiline: false, style: 'headerMeta' },
  { slot: 'cover.image',     models: [1],       kind: 'image', label: 'Imagem de fundo', scope: 'slide', order: 2, multiline: false },
  { slot: 'cover.headline',  models: [1],       kind: 'text',  label: 'Título',          scope: 'slide', order: 3, multiline: true,  style: 'coverHeadline' },
  { slot: 'cover.highlight', models: [1],       kind: 'text',  label: 'Destaque',        scope: 'slide', order: 4, multiline: false, style: 'coverHeadline' },
  { slot: 'cover.cta',       models: [1],       kind: 'text',  label: 'Chamada',         scope: 'slide', order: 5, multiline: false, style: 'ctaLabel' },
  { slot: 'content.image',   models: [2, 3],    kind: 'image', label: 'Imagem',          scope: 'slide', order: 2, multiline: false },
  { slot: 'content.title',   models: [2, 3],    kind: 'text',  label: 'Título',          scope: 'slide', order: 3, multiline: false, style: 'slideTitle' },
  // EXTENSÃO, não spec: ver TEMPLATE_02_EXTENSIONS.contentHighlight. Fica logo
  // depois do título que ele marca, como o `cover.highlight` fica depois da headline.
  { slot: 'content.highlight', models: [2, 3],  kind: 'text',  label: 'Destaque',        scope: 'slide', order: 3.5, multiline: false, style: 'slideTitle' },
  { slot: 'content.body',    models: [2, 3],    kind: 'text',  label: 'Descrição',       scope: 'slide', order: 4, multiline: true,  style: 'slideBody' },
];

/** Todos os slots do template, sem repetição. */
export const TEMPLATE_02_SLOTS: string[] = SLOT_DEFS.map((d) => d.slot);

export function template02SlotLabel(slot: string, fallback = ''): string {
  return SLOT_DEFS.find((d) => d.slot === slot)?.label ?? fallback ?? slot;
}

/**
 * Limites de texto de um slot — lidos de `regrasDeGeracao.limitesDeTexto`.
 *
 * O spec fala duas línguas: `maxCharPorLinha` na headline (que tem quebra
 * manual) e `maxChar` (total) nos demais. As duas viram campos distintos aqui em
 * vez de virarem uma média — são regras diferentes.
 */
function limitsOf(slot: string): Pick<
  Template02SlotDescriptor,
  'maxLines' | 'maxCharsPerLine' | 'maxChars'
> {
  const l = template02Limits(slot);
  return {
    maxLines: l.maxLinhas,
    maxCharsPerLine: l.maxCharPorLinha,
    maxChars: l.maxChar,
  };
}

/**
 * Conteúdo de fábrica de um slot, no modelo pedido.
 *
 * Os textos-base do cabeçalho vêm do catálogo `camposEditaveis.global` do spec;
 * cada slide recebe a própria cópia editável. Os demais vêm do
 * `conteudoExemplo` do elemento no layout — e por isso `content.title` do modelo
 * 2 é diferente do modelo 3, exatamente como no spec.
 */
/**
 * Slot → id do elemento no spec, quando os dois nomes divergem.
 *
 * A pílula do CTA é dois elementos no spec (`cover.ctaPill`, o retângulo, e
 * `cover.ctaText`, o texto). Para quem edita é um campo só — a `Chamada` — e o
 * nome do slot é o do SKILL.md (`cta`).
 */
const SPEC_ELEMENT_ID: Record<string, string> = {
  'cover.cta': 'cover.ctaText',
};

function defaultValueOf(slot: string, model: number): string {
  if (slot in TEMPLATE_02_DEFAULT_HEADER) return TEMPLATE_02_DEFAULT_HEADER[slot];
  const global = TEMPLATE_02_SPEC.camposEditaveis.global[slot];
  if (global) return global.default;
  // O spec não dá `conteudoExemplo` para o marcador. Ele sai da primeira linha
  // do headline de fábrica: `inconsistenciasDetectadas` conta que no Figma o
  // lime cobria a linha 1 e só "NOVA TIPOGRAFIA" ficou com o texto em preto.
  if (slot === 'cover.highlight') return 'NOVA TIPOGRAFIA';
  // Extensão: o spec não conhece o slot, então o default vem de lá, explícito.
  if (slot === TEMPLATE_02_EXTENSIONS.contentHighlight.slot) {
    return TEMPLATE_02_EXTENSIONS.contentHighlight.default;
  }
  const id = SPEC_ELEMENT_ID[slot] ?? slot;
  const el = template02LayoutOf(model).elementos.find((e) => e.id === id);
  return el?.conteudoExemplo ?? '';
}

/** Descritores dos slots de um modelo (inclui os globais do cabeçalho). */
export function template02SlotsForModel(model: number): Template02SlotDescriptor[] {
  return SLOT_DEFS.filter((d) => d.models.includes(model))
    .map((d) => ({
      slot: d.slot,
      kind: d.kind,
      label: d.label,
      scope: d.scope,
      order: d.order,
      multiline: d.multiline,
      upper: d.style ? template02Type(d.style).upper : false,
      ...limitsOf(d.slot),
      defaultValue: d.kind === 'image' ? '' : defaultValueOf(d.slot, model),
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Slots de TEXTO do slide, sem o cabeçalho.
 *
 * O cabeçalho tem painel próprio no slide selecionado — por isso ele sai daqui.
 */
export function template02TextSlotsForModel(model: number): Template02SlotDescriptor[] {
  return template02SlotsForModel(model).filter((d) => d.kind === 'text' && d.scope === 'slide');
}

/**
 * Os pares TÍTULO → DESTAQUE do Template 2.
 *
 * O destaque existe na CAPA (`cover.highlight`, do spec) e nos INTERNOS
 * (`content.highlight`, extensão — ver TEMPLATE_02_EXTENSIONS). São slots
 * diferentes marcando títulos diferentes, com a MESMA interface: as palavras do
 * título viram pastilhas clicáveis.
 *
 * 🔴 Mora aqui, e não dentro de um componente, porque DOIS lados da barra
 * lateral dependem dele desde 03/09/2026 e precisam concordar: o painel de
 * "Conteúdo do slide" usa a lista para ESCONDER o slot de destaque, e o de
 * "Estilo do texto" usa para saber de qual título tirar as palavras. Se as duas
 * pontas tivessem cada uma a sua cópia, o dia em que um terceiro modelo ganhar
 * destaque produziria um slot que some de um painel sem aparecer no outro.
 */
export const TEMPLATE_02_HIGHLIGHT_PAIRS: readonly { titulo: string; destaque: string }[] = [
  { titulo: 'cover.headline', destaque: 'cover.highlight' },
  { titulo: 'content.title', destaque: 'content.highlight' },
] as const;

/** O par de destaque presente numa lista de slots, ou `undefined` se não há. */
export function template02HighlightPair(
  slots: Template02SlotDescriptor[]
): { titulo: string; destaque: string } | undefined {
  return TEMPLATE_02_HIGHLIGHT_PAIRS.find((p) => slots.some((d) => d.slot === p.destaque));
}

/** `true` se o slot é um marcador de destaque (capa ou interno). */
export function template02IsHighlightSlot(slot: string): boolean {
  return TEMPLATE_02_HIGHLIGHT_PAIRS.some((p) => p.destaque === slot);
}

/** Os slots do cabeçalho, na ordem em que aparecem no slide. */
export function template02HeaderSlotsForModel(model: number): Template02SlotDescriptor[] {
  return template02SlotsForModel(model).filter((d) => d.scope === 'header');
}

/** Papel tipográfico de um slot, ou `undefined` nos slots de imagem. */
export function template02SlotType(slot: string): Template02TypeName | undefined {
  return SLOT_DEFS.find((d) => d.slot === slot)?.style;
}

/**
 * Tipografia de FÁBRICA de um slot — o que a barra lateral mostra quando o
 * usuário ainda não mexeu em nada.
 *
 * O `letterSpacing` sai em `em` porque é assim que `templateSlotStyles` grava (o
 * mesmo formato do Template 1). O spec guarda em px; a razão entre os dois é
 * exatamente o `letterSpacingRatio` do `typeRules`.
 */
export function template02SlotDefaults(
  slot: string
): { fontSizePx: number; letterSpacingEm: number } | undefined {
  const name = template02SlotType(slot);
  if (!name) return undefined;
  const t = template02Type(name);
  return { fontSizePx: t.fontSize, letterSpacingEm: t.letterSpacing / t.fontSize };
}

/** Nome legível da face efetivamente usada no render daquele slot. */
export function template02SlotFontName(slot: string): string | undefined {
  const name = template02SlotType(slot);
  if (!name) return undefined;
  const role = TEMPLATE_02_SPEC.tokens.typeScale[name].font;

  // O app usa a IvyOra licenciada no lugar da Newsreader anotada no spec.
  if (role === 'serif') return 'IvyOra Text Medium';

  const token = TEMPLATE_02_SPEC.tokens.font[role];
  const variant = token.postScript.split('-').at(-1);
  return [token.family, variant].filter(Boolean).join(' ');
}

/**
 * Cor de FÁBRICA de um slot, lida do spec.
 *
 * Existe para o seletor de cor abrir mostrando o que está NA TELA, nunca um
 * padrão do editor. O cabeçalho da capa é o caso torto: a cor dele é
 * condicional à imagem de fundo (`regraCabecalho`), e o que devolvemos aqui é a
 * cor-base — é ela que o controle substitui quando o usuário escolhe outra.
 */
export function template02SlotColor(slot: string, model: number): string {
  if (slot === 'cover.highlight') return TEMPLATE_02_COLORS.ink;
  // Extensão: sem elemento no spec, cairia no preto por acidente. Aqui é escolha.
  if (slot === TEMPLATE_02_EXTENSIONS.contentHighlight.slot) {
    return TEMPLATE_02_COLORS[TEMPLATE_02_EXTENSIONS.contentHighlight.textColor];
  }
  const id = SPEC_ELEMENT_ID[slot] ?? slot;
  const el =
    template02LayoutOf(model).elementos.find((e) => e.id === id) ??
    TEMPLATE_02_SPEC.chrome.elementos.find((e) => e.id === id);
  return TEMPLATE_02_COLORS[el?.color ?? ''] ?? TEMPLATE_02_COLORS.ink;
}

/** Slot de imagem do modelo: o fundo da capa, ou o bloco 380×1089 dos internos. */
export function template02ImageSlot(model: number): string {
  return model === 1 ? 'cover.image' : 'content.image';
}

/** Conteúdo original do spec — estado inicial de um slide daquele modelo. */
export function template02DefaultSlots(model: number): Template02Slots {
  const out: Template02Slots = {};
  for (const d of template02SlotsForModel(model)) {
    if (d.kind === 'text') out[d.slot] = d.defaultValue;
  }
  return out;
}

// ─── Conteúdo gerado ────────────────────────────────────────────

/**
 * Par primário de cada modelo — por onde o conteúdo genérico do wizard
 * (título + descrição por slide) entra no template.
 *
 * A capa não tem corpo: ela é headline + marcador + chamada. O `description` que
 * o wizard traz para a posição 0 não tem onde caber, e é descartado de
 * propósito — inventar um bloco para ele mudaria o desenho do template.
 */
export const TEMPLATE_02_PRIMARY_SLOTS: Record<number, { title: string; body?: string }> = {
  1: { title: 'cover.headline' },
  2: { title: 'content.title', body: 'content.body' },
  3: { title: 'content.title', body: 'content.body' },
};

/**
 * Slots de texto que NÃO são o par primário — o marcador e a chamada da capa.
 *
 * Eles existem no desenho e a IA precisa escrevê-los: o texto de fábrica do spec
 * ("CHAMADA PARA AÇÃO", o headline do FC Barcelona) é ilustrativo e não pode
 * sobrar num carrossel gerado. A chave é o nome curto do contrato da IA; o
 * valor, o slot do spec.
 */
export const TEMPLATE_02_EXTRA_SLOTS: Record<number, Record<string, string>> = {
  1: { highlight: 'cover.highlight', cta: 'cover.cta' },
};

export interface Template02ContentInput {
  title: string;
  description: string;
  imageUrl?: string;
  /** Slots secundários, pelo nome curto do contrato da IA (`highlight`, `cta`). */
  extras?: Record<string, string>;
}

/**
 * Monta os slots de um slide gerado.
 *
 * REGRA DURA, herdada do Template 1: um deck gerado não pode exibir NENHUM texto
 * ilustrativo do spec. Por isso todo slot de texto do slide sai preenchido — com
 * o que a IA escreveu ou, na falta, com string VAZIA. Vazio é pior visualmente
 * que o headline do FC Barcelona? Não: o texto do spec é uma mentira sobre o
 * conteúdo do usuário, e o vazio ele conserta num campo da barra lateral.
 *
 * O caminho "sem slots" (`templateSlots` ausente) continua caindo no texto do
 * spec — é dele que sai a fidelidade de 0px, e nada aqui o toca.
 */
export function template02SlotsFromContent(
  model: number,
  input: Template02ContentInput
): Template02Slots {
  const primary = TEMPLATE_02_PRIMARY_SLOTS[model];
  if (!primary) return {};

  const slots: Template02Slots = {};
  for (const d of template02TextSlotsForModel(model)) slots[d.slot] = '';

  if (input.title.trim()) slots[primary.title] = input.title.trim();
  if (primary.body && input.description.trim()) slots[primary.body] = input.description.trim();

  for (const [key, slot] of Object.entries(TEMPLATE_02_EXTRA_SLOTS[model] ?? {})) {
    const value = input.extras?.[key];
    if (typeof value === 'string' && value.trim()) slots[slot] = value.trim();
  }

  if (input.imageUrl) slots[template02ImageSlot(model)] = input.imageUrl;
  return slots;
}

/**
 * Helper legado para converter marca e @ em slots. Novos slides usam
 * `TEMPLATE_02_DEFAULT_HEADER` e não herdam estes valores entre cards.
 */
export function template02HeaderSlots(brandName?: string, handle?: string): Template02Slots {
  const at = (handle ?? '').trim().replace(/^@+/, '');
  return {
    'header.category': (brandName ?? '').trim().toUpperCase(),
    'header.handle': at ? `@${at.toUpperCase()}` : '',
  };
}

// ─── Marcador da capa ───────────────────────────────────────────

/**
 * Cor de fábrica do marcador. O usuário pode trocar por qualquer outra —
 * `templateSlotStyles['cover.highlight'].background`.
 */
export const TEMPLATE_02_HIGHLIGHT_COLOR = TEMPLATE_02_COLORS.accent;

/**
 * Os termos escritos no campo Destaque, separados por VÍRGULA.
 *
 * Pedido do Rafael: *"eu quero que o usuário consiga colocar o destaque da
 * palavra… talvez escrevendo naquele campo, separando por vírgula"*. Vazios são
 * descartados, então "A, ,B" vira ["A","B"] e o campo tolera vírgula sobrando.
 */
export function template02HighlightTerms(highlight?: string): string[] {
  return (highlight ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * O termo casa em `line` a partir de `from` como PALAVRA INTEIRA — ou -1.
 *
 * 🔴 O BUG QUE ISTO CONSERTA (Rafael, 03/09/2026, palavras dele): *"eu
 * selecionei a palavra 'O' e ele selecionou também o 'O' da palavra 'GANCHOS'.
 * Isso não pode acontecer. Se eu selecionei aquilo, é só aquilo."* Em "10
 * GANCHOS PARA A PRIMEIRA LINHA QUE FAZ PARAR O FEED", o termo "O" era
 * procurado com `indexOf` puro e casava dentro de GANCHOS — o render pintava
 * "GANCH[O]S". Termo curto casava dentro de qualquer palavra que o contivesse.
 *
 * A regra: o caractere imediatamente ANTES e o imediatamente DEPOIS do termo
 * não podem ser letra, dígito nem marca de acento. Início e fim de linha
 * contam como fronteira.
 *
 * ⚠️ POR QUE NÃO `\b`: o `\b` do JavaScript é ASCII. Numa palavra acentuada
 * ele enxerga fronteira NO MEIO — em "AÇÃO" o `\b` marca antes e depois do "Ç"
 * e do "Ã", então `/\bA\b/` casaria com o "A" inicial de "AÇÃO" e o bug
 * voltaria disfarçado, só nas palavras com acento. Este produto é em português:
 * a checagem é manual, com classe unicode (`\p{L}\p{N}\p{M}` + flag `u`).
 *
 * `\p{M}` entra junto com letra e dígito porque texto pode chegar decomposto
 * (NFD), onde o acento é um caractere separado: sem ele, o termo "A" casaria
 * com o "A" de um "Á" decomposto, que é a mesma classe de erro do "GANCHOS".
 *
 * A fronteira é do TERMO INTEIRO, não de cada palavra dele — por isso um termo
 * de várias palavras ("PARAR O FEED") continua casando: o que se olha é o
 * vizinho da esquerda do "P" e o da direita do último "D".
 *
 * Pontuação encostada não quebra: em "FEED." o "." não é letra nem dígito nem
 * marca, então "FEED" casa — que é o que o usuário espera ao marcar a palavra.
 */
const CARACTERE_DE_PALAVRA = /[\p{L}\p{N}\p{M}]/u;

export function template02IndexOfWholeWord(line: string, term: string, from = 0): number {
  if (!term) return -1;
  for (let at = line.indexOf(term, from); at >= 0; at = line.indexOf(term, at + 1)) {
    const antes = at > 0 ? line[at - 1] : '';
    const depois = line[at + term.length] ?? '';
    if (!CARACTERE_DE_PALAVRA.test(antes) && !CARACTERE_DE_PALAVRA.test(depois)) return at;
  }
  return -1;
}

/**
 * Índice da linha do headline que contém o marcador, ou -1.
 *
 * A regra do spec é "o marcador nunca cruza duas linhas": como o destaque é
 * procurado DENTRO de cada linha, ele é estruturalmente impossível de cruzar —
 * ou cabe numa linha, ou não aparece. Com vários termos, a regra vale POR TERMO.
 */
export function template02HighlightLine(headline: string, highlight?: string): number {
  const termos = template02HighlightTerms(highlight);
  if (!termos.length) return -1;
  const linhas = headline.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    // `includes` puro traria de volta o bug do "O" dentro de "GANCHOS":
    // esta função diria que a linha tem o marcador, e o render não pintaria
    // nada nela. As duas pontas têm de usar a MESMA noção de casar.
    if (termos.some((t) => template02IndexOfWholeWord(linhas[i], t) >= 0)) return i;
  }
  return -1;
}

/**
 * Termos que NÃO estão em nenhuma linha do headline.
 *
 * Sem esta lista o marcador simplesmente não desenha e o usuário não descobre
 * por quê — e com vários termos "algo falhou" não basta: ele precisa saber QUAL.
 */
export function template02MissingHighlightTerms(headline: string, highlight?: string): string[] {
  const linhas = headline.split('\n');
  // Mesma regra do render: um termo que só existe DENTRO de outra palavra
  // está faltando, e o aviso tem de dizer isso — senão ele soma a um
  // marcador que não aparece, que é o pior estado possível para o usuário.
  return template02HighlightTerms(highlight).filter(
    (t) => !linhas.some((l) => template02IndexOfWholeWord(l, t) >= 0),
  );
}

export interface Template02HighlightPart {
  text: string;
  /** `true` = trecho que recebe o marcador. */
  marked: boolean;
}

/**
 * Quebra UMA linha do headline nos pedaços marcados e não marcados.
 *
 * Cada termo marca a PRIMEIRA ocorrência dele na linha, não todas: marcar todas
 * transformaria um termo curto ("A") em tarja em cima de meia frase. Vários
 * termos na mesma linha funcionam — a varredura pega sempre a ocorrência mais à
 * esquerda entre os termos que ainda não foram usados.
 *
 * "Ocorrência" quer dizer PALAVRA INTEIRA desde 03/09/2026 — ver
 * `template02IndexOfWholeWord`, que é onde a fronteira mora. O resto desta
 * função não mudou: a escolha da mais à esquerda, o desempate pelo termo mais
 * longo e o "cada termo é usado uma vez só" continuam exatamente como estavam.
 */
export function template02HighlightParts(line: string, terms: string[]): Template02HighlightPart[] {
  const restantes = terms.filter(Boolean);
  const usados = new Set<number>();
  const parts: Template02HighlightPart[] = [];
  let cursor = 0;

  for (;;) {
    let melhor = -1;
    let indice = -1;
    restantes.forEach((t, i) => {
      if (usados.has(i)) return;
      const at = template02IndexOfWholeWord(line, t, cursor);
      if (at < 0) return;
      // Empate na mesma posição: vence o termo mais longo, que é o que o
      // usuário quis marcar ("MARCA" antes de "MAR").
      if (melhor < 0 || at < melhor || (at === melhor && t.length > restantes[indice].length)) {
        melhor = at;
        indice = i;
      }
    });
    if (melhor < 0) break;
    usados.add(indice);
    const termo = restantes[indice];
    if (melhor > cursor) parts.push({ text: line.slice(cursor, melhor), marked: false });
    parts.push({ text: termo, marked: true });
    cursor = melhor + termo.length;
  }

  if (cursor < line.length) parts.push({ text: line.slice(cursor), marked: false });
  return parts;
}

/** Luminância relativa (WCAG) de uma cor `#rgb`/`#rrggbb`. */
function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores hex. */
export function template02Contrast(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Cor do texto SOBRE o marcador.
 *
 * No template ele é preto, porque o marcador é o lime. Com o usuário livre para
 * escolher a cor, preto sobre um fundo escuro sai ilegível — então a cor segue a
 * luminância do marcador: fica no preto do template enquanto ele contrastar
 * mais, e vira branco quando não contrastar. Escolha explícita do usuário
 * (`slotStyles['cover.highlight'].color`) continua vencendo isto.
 */
export function template02HighlightTextColor(background: string): string {
  const { ink, surface } = TEMPLATE_02_COLORS;
  return template02Contrast(background, ink) >= template02Contrast(background, surface)
    ? ink
    : surface;
}

// ─── Medição contra os limites ──────────────────────────────────

export interface Template02SlotMeasure {
  lines: number;
  longestLine: number;
  chars: number;
  over: boolean;
}

/**
 * Mede um slot contra os limites do spec.
 *
 * `maxCharsPerLine` só existe onde a quebra é MANUAL (a headline da capa): ali o
 * limite é por linha escrita. Nos demais o que vale é o total de caracteres —
 * a quebra é do navegador e contar `\n` não diria nada.
 *
 * `maxLines` do corpo é o teto de linhas RENDERIZADAS, que só o navegador sabe;
 * aqui ele serve para pegar o caso grosseiro (parágrafos demais). O limite que
 * de fato prende o corpo é o de caracteres.
 */
export function template02Measure(
  value: string,
  limits: { maxLines?: number; maxCharsPerLine?: number; maxChars?: number }
): Template02SlotMeasure {
  const lines = value.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const overLines = limits.maxLines != null && lines.length > limits.maxLines;
  const overPerLine = limits.maxCharsPerLine != null && longest > limits.maxCharsPerLine;
  const overChars = limits.maxChars != null && value.length > limits.maxChars;
  return {
    lines: lines.length,
    longestLine: longest,
    chars: value.length,
    over: overLines || overPerLine || overChars,
  };
}

export interface Template02Overflow extends Template02SlotMeasure {
  slot: string;
  maxLines?: number;
  maxCharsPerLine?: number;
  maxChars?: number;
}

/** Confere os limites de todos os slots de texto de um slide. */
export function template02Overflows(model: number, slots: Template02Slots): Template02Overflow[] {
  const out: Template02Overflow[] = [];
  for (const d of template02SlotsForModel(model)) {
    if (d.kind !== 'text') continue;
    const value = slots[d.slot];
    // O conteúdo de fábrica não é auditado: os limites são estéticos e o texto
    // que veio do Figma passa de alguns sem estourar a caixa. Acusar o que já
    // está no template só ensinaria a ignorar o aviso.
    if (value == null || value === d.defaultValue) continue;
    const m = template02Measure(value, d);
    if (m.over) {
      out.push({
        slot: d.slot,
        maxLines: d.maxLines,
        maxCharsPerLine: d.maxCharsPerLine,
        maxChars: d.maxChars,
        ...m,
      });
    }
  }
  return out;
}

// ─── Contrato da geração por IA ─────────────────────────────────

/**
 * TEMPLATE 2 — a CAPA não tem o par título/descrição dos outros slides: ela é
 * uma headline de quebra manual, um marcador e uma chamada. Sem estes campos ela
 * sairia com a copy ilustrativa do spec (o headline do FC Barcelona, o "CHAMADA
 * PARA AÇÃO") em todo carrossel gerado.
 *
 * Usa o mesmo mecanismo `extras` que o Template 1 já criou — não há campo novo
 * no `CarouselAIResponse`.
 *
 * 🔴 Os limites são LIDOS de `regrasDeGeracao.limitesDeTexto` do spec, nunca
 * redigitados: eles foram medidos contra a caixa do desenho, e uma cópia à mão
 * envelheceria em silêncio na primeira vez que o spec mudasse.
 */
export function template02Addendum(): string {
  // Limites EFETIVOS, com os ajustes medidos por cima do spec — senão o prompt
  // pediria à IA um texto mais curto do que a barra lateral aceita.
  const L = (slot: string) => template02Limits(slot);
  const headline = L('cover.headline');
  const titulo = L('content.title');
  const corpo = L('content.body');

  return `

TEMPLATE 2 — a CAPA é diferente dos demais slides.

O slide 1 é a capa e NÃO tem descrição. Nele:
- "title" é a headline, em CAIXA ALTA, com as quebras de linha escritas por você
  usando \\n. Máximo ${headline.maxLinhas} linhas e ${headline.maxCharPorLinha} caracteres POR LINHA — acima
  disso passa do limite conservador medido na caixa real de 1080px da capa.
  Quebre por SENTIDO, e nunca deixe uma linha com uma palavra só.
- "description" do slide 1 é ignorada. Não gaste texto nela.
- "extras": { "highlight": "...", "cta": "..." }
  · highlight é o trecho que recebe o marcador amarelo. Ele TEM de estar contido
    em UMA ÚNICA linha da headline, escrito exatamente igual — se não estiver, o
    marcador simplesmente não aparece e o usuário não descobre por quê. Escolha a
    palavra que carrega a tensão da frase, nunca um conectivo.
  · cta é a chamada da pílula, em CAIXA ALTA, até ${L('cover.cta').maxChar} caracteres.

Nos demais slides (2 em diante), "title" e "description" são usados normalmente:
- title: até ${titulo.maxChar} caracteres, no máximo ${titulo.maxLinhas} linhas.
- description: até ${corpo.maxChar} caracteres, ${corpo.paragrafos ?? '1 a 2 parágrafos, separados por \\n\\n'}.
Cada slide entrega UMA ideia: o título é a afirmação, a descrição é a
justificativa. Se o título precisa da descrição para fazer sentido, ele está
fraco. O último slide fecha com consequência ou virada, nunca com "e é isso".

Nunca devolva texto de exemplo, nome de marca ou assunto que não sejam os do
tema pedido.`;
}

// ─── Lorem ipsum dentro dos limites ─────────────────────────────

/**
 * Palavras do lorem clássico. Fonte única para todo texto de exemplo: nenhum
 * slide novo pode nascer com a copy do spec ("FC Barcelona", "@OANDRELONA",
 * "BRANDING & DESIGN DE MARCA") — isso é conteúdo ilustrativo de outra marca.
 */
const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
];

/**
 * Texto de exemplo com no MÁXIMO `budget` caracteres, cortado em palavra
 * inteira. Determinístico: a mesma entrada dá sempre a mesma saída, senão os
 * testes de limite virariam loteria.
 */
function loremUpTo(budget: number, offset = 0): string {
  if (budget <= 0) return '';
  let out = '';
  for (let i = 0; out.length < budget; i++) {
    const word = LOREM_WORDS[(i + offset) % LOREM_WORDS.length];
    const next = out ? `${out} ${word}` : word;
    if (next.length > budget) break;
    out = next;
  }
  if (!out) out = LOREM_WORDS[offset % LOREM_WORDS.length].slice(0, budget);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Fração do orçamento que o lorem ocupa.
 *
 * O limite pressupõe empacotamento perfeito, e a quebra real do navegador
 * desperdiça o fim de cada linha. Encher o orçamento faria o texto transbordar
 * para uma linha a mais no render mesmo com o contador no verde — exatamente o
 * estouro que o slide novo não pode ter.
 */
const LOREM_FILL = 0.7;

/** Texto de exemplo de UM slot, dentro dos limites dele. */
export function template02LoremForSlot(d: Template02SlotDescriptor): string {
  let text: string;
  if (d.maxCharsPerLine != null) {
    // Quebra manual: o exemplo já nasce quebrado, senão a linha única estoura o
    // limite POR LINHA e o contador da barra lateral abriria no vermelho.
    const perLine = Math.max(1, Math.floor(d.maxCharsPerLine * LOREM_FILL));
    const lines = Math.max(1, (d.maxLines ?? 3) - 1);
    text = Array.from({ length: lines }, (_, i) => loremUpTo(perLine, i * 3)).join('\n');
  } else if (d.maxChars != null) {
    text = loremUpTo(Math.max(1, Math.floor(d.maxChars * LOREM_FILL)));
  } else {
    text = loremUpTo(40);
  }
  return d.upper ? text.toUpperCase() : text;
}

/**
 * Slots de um slide NOVO do modelo pedido: lorem em todo slot de texto, imagem
 * vazia (o usuário escolhe a dele) e cabeçalho próprio em
 * LOREM IPSUM/@LOREMIPSUM.
 */
export function template02NewSlideSlots(
  model: number,
  /** @deprecated Mantido apenas para chamadas antigas; não há mais herança. */
  _inheritedHeader?: Template02Slots
): Template02Slots {
  const out: Template02Slots = {};
  for (const d of template02SlotsForModel(model)) {
    if (d.scope === 'header') {
      out[d.slot] = TEMPLATE_02_DEFAULT_HEADER[d.slot];
      continue;
    }
    if (d.kind === 'text') out[d.slot] = template02LoremForSlot(d);
  }
  // O marcador tem de caber numa linha do headline: a primeira linha É o valor,
  // então a regra do spec nasce satisfeita.
  if (out['cover.headline']) out['cover.highlight'] = out['cover.headline'].split('\n')[0];
  return out;
}
