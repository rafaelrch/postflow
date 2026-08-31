import type { IconSvgElement } from '@hugeicons/react';
import {
  CaptionsIcon,
  ContrastIcon,
  FrameIcon,
  Image01Icon,
  LayoutPanelLeftIcon,
  PaletteIcon,
  RotateCcwIcon,
  SunMoonIcon,
  TextUnderlineIcon,
  TypeIcon,
  UserCircle02Icon,
  WandSparklesIcon,
} from '@hugeicons/core-free-icons';
import { GlobalSettings, Slide, SlideStyle } from '@/types';

/**
 * Registry de painéis da barra lateral.
 *
 * Antes a decisão do que mostrar era um ternário no meio do JSX:
 *
 *     style === 'template01' ? … : style === 'profile' ? … : standardControls
 *
 * Não havia registry nem config: cada estilo carregava o próprio bloco de JSX,
 * e "quais painéis o Editorial tem" só se respondia lendo 300 linhas. Aqui a
 * composição vira dado — identidade, ícone, rótulo e ESCOPO de cada painel num
 * lugar só, e um mapa de estilo → grupos.
 */

/** A quem o painel pertence: o post, o slide ativo, ou o deck inteiro. */
export type PanelScope = 'post' | 'slide' | 'global';

export type PanelId =
  | 'perfil'
  | 'refinarTexto'
  | 'tema'
  | 'conteudoSlide'
  | 'imagem'
  | 'estiloDoTexto'
  | 'textoDoSlide'
  | 'destaquesDoTexto'
  | 'layoutDoSlide'
  | 'sombraOverlay'
  | 'fundoDoSlide'
  | 'cantos'
  | 'cabecalho'
  | 'restaurarTemplate';

/** O que as condições de renderização podem olhar. */
export interface PanelContext {
  style: SlideStyle;
  slide: Slide;
  activeSlideIndex: number;
  globalSettings: GlobalSettings;
  /**
   * Modelo do TEMPLATE 1 (1..6) — `null` nos outros estilos.
   *
   * 🔴 Condição de template usa ISTO, nunca `activeSlideIndex + 1`: modelo não
   * é posição. Deck com modelo repetido, slides reordenados ou mais de 6 slides
   * quebram na hora se a condição olhar a posição.
   */
  template01Model: number | null;
  /**
   * Modelo do TEMPLATE 2 (1..3) — `null` nos outros estilos. Mesma regra do
   * `template01Model`: modelo não é posição.
   */
  template02Model: number | null;
  /** A capa do Editorial não tem shape de imagem de conteúdo. */
  isEditorialCover: boolean;
}

export interface PanelDef {
  id: PanelId;
  scope: PanelScope;
  icon: IconSvgElement;
  /** Função quando o rótulo depende do contexto. */
  label: string | ((ctx: PanelContext) => string);
}

export const PANEL_REGISTRY: Record<PanelId, PanelDef> = {
  perfil:            { id: 'perfil',            scope: 'post',   icon: UserCircle02Icon, label: 'Perfil' },
  // Escopo `slide` porque é do grupo do slide que ele nasce — mas o painel
  // oferece os TRÊS escopos por dentro (carrossel, slide, campo). O escopo do
  // registry diz onde o painel MORA na barra, não o alcance do que ele faz.
  refinarTexto:      { id: 'refinarTexto',      scope: 'slide',  icon: WandSparklesIcon, label: 'Refinar texto com IA' },
  // Escreve `globalSettings.theme` — vale para o carrossel inteiro. O rótulo
  // antigo ("Tema do slide") dizia o contrário do que o controle faz.
  tema:              { id: 'tema',              scope: 'post',   icon: SunMoonIcon,      label: 'Tema do carrossel' },
  conteudoSlide:     { id: 'conteudoSlide',     scope: 'slide',  icon: TypeIcon,         label: 'Conteúdo do slide' },
  // Sem sufixo "— Slide N": o número vive no cabeçalho do grupo agora.
  imagem:            { id: 'imagem',            scope: 'slide',  icon: Image01Icon,      label: 'Imagem' },
  estiloDoTexto:     { id: 'estiloDoTexto',     scope: 'slide',  icon: TextUnderlineIcon, label: 'Estilo do texto' },
  textoDoSlide:      { id: 'textoDoSlide',      scope: 'slide',  icon: TypeIcon,         label: 'Texto do slide' },
  // Só o Perfil usa: os outros estilos já trazem o mesmo controle dentro do
  // painel de texto. Aqui ele é o painel inteiro porque o Perfil não tem
  // "Texto do slide" — a tipografia dele é fixa (ver `ProfileSlide`).
  destaquesDoTexto:  { id: 'destaquesDoTexto',  scope: 'slide',  icon: TextUnderlineIcon, label: 'Destaques no texto' },
  layoutDoSlide:     { id: 'layoutDoSlide',     scope: 'slide',  icon: LayoutPanelLeftIcon, label: 'Layout do slide' },
  sombraOverlay:     { id: 'sombraOverlay',     scope: 'slide',  icon: ContrastIcon,    label: (ctx) => (ctx.style === 'template03' ? 'Overlay degradê' : 'Sombra / Overlay') },
  fundoDoSlide:      { id: 'fundoDoSlide',      scope: 'slide',  icon: PaletteIcon,     label: 'Fundo do slide' },
  cantos:            { id: 'cantos',            scope: 'global', icon: FrameIcon,       label: 'Cantos' },
  // 🔴 Rótulo por ESTILO, não fixo. O `cantos` acima também se chama "Cantos",
  // e no Template 3 os DOIS painéis existem no mesmo grupo: `cantos` é a
  // assinatura no topo do slide, `cabecalho` é a barra de perfil (o @ ao lado
  // do avatar), que fica junto do bloco de título e desce com ele. Dois painéis
  // com o mesmo nome na mesma lista é rótulo que mente — exatamente o que a
  // refatoração desta barra veio acabar. Nos outros estilos só um dos dois
  // aparece, e ali o nome de sempre continua.
  cabecalho:         { id: 'cabecalho',         scope: 'slide',  icon: CaptionsIcon,    label: (ctx) => (ctx.style === 'template03' ? 'Barra de perfil' : 'Cantos') },
  restaurarTemplate: { id: 'restaurarTemplate', scope: 'slide',  icon: RotateCcwIcon,   label: 'Restaurar estilo original deste slide' },
};

export function panelLabel(id: PanelId, ctx: PanelContext): string {
  const { label } = PANEL_REGISTRY[id];
  return typeof label === 'function' ? label(ctx) : label;
}

/** Um painel na config: só o id, ou o id com a condição que o liga. */
type ConfiguredPanel = PanelId | { id: PanelId; when: (ctx: PanelContext) => boolean };

export interface SidebarGroupConfig {
  scope: PanelScope;
  panels: ConfiguredPanel[];
  /**
   * Rótulo do cabeçalho do grupo. Ausente = o padrão do escopo.
   *
   * Existe porque o padrão do escopo `global` é "Estilo global", e o grupo
   * global do Template 2 é CONTEÚDO (a categoria e o @ do deck). Rótulo que
   * mente foi exatamente o que a refatoração da barra do T1 veio acabar — então
   * quem tem um caso diferente declara o dele aqui, em vez de o componente
   * forçar um nome só.
   */
  label?: string;
  hint?: string;
}

/**
 * Quais painéis cada estilo mostra, na ordem, agrupados por escopo.
 *
 * `minimalist` está fora do wizard hoje, mas continua existindo em carrossel
 * salvo — por isso tem config própria e não um `default` implícito.
 */
export const TEMPLATE_SIDEBAR_CONFIG: Record<SlideStyle, SidebarGroupConfig[]> = {
  template01: [
    {
      scope: 'slide',
      panels: [
        'conteudoSlide',
        'refinarTexto',
        // O modelo 6 não tem imagem nenhuma no desenho — e slider de posição
        // sobre nada não mexe em coisa alguma.
        { id: 'imagem', when: (c) => c.template01Model != null && c.template01Model !== 6 },
        'estiloDoTexto',
        'fundoDoSlide',
        // Sem 'sombraOverlay' aqui de propósito: o degradê preto de legibilidade
        // do T1 é FIXO e continua renderizando — não há o que editar. Os outros
        // estilos seguem com o painel; o PanelId e o PANEL_REGISTRY ficam.

        // `cantos` fica no grupo do slide porque cor e visibilidade são deste
        // slide — mas o TEXTO do canto vale para o deck inteiro. Nos estilos
        // legados o mesmo painel continua global nas configs abaixo.
        'cantos',
        // Sempre o ÚLTIMO do grupo: é o que desfaz tudo o que está acima.
        'restaurarTemplate',
      ],
    },
  ],

  template02: [
    {
      scope: 'slide',
      panels: [
        'conteudoSlide',
        'refinarTexto',
        // Todo modelo do T2 tem imagem: o fundo da capa, ou o bloco 380x1089
        // dos internos. Não há o caso "modelo sem imagem" do T1.
        'imagem',
        'estiloDoTexto',
        'fundoDoSlide',
        'cabecalho',
        // Sempre o ÚLTIMO do grupo: é o que desfaz tudo o que está acima.
        'restaurarTemplate',
      ],
    },
  ],

  /**
   * TEMPLATE 3 — "FlowLine".
   *
   * Um grupo só, no escopo do slide, como nos outros dois templates de spec.
   * Dois painéis que o T2 não tem, e por quê:
   *
   * - `cabecalho` é a BARRA DE PERFIL (o @ ao lado do avatar), que fica junto do
   *   bloco de título e desce com ele;
   * - `cantos` é a assinatura no topo do slide (marca à esquerda, arroba à
   *   direita). São coisas diferentes, em lugares diferentes do desenho, e
   *   juntá-las num painel só daria um rótulo que mente.
   *
   * Todo modelo do FlowLine tem imagem de fundo, então `imagem` entra sem
   * condição: não há o caso "modelo sem imagem" do T1, onde o painel some.
   */
  template03: [
    {
      scope: 'slide',
      panels: [
        'conteudoSlide',
        'refinarTexto',
        'imagem',
        'estiloDoTexto',
        'fundoDoSlide',
        'sombraOverlay',
        'cabecalho',
        'cantos',
        // Sempre o ÚLTIMO do grupo: é o que desfaz tudo o que está acima.
        'restaurarTemplate',
      ],
    },
  ],

  profile: [
    { scope: 'post', panels: ['perfil', 'tema'] },
    { scope: 'slide', panels: ['conteudoSlide', 'refinarTexto', 'destaquesDoTexto', 'imagem'] },
  ],

  editorial: [
    {
      scope: 'slide',
      panels: [
        // Na CAPA a imagem vai no fundo do slide, e nos internos num shape de
        // conteúdo — mas o painel é o mesmo nos dois. Antes a capa não tinha
        // "Imagem" e a geração por IA dela morava escondida dentro de "Fundo do
        // slide": ninguém achava.
        'imagem',
        'textoDoSlide',
        'refinarTexto',
        'layoutDoSlide',
        'sombraOverlay',
        'fundoDoSlide',
      ],
    },
    { scope: 'global', panels: ['cantos'] },
  ],

  minimalist: [
    { scope: 'slide', panels: ['imagem', 'textoDoSlide', 'refinarTexto', 'sombraOverlay', 'fundoDoSlide'] },
    { scope: 'global', panels: ['cantos'] },
  ],
};

/** Resolve a config de um estilo para a lista de ids que de fato aparecem. */
export function visiblePanels(
  ctx: PanelContext
): { scope: PanelScope; ids: PanelId[]; label?: string; hint?: string }[] {
  return TEMPLATE_SIDEBAR_CONFIG[ctx.style].map((group) => ({
    scope: group.scope,
    label: group.label,
    hint: group.hint,
    ids: group.panels
      .filter((p) => typeof p === 'string' || p.when(ctx))
      .map((p) => (typeof p === 'string' ? p : p.id)),
  }));
}
