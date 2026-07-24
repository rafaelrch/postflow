import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { v4 as uuidv4 } from 'uuid';
import { Slide, DEFAULT_SLIDE, ElementFont } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return uuidv4();
}

// Twitter/X handle sempre exibido com "@", independente de como o usuário digitou.
export function normalizeHandle(handle: string | undefined): string {
  const h = (handle || '').trim();
  if (!h) return '';
  return h.startsWith('@') ? h : `@${h}`;
}

export function createEmptySlide(position: number): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: generateId(),
    position,
    ctaButton: { ...DEFAULT_SLIDE.ctaButton },
  };
}

export function createDeterministicSlide(position: number, id = 'initial-slide'): Slide {
  return {
    ...DEFAULT_SLIDE,
    id,
    position,
    ctaButton: { ...DEFAULT_SLIDE.ctaButton },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Degradê multi-stop do overlay de sombra (mesma fórmula dos cards de notícias).
 * Compartilhado entre MinimalistSlide e EditorialSlide para o preview e o export
 * renderizarem o mesmo resultado.
 */
export function getShadowOverlayGradient(opacity: number, color?: string, size?: number, distance?: number): string {
  const h = (color || '#000000').replace('#', '');
  const rgb = `${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)}`;
  const op = opacity / 100;
  const sz = size ?? 85;
  const dist = distance ?? 55;
  return `linear-gradient(
    to top,
    rgba(${rgb},${op}) 0%,
    rgba(${rgb},${Math.min(op * 0.96, 1)}) ${Math.round(dist * 0.22)}%,
    rgba(${rgb},${Math.min(op * 0.85, 1)}) ${Math.round(dist * 0.45)}%,
    rgba(${rgb},${op * 0.57}) ${Math.round(dist * 0.73)}%,
    rgba(${rgb},${op * 0.26}) ${dist}%,
    rgba(${rgb},${op * 0.05}) ${Math.round((dist + sz) / 2)}%,
    transparent ${sz}%
  )`;
}

/**
 * Estilo de background para as imagens do slide (fundo full-bleed e imagem de
 * conteúdo). Centraliza o handling de object-fit + posição + zoom para preview e
 * export renderizarem igual.
 * - objectFit 'cover' ou ausente → preenche a moldura (pode cortar).
 * - objectFit 'contain' → encaixa a imagem inteira (pode sobrar espaço).
 * O zoom é uma escala relativa à base acima: 100 mantém o fit, 175 amplia 1,75x.
 * A moldura consumidora deve recortar esta camada com overflow hidden.
 */
export function getImageLayerStyle(
  pos?: { x?: number; y?: number; zoom?: number; objectFit?: 'cover' | 'contain' } | null
): React.CSSProperties {
  const x = pos?.x ?? 50;
  const y = pos?.y ?? 50;
  const zoom = pos?.zoom ?? 100;
  const fit = pos?.objectFit;
  return {
    backgroundSize: fit === 'contain' ? 'contain' : 'cover',
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: 'no-repeat',
    transform: `scale(${zoom / 100})`,
  };
}

export function getFontFamilies(fontPair: string): { title: string; body: string } {
  const SF = "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif";
  const IVY = "'IvyOra Text', 'Georgia', serif";
  const pairs: Record<string, { title: string; body: string }> = {
    // Originais
    'SF Pro Display + IvyOra Text': { title: SF, body: IVY },
    'Space Grotesk + Inter': { title: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif" },
    'Playfair Display + Lato': { title: "'Playfair Display', serif", body: "'Lato', sans-serif" },
    'Oswald + Roboto': { title: "'Oswald', sans-serif", body: "'Roboto', sans-serif" },
    'Montserrat + Open Sans': { title: "'Montserrat', sans-serif", body: "'Open Sans', sans-serif" },
    'Bebas Neue + Inter': { title: "'Bebas Neue', sans-serif", body: "'Inter', sans-serif" },
    'Syne + DM Sans': { title: "'Syne', sans-serif", body: "'DM Sans', sans-serif" },
    // Novos — editoriais
    'Anton + Lora': { title: "'Anton', sans-serif", body: "'Lora', serif" },
    'Barlow Condensed + Inter': { title: "'Barlow Condensed', sans-serif", body: "'Inter', sans-serif" },
    'Archivo Black + Poppins': { title: "'Archivo Black', sans-serif", body: "'Poppins', sans-serif" },
    'Cormorant Garamond + DM Sans': { title: "'Cormorant Garamond', serif", body: "'DM Sans', sans-serif" },
    'Poppins + Lora': { title: "'Poppins', sans-serif", body: "'Lora', serif" },
    'Raleway + Cormorant Garamond': { title: "'Raleway', sans-serif", body: "'Cormorant Garamond', serif" },
    'Fjalla One + Open Sans': { title: "'Fjalla One', sans-serif", body: "'Open Sans', sans-serif" },
  };
  return pairs[fontPair] ?? pairs['SF Pro Display + IvyOra Text'];
}

// URL única que carrega TODAS as fontes Google usadas no app
export const ALL_GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Barlow+Condensed:wght@700;800&family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&family=Fjalla+One&family=Inter:wght@400;700;900&family=Lato:wght@400;700&family=Lora:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@400;600;700;800&family=Open+Sans:wght@400;600&family=Oswald:wght@400;600;700&family=Playfair+Display:wght@400;700;900&family=Poppins:wght@400;600;700&family=Raleway:wght@700;800&family=Roboto:wght@400;500&family=Space+Grotesk:wght@400;500;700&family=Syne:wght@400;600;700;800&display=swap';

export function getFontGoogleUrl(fontPair: string): string {
  // Retorna a URL única com todas as fontes — ignora o par específico
  if (fontPair === 'SF Pro Display + IvyOra Text') return '';
  return ALL_GOOGLE_FONTS_URL;
}

export interface ElementFontCSS {
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
}

export function getElementFontCSS(font: ElementFont): ElementFontCSS {
  const SF    = "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif";
  const IVY   = "'IvyOra Text', 'Georgia', serif";
  const BEBAS = "'Bebas Neue', sans-serif";
  const MONT  = "'Montserrat', sans-serif";
  const ANTON = "'Anton', sans-serif";
  const ARCH  = "'Archivo Black', sans-serif";
  const BARLC = "'Barlow Condensed', sans-serif";
  const CORM  = "'Cormorant Garamond', serif";
  const DMSRF = "'DM Serif Display', serif";
  const FJAL  = "'Fjalla One', sans-serif";
  const INTER = "'Inter', sans-serif";
  const LORA  = "'Lora', serif";
  const OSWD  = "'Oswald', sans-serif";
  const PLAY  = "'Playfair Display', serif";
  const POPP  = "'Poppins', sans-serif";
  const RALE  = "'Raleway', sans-serif";

  switch (font) {
    // SF Pro Display
    case 'SF Pro Display Light':           return { fontFamily: SF,    fontWeight: 300, fontStyle: 'normal' };
    case 'SF Pro Display Regular':         return { fontFamily: SF,    fontWeight: 400, fontStyle: 'normal' };
    case 'SF Pro Display Medium':          return { fontFamily: SF,    fontWeight: 500, fontStyle: 'normal' };
    case 'SF Pro Display SemiBold':        return { fontFamily: SF,    fontWeight: 600, fontStyle: 'normal' };
    case 'SF Pro Display Bold':            return { fontFamily: SF,    fontWeight: 700, fontStyle: 'normal' };
    // IvyOra
    case 'IvyOra Text Medium':             return { fontFamily: IVY,   fontWeight: 500, fontStyle: 'normal' };
    case 'IvyOra Text Medium Italic':      return { fontFamily: IVY,   fontWeight: 500, fontStyle: 'italic' };
    // Display/Bold
    case 'Anton':                          return { fontFamily: ANTON, fontWeight: 400, fontStyle: 'normal' };
    case 'Archivo Black':                  return { fontFamily: ARCH,  fontWeight: 900, fontStyle: 'normal' };
    case 'Bebas Neue':                     return { fontFamily: BEBAS, fontWeight: 400, fontStyle: 'normal' };
    case 'Fjalla One':                     return { fontFamily: FJAL,  fontWeight: 400, fontStyle: 'normal' };
    case 'Oswald Bold':                    return { fontFamily: OSWD,  fontWeight: 700, fontStyle: 'normal' };
    case 'Oswald SemiBold':                return { fontFamily: OSWD,  fontWeight: 600, fontStyle: 'normal' };
    // Sans-serif
    case 'Montserrat':                     return { fontFamily: MONT,  fontWeight: 600, fontStyle: 'normal' };
    case 'Montserrat Bold':                return { fontFamily: MONT,  fontWeight: 700, fontStyle: 'normal' };
    case 'Montserrat ExtraBold':           return { fontFamily: MONT,  fontWeight: 800, fontStyle: 'normal' };
    case 'Poppins Regular':                return { fontFamily: POPP,  fontWeight: 400, fontStyle: 'normal' };
    case 'Poppins SemiBold':               return { fontFamily: POPP,  fontWeight: 600, fontStyle: 'normal' };
    case 'Poppins Bold':                   return { fontFamily: POPP,  fontWeight: 700, fontStyle: 'normal' };
    case 'Raleway Bold':                   return { fontFamily: RALE,  fontWeight: 700, fontStyle: 'normal' };
    case 'Raleway ExtraBold':              return { fontFamily: RALE,  fontWeight: 800, fontStyle: 'normal' };
    case 'Inter Regular':                  return { fontFamily: INTER, fontWeight: 400, fontStyle: 'normal' };
    case 'Inter Bold':                     return { fontFamily: INTER, fontWeight: 700, fontStyle: 'normal' };
    case 'Inter Black':                    return { fontFamily: INTER, fontWeight: 900, fontStyle: 'normal' };
    case 'Barlow Condensed Bold':          return { fontFamily: BARLC, fontWeight: 700, fontStyle: 'normal' };
    case 'Barlow Condensed ExtraBold':     return { fontFamily: BARLC, fontWeight: 800, fontStyle: 'normal' };
    // Serif
    case 'Playfair Display Bold':          return { fontFamily: PLAY,  fontWeight: 700, fontStyle: 'normal' };
    case 'Playfair Display ExtraBold':     return { fontFamily: PLAY,  fontWeight: 900, fontStyle: 'normal' };
    case 'Cormorant Garamond Regular':     return { fontFamily: CORM,  fontWeight: 400, fontStyle: 'normal' };
    case 'Cormorant Garamond SemiBold':    return { fontFamily: CORM,  fontWeight: 600, fontStyle: 'normal' };
    case 'Cormorant Garamond Bold':        return { fontFamily: CORM,  fontWeight: 700, fontStyle: 'normal' };
    case 'Lora Regular':                   return { fontFamily: LORA,  fontWeight: 400, fontStyle: 'normal' };
    case 'Lora Bold':                      return { fontFamily: LORA,  fontWeight: 700, fontStyle: 'normal' };
    case 'DM Serif Display':               return { fontFamily: DMSRF, fontWeight: 400, fontStyle: 'normal' };
  }
}

export function highlightWord(text: string, word: string, color: string): string {
  if (!word || !text) return text;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(
    new RegExp(`(${escaped})`, 'gi'),
    `<span style="color:${color}">$1</span>`
  );
}

export function textPositionToStyle(position: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    'top-left': { top: 0, left: 0, alignItems: 'flex-start', justifyContent: 'flex-start' },
    'top-center': { top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-start' },
    'top-right': { top: 0, right: 0, alignItems: 'flex-end', justifyContent: 'flex-start' },
    'middle-left': { top: '50%', left: 0, transform: 'translateY(-50%)', alignItems: 'flex-start' },
    center: { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', alignItems: 'center' },
    'middle-right': { top: '50%', right: 0, transform: 'translateY(-50%)', alignItems: 'flex-end' },
    'bottom-left': { bottom: 0, left: 0, alignItems: 'flex-start', justifyContent: 'flex-end' },
    'bottom-center': { bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-end' },
    'bottom-right': { bottom: 0, right: 0, alignItems: 'flex-end', justifyContent: 'flex-end' },
  };
  return map[position] ?? map['bottom-left'];
}
