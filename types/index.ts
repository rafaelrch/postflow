export type SlideStyle = 'minimalist' | 'profile' | 'editorial';
export type ContentLayout = 'cover' | 'text-image-text' | 'text-text-image' | 'image-text-text' | 'text-only';

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
  | 'IvyOra Text Medium'
  | 'IvyOra Text Medium Italic'
  | 'Bebas Neue'
  | 'Montserrat'
  | 'Anton'
  | 'Archivo Black'
  | 'Fjalla One'
  | 'Oswald Bold'
  | 'Oswald SemiBold'
  | 'Montserrat Bold'
  | 'Montserrat ExtraBold'
  | 'Poppins Regular'
  | 'Poppins SemiBold'
  | 'Poppins Bold'
  | 'Raleway Bold'
  | 'Raleway ExtraBold'
  | 'Inter Regular'
  | 'Inter Bold'
  | 'Inter Black'
  | 'Barlow Condensed Bold'
  | 'Barlow Condensed ExtraBold'
  | 'Playfair Display Bold'
  | 'Playfair Display ExtraBold'
  | 'Cormorant Garamond Regular'
  | 'Cormorant Garamond SemiBold'
  | 'Cormorant Garamond Bold'
  | 'Lora Regular'
  | 'Lora Bold'
  | 'DM Serif Display';
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
}

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
  borderRadius: number;
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
  size?: number;    // 0–100, controls how far the gradient extends (default 60)
}

export interface ProfileData {
  handle: string;
  name: string;
  photoUrl?: string;
  followers?: string;
}

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
  imageType: ImageType;
  imagePosition: ImagePosition;
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
  imageDirection?: string;
  fontPair: FontPair;
  accentColor?: string;
  referenceImageBase64?: string;
  profileData?: ProfileData;
  twitterFormat?: TwitterFormat;
}

export interface SlideAIData {
  id: number;
  title: string;
  description: string;
  highlightWord: string;
  imagePrompt: string;
  backgroundColor?: string;
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
  fontSize: 12,
  borderDistance: 24,
  opacity: 80,
  borderRadius: 6,
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
};

export const DEFAULT_SLIDE: Omit<Slide, 'id' | 'position'> = {
  title: 'Título do slide',
  description: 'Descrição do slide aqui.',
  highlightWord: '',
  highlights: [],
  backgroundImageUrl: '',
  gridImageUrl: '',
  imageType: 'grid',
  imagePosition: { x: 50, y: 50, zoom: 175 },
  shadow: { style: 'base', opacity: 88 },
  backgroundColor: '#111111',
  textPosition: 'bottom-left',
  fontSize: { title: 70, description: 30 },
  lineHeight: 1.2,
  subtitle: '',
  textOffset: undefined,
  textAlignment: 'left',
  ctaButton: { ...DEFAULT_CTA_BUTTON },
};
