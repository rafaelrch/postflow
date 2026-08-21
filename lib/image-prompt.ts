import type { ImageShape, ImageSurface } from '@/types';
import type { BrandContext } from '@/lib/brand-context';

/**
 * O PROMPT DE IMAGEM, EM CAMADAS.
 *
 * Antes isto era UMA string concatenada com um sufixo fixo colado no fim, e o
 * sufixo brigava com o resto do prompt. Dois defeitos provados na fonte:
 *
 * 1. 🔴 CONTRADIÇÃO DE ORIENTAÇÃO. O sufixo fixo terminava em
 *    "vertical composition" e era colado em TODO prompt — inclusive no
 *    `inset-landscape`, cujo enquadramento pede "wide horizontal composition".
 *    O prompt entregue dizia as duas coisas na mesma frase e o modelo resolvia
 *    como quisesse. Agora a orientação sai de UM lugar só: a camada de
 *    COMPOSITION, derivada do `shape`. Não existe mais orientação no texto fixo.
 *
 * 2. 🔴 ATMOSFERA IMPOSTA. "dark atmosphere" também era fixo, para os quatro
 *    templates. Mas o Radar é creme (#EEE5D9), o Perfil é um card BRANCO
 *    (#FFFFFF) e o Manifesto alterna modelos claros (#FFFFFF) e escuros
 *    (#050416). Pedir foto escura para um slide claro entrega uma imagem que
 *    briga com o slide em que ela cai. Agora a atmosfera vem do `surface` do
 *    destino.
 *
 * Este módulo é PURO de propósito — nenhum import do client da OpenAI. Assim o
 * prompt inteiro pode ser afirmado em teste de node, sem chave de API e sem
 * gastar crédito do usuário, que é o que torna a melhoria mensurável em vez de
 * "aumentamos o prompt e parece melhor".
 *
 * REGRA DE OURO deste arquivo: mesma entrada, mesma string. Nada de data,
 * random, ordem de chave de objeto ou qualquer coisa que mude entre duas
 * chamadas iguais — o teste de determinismo existe para travar isso.
 */

/** Rótulo de cada camada, na ordem em que entram no prompt final. */
const LAYERS = ['ROLE', 'SUBJECT', 'ART DIRECTION', 'COMPOSITION', 'EXCLUDE', 'OUTPUT'] as const;
type Layer = (typeof LAYERS)[number];

/**
 * Camada de SISTEMA. Diz o que a imagem É antes de dizer o que ela mostra:
 * uma peça de um carrossel editorial, não uma ilustração solta.
 */
const ROLE =
  'You are an editorial photography art director producing a single image for one slide of a social media carousel.';

/**
 * ATMOSFERA por claridade do destino.
 *
 * O que manda aqui é a superfície em que a imagem CAI, não o gosto de quem
 * escreveu o prompt: uma foto escura num card branco (Perfil) ou num slide
 * creme (Radar) faz o slide brigar consigo mesmo.
 *
 * `dark` é o padrão em toda a cadeia — é literalmente o comportamento de hoje,
 * então quem não informar `surface` recebe a mesma atmosfera de antes.
 */
const ATMOSPHERE: Record<ImageSurface, string> = {
  dark:
    'Low-key, moody atmosphere with deep shadows and controlled highlights; the image sits on a DARK slide, so keep the overall value range low and let the darkest areas fall to near-black.',
  light:
    'High-key, bright and airy atmosphere with soft diffused light and open shadows; the image sits on a LIGHT slide, so keep the overall value range high and avoid heavy blacks that would fight the pale surface.',
};

/**
 * COMPOSIÇÃO por formato do destino — e o ÚNICO lugar que fala de orientação.
 *
 * Cada entrada diz três coisas na ordem: a orientação, o que sobrevive ao
 * corte daquela caixa, e onde fica o ESPAÇO NEGATIVO em que o texto do slide
 * entra por cima. O espaço negativo não é detalhe: o texto é desenhado sobre a
 * imagem depois, e uma foto cheia de detalhe no lugar errado torna o slide
 * ilegível sem que a imagem em si pareça ruim.
 */
const COMPOSITION: Record<ImageShape, string> = {
  'full-bleed':
    'Vertical portrait orientation. Full-bleed background composition that survives being cropped at the edges: keep the subject away from the borders. Leave a calm, low-detail, low-contrast area across the lower half where headline text will be laid on top.',
  'inset-block':
    'Vertical portrait orientation. Single centered subject in a tight composition that still reads when cropped to a narrow portrait strip: keep everything essential in the central column, nothing important near the left or right edges. No text is laid over this image, so it may fill the frame.',
  'inset-landscape':
    'Wide horizontal landscape orientation. Single centered subject that survives being cropped at the top and bottom: keep everything essential in the middle band, with generous headroom and floor that can be trimmed away, and nothing important near the upper or lower edges. No text is laid over this image, so it may fill the frame.',
};

/**
 * EXCLUSÕES. Ficam numa camada própria e nomeada porque é a parte que o modelo
 * mais atropela: qualquer menção a "editorial" puxa letreiro, marca d'água e
 * legenda inventada para dentro da foto — e aí a imagem entra no slide já
 * brigando com o texto de verdade que vai por cima.
 */
const EXCLUDE =
  'No text, letters, numbers, words, captions, titles, subtitles, logos, wordmarks, watermarks, signatures, UI elements, borders or frames of any kind. No collage or split-screen. Nothing that looks like a screenshot.';

/** FORMATO DE SAÍDA: o acabamento fotográfico, sem uma palavra de orientação. */
const OUTPUT =
  'A single photograph. Editorial, cinematic, professional photography with natural materials and believable light; shallow depth of field; realistic textures; no illustration, no 3D render, no stock-photo staging.';

/** Intenção editorial do slide dentro do deck. */
const INTENT = {
  cover: 'Cover slide — a cinematic establishing shot that opens the carousel for',
  final: 'Closing slide — a minimalist, evocative shot that closes the carousel for',
  middle: 'Middle slide — an illustrative editorial shot supporting',
} as const;

export interface ImagePromptInput {
  title: string;
  description?: string;
  isCover?: boolean;
  isFinal?: boolean;
  /** Formato do lugar onde a imagem cai no slide. */
  shape?: ImageShape;
  /** Claridade da superfície do destino. Ausente = `dark`, como sempre foi. */
  surface?: ImageSurface;
  /** Direção livre do usuário (textarea do painel de IA). */
  userPrompt?: string;
  /** Contexto de marca do onboarding. Só paleta e tom chegam aqui — ver abaixo. */
  brand?: BrandContext | null;
  /** O que amarra as N imagens de um mesmo carrossel. Ver `seriesDirective`. */
  series?: ImageSeries;
}

/**
 * A âncora de COERÊNCIA entre os slides de um mesmo carrossel.
 *
 * O problema real: cada slide é uma chamada independente à OpenAI, e nada
 * ligava as N imagens. Um deck saía com 6 fotos que não pareciam do mesmo
 * ensaio.
 *
 * A solução aqui NÃO inventa estado no banco e NÃO mexe no fluxo de lote: os
 * dois campos são de DECK, não de slide, então o cliente calcula uma vez e
 * manda o MESMO valor em todas as chamadas do lote. Prompt idêntico nessa
 * camada em todas as N chamadas é o que dá ao modelo um alvo comum.
 *
 * Não é garantia — imagem gerada nunca é determinística do lado da OpenAI. É a
 * âncora mais forte que dá para pôr sem guardar estado entre chamadas.
 */
export interface ImageSeries {
  /** Título do carrossel — o mesmo para todos os slides do deck. */
  deckTitle?: string;
  /** Quantas imagens o lote vai gerar. */
  size?: number;
}

/** Colapsa espaço e apara — texto de usuário entra em uma linha só. */
function limpa(texto: string | undefined | null): string {
  return String(texto ?? '').replace(/\s+/g, ' ').trim();
}

/** Fecha a frase com ponto, sem duplicar o que já termina pontuado. */
function frase(texto: string): string {
  return /[.!?]$/.test(texto) ? texto : `${texto}.`;
}

/**
 * O que do contexto de marca serve para uma FOTO.
 *
 * 🔴 Só PALETA e TOM. O `brand-context` foi escrito para o agente de TEXTO, e
 * carrega nicho, público, história da marca e dores do público — até 200
 * caracteres de prosa cada. Isso é briefing de copy: mandar para um modelo de
 * imagem não melhora a foto, dilui o assunto (que já vem do título do slide) e
 * ainda empurra o modelo a DESENHAR aquelas palavras dentro da imagem, que é
 * exatamente o que a camada EXCLUDE passa o prompt inteiro tentando impedir.
 *
 * Paleta e tom são direção de arte de verdade: a paleta vira grade de cor, e o
 * tom vira o clima da luz. Os dois cabem numa frase.
 */
export function brandArtDirection(brand: BrandContext | null | undefined): string {
  if (!brand) return '';
  const partes: string[] = [];

  const paleta = brand.palette.filter((c) => typeof c === 'string' && c.trim() !== '');
  if (paleta.length > 0) {
    partes.push(
      `Grade the image toward the brand palette (${paleta.join(', ')}) — as the colour of light, materials and surfaces in the scene, never as graphic overlays or colour blocks`,
    );
  }

  const tom = limpa(brand.tone);
  if (tom) partes.push(`The mood should read as: ${tom}`);

  return partes.length > 0 ? partes.map(frase).join(' ') : '';
}

/**
 * A frase de série. Idêntica em todas as chamadas do mesmo lote — é essa
 * repetição literal que faz as N imagens mirarem o mesmo lugar.
 */
export function seriesDirective(series: ImageSeries | undefined): string {
  // 🔴 Série exige MAIS DE UMA imagem. Uma imagem sozinha não é um ensaio, e
  // mandar "mantenha a coerência com o conjunto" numa geração avulsa promete
  // consistência com imagens que não estão sendo geradas — ruído que só pode
  // atrapalhar o único quadro que o usuário vai receber.
  const total = typeof series?.size === 'number' && series.size > 1 ? Math.trunc(series.size) : 0;
  if (!total) return '';

  const titulo = limpa(series?.deckTitle);
  const deck = titulo ? ` for the carousel "${titulo}"` : '';
  return frase(
    `This image belongs to a cohesive set of ${total} images${deck}. Keep lighting, colour grade, lens character, material palette and subject treatment consistent across the whole set — only the subject matter changes from image to image`,
  );
}

/**
 * Monta o prompt final, camada por camada.
 *
 * As camadas são NOMEADAS no texto entregue à OpenAI, e não fundidas numa
 * frase só: assim cada instrução tem endereço, o modelo não mistura
 * enquadramento com acabamento, e quem for depurar consegue ler o prompt e
 * dizer qual camada errou. Camada vazia não aparece — prompt com rótulo órfão
 * ("ART DIRECTION:" seguido de nada) é ruído que o modelo tenta interpretar.
 */
export function buildImagePrompt(input: ImagePromptInput): string {
  const {
    title,
    description,
    isCover,
    isFinal,
    shape = 'full-bleed',
    surface = 'dark',
    userPrompt,
    brand,
    series,
  } = input;

  const assunto = [limpa(title), limpa(description)].filter(Boolean).join(' — ');
  const intent = isCover ? INTENT.cover : isFinal ? INTENT.final : INTENT.middle;

  // ART DIRECTION empilha, nesta ordem: marca (o que é do usuário e vale para
  // o deck todo), atmosfera (do destino), série (a âncora comum) e por último a
  // direção livre — que vem depois de propósito, para o pedido explícito do
  // usuário ser a última palavra dentro da camada.
  const arte = [
    brandArtDirection(brand),
    ATMOSPHERE[surface] ?? ATMOSPHERE.dark,
    seriesDirective(series),
    limpa(userPrompt) ? frase(`Additional art direction: ${limpa(userPrompt)}`) : '',
  ]
    .filter(Boolean)
    .join(' ');

  const conteudo: Record<Layer, string> = {
    ROLE,
    SUBJECT: frase(`${intent}: ${assunto || 'the topic of this slide'}`),
    'ART DIRECTION': arte,
    COMPOSITION: COMPOSITION[shape] ?? COMPOSITION['full-bleed'],
    EXCLUDE,
    OUTPUT,
  };

  return LAYERS.filter((camada) => conteudo[camada] !== '')
    .map((camada) => `${camada}: ${conteudo[camada]}`)
    .join('\n');
}
