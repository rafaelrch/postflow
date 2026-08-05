import {
  Baseline,
  CircleUser,
  Contrast,
  Frame,
  Image as ImageIcon,
  LayoutPanelLeft,
  Palette,
  RotateCcw,
  SunMoon,
  Type,
  type LucideIcon,
} from 'lucide-react';
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
  | 'tema'
  | 'conteudoSlide'
  | 'imagem'
  | 'estiloDoTexto'
  | 'textoDoSlide'
  | 'layoutDoSlide'
  | 'sombraOverlay'
  | 'fundoDoSlide'
  | 'cantos'
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
  /** A capa do Editorial não tem shape de imagem de conteúdo. */
  isEditorialCover: boolean;
}

export interface PanelDef {
  id: PanelId;
  scope: PanelScope;
  icon: LucideIcon;
  /** Função quando o rótulo depende do contexto. */
  label: string | ((ctx: PanelContext) => string);
}

export const PANEL_REGISTRY: Record<PanelId, PanelDef> = {
  perfil:            { id: 'perfil',            scope: 'post',   icon: CircleUser,       label: 'Perfil' },
  // Escreve `globalSettings.theme` — vale para o carrossel inteiro. O rótulo
  // antigo ("Tema do slide") dizia o contrário do que o controle faz.
  tema:              { id: 'tema',              scope: 'post',   icon: SunMoon,          label: 'Tema do carrossel' },
  conteudoSlide:     { id: 'conteudoSlide',     scope: 'slide',  icon: Type,             label: 'Conteúdo do slide' },
  // Sem sufixo "— Slide N": o número vive no cabeçalho do grupo agora.
  imagem:            { id: 'imagem',            scope: 'slide',  icon: ImageIcon,        label: 'Imagem' },
  estiloDoTexto:     { id: 'estiloDoTexto',     scope: 'slide',  icon: Baseline,         label: 'Estilo do texto' },
  textoDoSlide:      { id: 'textoDoSlide',      scope: 'slide',  icon: Type,             label: 'Texto do slide' },
  layoutDoSlide:     { id: 'layoutDoSlide',     scope: 'slide',  icon: LayoutPanelLeft,  label: 'Layout do slide' },
  sombraOverlay:     { id: 'sombraOverlay',     scope: 'slide',  icon: Contrast,         label: 'Sombra / Overlay' },
  fundoDoSlide:      { id: 'fundoDoSlide',      scope: 'slide',  icon: Palette,          label: 'Fundo do slide' },
  cantos:            { id: 'cantos',            scope: 'global', icon: Frame,            label: 'Cantos' },
  restaurarTemplate: { id: 'restaurarTemplate', scope: 'slide',  icon: RotateCcw,        label: 'Restaurar estilo original deste slide' },
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
        // O modelo 6 não tem imagem nenhuma no desenho — e slider de posição
        // sobre nada não mexe em coisa alguma.
        { id: 'imagem', when: (c) => c.template01Model != null && c.template01Model !== 6 },
        'estiloDoTexto',
        'fundoDoSlide',
        // Sempre o ÚLTIMO do grupo: é o que desfaz tudo o que está acima.
        'restaurarTemplate',
      ],
    },
    { scope: 'global', panels: ['cantos'] },
  ],

  profile: [
    { scope: 'post', panels: ['perfil', 'tema'] },
    { scope: 'slide', panels: ['conteudoSlide', 'imagem'] },
  ],

  editorial: [
    {
      scope: 'slide',
      panels: [
        // Na capa a imagem vai no fundo do slide, não num shape de conteúdo.
        { id: 'imagem', when: (c) => !c.isEditorialCover },
        'textoDoSlide',
        'layoutDoSlide',
        'sombraOverlay',
        'fundoDoSlide',
      ],
    },
    { scope: 'global', panels: ['cantos'] },
  ],

  minimalist: [
    { scope: 'slide', panels: ['imagem', 'textoDoSlide', 'sombraOverlay', 'fundoDoSlide'] },
    { scope: 'global', panels: ['cantos'] },
  ],
};

/** Resolve a config de um estilo para a lista de ids que de fato aparecem. */
export function visiblePanels(ctx: PanelContext): { scope: PanelScope; ids: PanelId[] }[] {
  return TEMPLATE_SIDEBAR_CONFIG[ctx.style].map((group) => ({
    scope: group.scope,
    ids: group.panels
      .filter((p) => typeof p === 'string' || p.when(ctx))
      .map((p) => (typeof p === 'string' ? p : p.id)),
  }));
}
