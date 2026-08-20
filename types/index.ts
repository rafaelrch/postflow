export type SlideStyle = 'minimalist' | 'profile' | 'editorial' | 'template01' | 'template02';
export type ContentLayout = 'cover' | 'text-image-text' | 'text-text-image' | 'image-text-text' | 'text-only';
// Formato/proporção do slide. Todos compartilham largura 1080 (só a altura muda);
// dimensões e labels vivem em lib/formats.ts. Ausência => '4:5' (legado).
export type SlideFormat = '4:5' | '1:1' | '9:16';

/**
 * Formato do lugar onde uma imagem gerada vai cair no slide.
 *
 * `full-bleed`      — ocupa o slide inteiro (1080x1350), e o texto entra por cima.
 * `inset-block`     — um bloco entre os textos, bem mais estreito que o slide (no
 *                     T2 são 380x1089, quase 1:3).
 * `inset-landscape` — uma caixa de mídia embutida e HORIZONTAL: a mídia do post
 *                     no Perfil, 864x510 (~1.69:1). É o único formato deitado, e
 *                     por isso o primeiro que muda o tamanho pedido à OpenAI
 *                     (ver `imageSizeForShape`).
 *
 * A geração precisa saber disso: a mesma foto que enquadra bem no fundo chega
 * decapitada no bloco estreito. Quem decide o formato de um slide é
 * `imageShape` em hooks/useGenerateCarouselImages.
 *
 * Mora AQUI, e não junto do hook, porque o servidor precisa dele: `lib/openai`
 * e a rota de geração são os dois consumidores, e apontar para um módulo
 * 'use client' é dependência na direção errada — no dia em que alguém precisar
 * de um valor daquele arquivo, o import deixa de ser apagado e arrasta o hook
 * inteiro para dentro do servidor.
 */
export type ImageShape = 'full-bleed' | 'inset-block' | 'inset-landscape';

export interface TextHighlight {
  text: string;
  color: string;
  underline?: boolean;
  font?: ElementFont;
}

// Fontes disponíveis para elementos individuais (título, subtítulo, cantos)
export type ElementFont =
  | 'SF Pro Display Light'
  | 'SF Pro Display Regular'
  | 'SF Pro Display Medium'
  | 'SF Pro Display SemiBold'
  | 'SF Pro Display Bold'
  | 'Inter Display Light'
  | 'Inter Display Regular'
  | 'Inter Display Medium'
  | 'Inter Display Bold'
  | 'IvyOra Text Medium'
  | 'IvyOra Text Medium Italic'
  | 'Bebas Neue'
  | 'Montserrat'
  | 'Montserrat Regular'
  | 'Anton'
  | 'Archivo Black'
  | 'Fjalla One'
  | 'Oswald Regular'
  | 'Oswald Bold'
  | 'Oswald SemiBold'
  | 'Montserrat Bold'
  | 'Montserrat ExtraBold'
  | 'Poppins Regular'
  | 'Poppins SemiBold'
  | 'Poppins Bold'
  | 'Raleway Bold'
  | 'Raleway ExtraBold'
  | 'Inter Light'
  | 'Inter Regular'
  | 'Inter Medium'
  | 'Inter SemiBold'
  | 'Inter Bold'
  | 'Inter Black'
  | 'Barlow Condensed Bold'
  | 'Barlow Condensed ExtraBold'
  | 'Playfair Display Regular'
  | 'Playfair Display Bold'
  | 'Playfair Display ExtraBold'
  | 'Cormorant Garamond Regular'
  | 'Cormorant Garamond SemiBold'
  | 'Cormorant Garamond Bold'
  | 'Lora Regular'
  | 'Lora Bold'
  | 'DM Serif Display'
  | 'Space Grotesk Regular'
  | 'Space Grotesk Medium'
  | 'Space Grotesk Bold'
  | 'Lato Regular'
  | 'Lato Bold'
  | 'Roboto Regular'
  | 'Roboto Medium'
  | 'Open Sans Regular'
  | 'Open Sans SemiBold'
  | 'Syne Regular'
  | 'Syne SemiBold'
  | 'Syne Bold'
  | 'Syne ExtraBold'
  | 'DM Sans Regular'
  | 'DM Sans Medium'
  | 'DM Sans Bold';
export type SlideTheme = 'dark' | 'light';
export type ImageType = 'background' | 'grid' | 'mixed';
export type TextPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type CtaStyle = 'solid' | 'outline' | 'glass';
export type BadgeStyle = 'solid' | 'minimal' | 'glass';
export type ShadowStyle = 'base' | 'top-strong' | 'base-strong' | 'gradient-full' | 'none';
export type FontPair =
  | 'SF Pro Display + IvyOra Text'
  | 'Space Grotesk + Inter'
  | 'Playfair Display + Lato'
  | 'Oswald + Roboto'
  | 'Montserrat + Open Sans'
  | 'Bebas Neue + Inter'
  | 'Syne + DM Sans';

export interface ImagePosition {
  x: number;
  y: number;
  zoom: number;
  // Como a imagem preenche a moldura ao trocar de formato:
  // 'cover' = preenche (pode cortar), 'contain' = contém (encaixa inteira).
  // Ausência mantém o comportamento legado (backgroundSize = zoom%).
  objectFit?: 'cover' | 'contain';
}

/**
 * Enquadramento de uma imagem recém-inserida.
 *
 * A imagem preenche a moldura sem deformar: `cover` preserva a proporção
 * original e amplia só o necessário. Quando as proporções diferem, o excedente
 * fica fora da moldura e o usuário ainda pode reposicionar/ajustar o zoom.
 */
export const DEFAULT_IMAGE_POSITION: ImagePosition = {
  x: 50,
  y: 50,
  zoom: 100,
  objectFit: 'cover',
};

export interface FontSize {
  title: number;
  description: number;
}

export interface CornerConfig {
  text: string;
  visible: boolean;
}

export interface CornersConfig {
  topLeft: CornerConfig;
  topRight: CornerConfig;
  show: boolean;
  fontSize: number;
  borderDistance: number;
  opacity: number;
  color?: string;
  elementFont?: ElementFont;
}

export interface ProfileBadge {
  show: boolean;
  photo: string;
  name: string;
  handle: string;
  size: number;
  style: BadgeStyle;
  position: TextPosition;
  headerFontSize: number;
}

export interface CtaButton {
  show: boolean;
  text: string;
  fontSize: number;
  borderRadius: number;
  style: CtaStyle;
  position: TextPosition;
}

export interface ShadowConfig {
  style: ShadowStyle;
  opacity: number;
  color?: string;   // hex, default '#000000'
  size?: number;    // 0–100, how far up the gradient extends (default 85)
  distance?: number; // 0–100, where the gradient starts fading (default 55)
}

export interface ProfileData {
  handle: string;
  name: string;
  photoUrl?: string;
  followers?: string;
}

/**
 * TEMPLATE 1 — controles cuja mexida o usuário precisa declarar.
 *
 * O nome da chave é o CONTROLE da barra lateral, não o campo do `Slide`: é o
 * gesto do usuário que cria o override, e o valor continua morando no campo de
 * sempre (`backgroundColor`, `fontSize.title`…). Ver `Slide.templateOverrides`.
 */
export type Template01SlideControl =
  | 'background'
  | 'shadow'
  | 'titleColor'
  | 'titleSize'
  | 'titleFont'
  | 'titleUnderline'
  | 'titleLetterSpacing'
  | 'descriptionColor'
  | 'descriptionSize'
  | 'descriptionFont'
  | 'descriptionUnderline'
  | 'lineHeight'
  | 'titleDescriptionGap'
  | 'textOffset'
  | 'textAlignment'
  | 'backgroundImagePosition'
  | 'backgroundImageOpacity'
  | 'contentImagePosition';

/** Controles dos cantos — deck inteiro, então moram no `GlobalSettings`. */
export type Template01CornerControl =
  | 'cornerColor'
  | 'cornerSize'
  | 'cornerFont'
  | 'cornerOpacity'
  | 'cornerDistance';

export type Template01SlideOverrideKeys = Partial<Record<Template01SlideControl, true>>;
export type Template01CornerOverrideKeys = Partial<Record<Template01CornerControl, true>>;

/**
 * TEMPLATE 1 — estilo de UM slot de texto (`s1.headline`, `s2.body`…).
 *
 * Os controles acima (`titleSize`, `descriptionColor`…) regem o slide por PAPEL
 * e por isso mexem em blocos diferentes de uma vez: no slide 5 o mesmo controle
 * pegava as duas colunas, na capa o chapéu andava junto do título. O usuário
 * pede tamanho/fonte/cor/letra por BLOCO — é o que mora aqui.
 *
 * Aqui não há marca separada: a PRESENÇA da chave do slot já é o gesto do
 * usuário (só a barra lateral escreve). Um deck gerado não tem este campo, e é
 * por isso que ele continua nascendo idêntico ao spec.
 */
export interface Template01SlotStyle {
  color?: string;
  /** Tamanho em px do canvas do spec (1080x1350), não em px de tela. */
  fontSize?: number;
  font?: ElementFont;
  /** Espaçamento de caractere em `em`. */
  letterSpacing?: number;
  underline?: boolean;
  /** Visibilidade por slot; usada pelo cabeçalho/cantos de cada slide. */
  visible?: boolean;
  /** Margem adicional para dentro, em px do canvas; usada nos cabeçalhos. */
  margin?: number;
  /** Opacidade do bloco, 0–100. Usada pelos cantos/cabeçalho. */
  opacity?: number;
  /**
   * Fundo do bloco. Hoje só o marcador da capa do TEMPLATE 2 usa (a tarja atrás
   * do destaque), e o Rafael pediu poder trocar a cor dele.
   *
   * Mora AQUI, e não num slot próprio, porque a cor do marcador é estilo do
   * bloco `cover.highlight` — que já tem entrada neste mapa. Um
   * `templateSlots['cover.highlightColor']` criaria um segundo lugar para a
   * mesma ideia e ainda misturaria estilo com CONTEÚDO, que é o que
   * `templateSlots` guarda.
   *
   * Campo opcional e aditivo: o Template 1 nunca escreve nele.
   */
  background?: string;
}

/**
 * O mesmo formato serve o Template 2 — `slides.template_slot_styles` é a coluna
 * de todos os templates, não só do primeiro. O nome com "01" ficou por ser o
 * template que o introduziu; use este alias em código novo.
 */
export type TemplateSlotStyle = Template01SlotStyle;

export interface Slide {
  id: string;
  carouselId?: string;
  position: number;
  title: string;
  description?: string;
  highlightWord?: string;
  highlights?: TextHighlight[];
  backgroundImageUrl?: string;
  gridImageUrl?: string;
  backgroundImageOpacity?: number; // 0–100, default 100
  imageType: ImageType;
  imagePosition: ImagePosition;
  // Imagem de conteúdo — renderizada entre os textos (não é o fundo do slide)
  contentImageUrl?: string;
  contentImagePosition?: ImagePosition;
  shadow: ShadowConfig;
  backgroundColor: string;
  textPosition: TextPosition;
  textOffset?: { x: number; y: number };
  textAlignment?: 'left' | 'center' | 'right';
  subtitle?: string;
  fontSize: FontSize;
  lineHeight: number;
  ctaButton: CtaButton;
  // Per-element text styling
  titleColor?: string;
  descriptionColor?: string;
  subtitleColor?: string;
  titleFont?: ElementFont;
  descriptionFont?: ElementFont;
  subtitleFont?: ElementFont;
  titleUnderline?: boolean;
  descriptionUnderline?: boolean;
  subtitleUnderline?: boolean;
  titleLetterSpacing?: number;
  titleDescriptionGap?: number;
  textPadding?: { top: number; right: number; bottom: number; left: number };
  contentLayout?: ContentLayout;
  /**
   * Conteúdo por slot do TEMPLATE 1 (`s1.headline`, `s3.image`, `cantos.left`…).
   * Só o estilo 'template01' usa: a forma é fixa no spec, então o slide não
   * carrega tipografia/posição, apenas o texto e as URLs de imagem.
   */
  templateSlots?: Record<string, string>;
  /**
   * TEMPLATE 1: QUAL dos 6 modelos do spec este slide desenha (1–6).
   *
   * Antes o modelo era a POSIÇÃO do slide, o que só fecha num deck de exatamente
   * 6 sem repetição. Com o usuário podendo repetir modelo e passar de 6, a
   * identidade de desenho tem de ser um dado do slide.
   *
   * 🔴 Ausente em todo deck salvo antes deste campo — e é isso que preserva a
   * compatibilidade: sem ele o modelo volta a sair da posição (`template01ModelOf`).
   */
  templateModel?: number;
  /**
   * Controles do TEMPLATE 1 que o USUÁRIO mexeu na barra lateral.
   *
   * Existe porque o `Slide` nasce PREENCHIDO (`DEFAULT_SLIDE`) e não tem campo
   * vazio para a maioria dos controles: sem uma marca explícita, a única forma
   * de saber se `backgroundColor` é escolha do usuário seria comparar com o
   * padrão — e qualquer coisa que grave um valor no slide (a geração, um
   * default novo) viraria override por acidente. Foi assim que a paleta da
   * marca apagou o degradê do template.
   *
   * Regra: GERAÇÃO NUNCA escreve aqui. Só os handlers da barra lateral.
   */
  templateOverrides?: Template01SlideOverrideKeys;
  /**
   * TEMPLATE 1: estilo POR SLOT de texto. Chave presente = o usuário mexeu
   * naquele bloco. Persiste em `slides.template_slot_styles` (jsonb).
   *
   * Regra igual à de `templateOverrides`: GERAÇÃO NUNCA escreve aqui.
   */
  templateSlotStyles?: Record<string, Template01SlotStyle>;
  editorialTitleOffsetY?: number;
  editorialDescOffsetY?: number;
  editorialImageOffsetY?: number;
}

export interface MetaBar {
  show: boolean;
  left: string;
  center: string;
  right: string;
}

export interface GlobalSettings {
  corners: CornersConfig;
  profileBadge: ProfileBadge;
  accentColor: string;
  fontPair: FontPair;
  theme: SlideTheme;
  metaBar?: MetaBar;
  // Formato/proporção do carrossel. Serializa em global_settings (jsonb).
  // Ausência => '4:5' (projetos antigos).
  format?: SlideFormat;
  /**
   * TEMPLATE 1: controles de canto que o usuário mexeu. Mesma regra do
   * `Slide.templateOverrides` — só a barra lateral escreve aqui. Serializa em
   * global_settings (jsonb), sem coluna nova.
   */
  templateOverrides?: Template01CornerOverrideKeys;
  /**
   * Família, peso, tamanho e margem compartilhados pelos cantos dos templates.
   * Texto, cor e visibilidade continuam em `slides.template_*`, pois podem
   * variar de card para card.
   */
  templateCornerStyle?: Pick<Template01SlotStyle, 'font' | 'fontSize' | 'margin' | 'opacity'>;
}

export interface Carousel {
  id: string;
  userId: string;
  title: string;
  style: SlideStyle;
  globalSettings: GlobalSettings;
  slides: Slide[];
  caption?: string;
  hashtags?: string[];
  createdAt: string;
  updatedAt: string;
}

export type TwitterFormat = 'A' | 'B';

export interface GenerateCarouselInput {
  prompt: string;
  style: SlideStyle;
  slideCount: number;
  imageType: ImageType;
  generateImages: boolean;
  webSearch?: boolean;
  imageDirection?: string;
  fontPair: FontPair;
  accentColor?: string;
  referenceImageBase64?: string;
  profileData?: ProfileData;
  twitterFormat?: TwitterFormat;
  /**
   * Opcionais do wizard. Omitidos — o caso de qualquer chamador antigo — o
   * prompt final sai byte a byte igual ao de antes.
   */
  language?: ContentLanguage;
  /** Usa o texto do prompt como está, sem a IA reescrever. */
  exactContent?: boolean;
}

/** Idioma em que a IA escreve o conteúdo. Ausente = português, como sempre foi. */
export type ContentLanguage = 'pt-BR' | 'en-US' | 'es-ES';

export interface SlideAIData {
  id: number;
  title: string;
  description: string;
  highlightWord: string;
  backgroundColor?: string;
  /**
   * Blocos de texto que existem no desenho além do par título/descrição —
   * hoje só o TEMPLATE 1 pede (chapéu da capa, remate, coluna de baixo).
   * Chaveado pelo nome curto do contrato (`eyebrow`, `kicker`, `botTitle`…).
   */
  extras?: Record<string, string>;
}

export interface CarouselAIResponse {
  slides: SlideAIData[];
  caption: string;
  hashtags: string[];
}

export const DEFAULT_CORNERS: CornersConfig = {
  topLeft: { text: '@handle', visible: true },
  topRight: { text: 'Título do carrossel', visible: true },
  show: true,
  fontSize: 27,
  borderDistance: 49,
  opacity: 80,
  color: '#FFFFFF',
  elementFont: 'SF Pro Display SemiBold',
};

export const DEFAULT_PROFILE_BADGE: ProfileBadge = {
  show: false,
  photo: '',
  name: '',
  handle: '',
  size: 48,
  style: 'solid',
  position: 'top-left',
  headerFontSize: 26,
};

export const DEFAULT_CTA_BUTTON: CtaButton = {
  show: false,
  text: 'Comenta FLUXO',
  fontSize: 16,
  borderRadius: 12,
  style: 'solid',
  position: 'bottom-center',
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  corners: DEFAULT_CORNERS,
  profileBadge: DEFAULT_PROFILE_BADGE,
  accentColor: '#00CFFF',
  fontPair: 'SF Pro Display + IvyOra Text',
  theme: 'dark',
  metaBar: { show: false, left: '', center: '', right: '' },
  format: '4:5',
};

export const DEFAULT_SLIDE: Omit<Slide, 'id' | 'position'> = {
  title: 'Título do slide',
  description: 'Descrição do slide aqui.',
  highlightWord: '',
  highlights: [],
  backgroundImageUrl: '',
  gridImageUrl: '',
  imageType: 'grid',
  // Fallback de decks antigos. Toda INSERÇÃO nova substitui pelo
  // DEFAULT_IMAGE_POSITION (cover/100) no caminho que recebeu a imagem.
  imagePosition: { x: 50, y: 50, zoom: 175 },
  shadow: { style: 'base', opacity: 88 },
  backgroundColor: '#111111',
  textPosition: 'bottom-left',
  fontSize: { title: 70, description: 36 },
  lineHeight: 1.2,
  subtitle: '',
  textOffset: undefined,
  textAlignment: 'left',
  ctaButton: { ...DEFAULT_CTA_BUTTON },
};
