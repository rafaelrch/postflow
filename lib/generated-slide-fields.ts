import {
  ContentLayout,
  DEFAULT_IMAGE_POSITION,
  SlideStyle,
  TextPosition,
} from '@/types';

/**
 * Campos de estilo que a GERAÇÃO escreve nos estilos de forma livre (Editorial,
 * Minimalista, Perfil).
 *
 * Morava dentro do `CreateWizard`. Saiu para cá porque é uma função pura e é
 * exatamente o que o deck gerado recebe — testar aqui é testar a geração, não
 * uma reimplementação dela. Os templates de spec (1 e 2) não passam por aqui:
 * neles a geração não escreve estilo nenhum, o spec manda.
 */

/* ── Variação de layout do Editorial ──────────────────────────────────────── */

/**
 * As três sequências, na ordem da rotação. `text-image-text` vem primeiro de
 * propósito: era o padrão do renderer, então o primeiro slide interno continua
 * com a cara de hoje e a variação é ADITIVA a partir do segundo.
 *
 * `text-only` fica FORA: ele nem aparece no seletor da barra lateral e, pior,
 * ignora a âncora vertical (título fixo em `CONTENT_TOP`, descrição em 54% da
 * altura). Sortear uma posição de texto que aquele layout não respeita daria um
 * slide que não obedece ao próprio controle.
 */
const SEQUENCIAS: ContentLayout[] = ['text-image-text', 'image-text-text', 'text-text-image'];

/**
 * Faixas verticais, na ordem da rotação. Só o eixo VERTICAL varia: o Editorial
 * gerado é alinhado à esquerda, e trocar de coluna a cada slide descaracterizaria
 * o template. `middle` primeiro pelo mesmo motivo da lista acima.
 */
const ANCORAS: TextPosition[] = ['middle-left', 'top-left', 'bottom-left'];

/** Quantos slides internos até a rotação voltar ao começo. */
export const EDITORIAL_LAYOUT_CYCLE = SEQUENCIAS.length * ANCORAS.length;

export interface EditorialSlideLayout {
  contentLayout: ContentLayout;
  textPosition: TextPosition;
  textAlignment: 'left' | 'center' | 'right';
}

/**
 * Layout do slide interno `index` de um Editorial gerado — `null` na capa.
 *
 * DETERMINÍSTICO por índice: o valor é decidido uma vez, na geração, e gravado
 * no slide (`content_layout` / `text_position`). Sortear em tempo de render
 * mudaria a cara do carrossel a cada reload e comeria o ajuste manual.
 *
 * A sequência anda de 1 em 1 e a faixa de 1 + ⌊n/3⌋. Os dois passos são primos
 * com 3 na ordem em que se combinam, então o par percorre um QUADRADO LATINO:
 * as nove combinações saem sem repetição antes da nona, e dois slides vizinhos
 * nunca coincidem em nenhum dos dois eixos.
 */
export function editorialSlideLayout(index: number): EditorialSlideLayout | null {
  // A capa não entra: ela é a capa, com layout e âncora próprios.
  if (index < 1) return null;

  const n = index - 1;
  const contentLayout = SEQUENCIAS[n % SEQUENCIAS.length];
  const textPosition = ANCORAS[(n + Math.floor(n / SEQUENCIAS.length)) % ANCORAS.length];

  return { contentLayout, textPosition, textAlignment: 'left' };
}

/* ── Campos gerados ───────────────────────────────────────────────────────── */

export function freeFormSlideFields(style: SlideStyle, i: number) {
  const isEditorialContent = style === 'editorial' && i > 0;
  // Só o Editorial embaralha; nos outros estilos a geração segue como sempre.
  const variacao = isEditorialContent ? editorialSlideLayout(i) : null;

  return {
    imageType: 'background' as const,
    imagePosition: { ...DEFAULT_IMAGE_POSITION },
    shadow: { style: isEditorialContent ? 'none' : 'base', opacity: 88 } as const,
    // Gravado, não inferido: é o que faz o reload manter a cara e o ajuste
    // manual do usuário vencer depois (ele escreve no mesmo campo).
    ...(variacao ? { contentLayout: variacao.contentLayout } : {}),
    textPosition: (variacao?.textPosition
      ?? (isEditorialContent ? 'middle-left' : i === 0 ? 'bottom-center' : 'bottom-left')) as TextPosition,
    textAlignment: (variacao?.textAlignment ?? (i === 0 ? 'center' : 'left')) as 'center' | 'left' | 'right',
    fontSize: style === 'profile'
      ? { title: 47, description: 26 }
      : { title: i === 0 ? 90 : 70, description: 36 },
    lineHeight: style === 'profile' ? 1.1 : 1.2,
    titleDescriptionGap: style === 'profile' ? 41 : undefined,
    ctaButton: { show: false, text: 'Comenta FLUXO', fontSize: 16, borderRadius: 12, style: 'solid' as const, position: 'bottom-center' as const },
  };
}
