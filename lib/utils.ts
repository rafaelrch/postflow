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
  'https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Barlow+Condensed:wght@700;800&family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&family=Fjalla+One&family=Inter:wght@300;400;500;600;700;900&family=Lato:wght@400;700&family=Lora:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@400;600;700;800&family=Open+Sans:wght@400;600&family=Oswald:wght@400;600;700&family=Playfair+Display:wght@400;700;900&family=Poppins:wght@400;600;700&family=Raleway:wght@700;800&family=Roboto:wght@400;500&family=Space+Grotesk:wght@400;500;700&family=Syne:wght@400;600;700;800&display=swap';

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
  const INTER_DISPLAY = "'T01InterDisplay', 'Inter', sans-serif";
  // IvyOra Text vem do projeto web do Adobe Fonts como `ivyora-text`. O
  // Cormorant fica de rede — antes o plano B era Georgia, e como a IvyOra nunca
  // resolvia (licença desktop não chega ao navegador), escolher "IvyOra Text"
  // no seletor entregava Georgia enquanto o spec do Template 1 entregava
  // Cormorant: duas serifadas diferentes no mesmo slide.
  const IVY   = "'ivyora-text', 'T01Serif', serif";
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
  const SPACE = "'Space Grotesk', sans-serif";
  const LATO  = "'Lato', sans-serif";
  const ROBOT = "'Roboto', sans-serif";
  const OPEN  = "'Open Sans', sans-serif";
  const SYNE  = "'Syne', sans-serif";
  const DMSAN = "'DM Sans', sans-serif";

  switch (font) {
    // SF Pro Display
    case 'SF Pro Display Light':           return { fontFamily: SF,    fontWeight: 300, fontStyle: 'normal' };
    case 'SF Pro Display Regular':         return { fontFamily: SF,    fontWeight: 400, fontStyle: 'normal' };
    case 'SF Pro Display Medium':          return { fontFamily: SF,    fontWeight: 500, fontStyle: 'normal' };
    case 'SF Pro Display SemiBold':        return { fontFamily: SF,    fontWeight: 600, fontStyle: 'normal' };
    case 'SF Pro Display Bold':            return { fontFamily: SF,    fontWeight: 700, fontStyle: 'normal' };
    // Inter Display
    case 'Inter Display Light':            return { fontFamily: INTER_DISPLAY, fontWeight: 300, fontStyle: 'normal' };
    case 'Inter Display Regular':          return { fontFamily: INTER_DISPLAY, fontWeight: 400, fontStyle: 'normal' };
    case 'Inter Display Medium':           return { fontFamily: INTER_DISPLAY, fontWeight: 500, fontStyle: 'normal' };
    case 'Inter Display Bold':             return { fontFamily: INTER_DISPLAY, fontWeight: 700, fontStyle: 'normal' };
    // IvyOra
    case 'IvyOra Text Medium':             return { fontFamily: IVY,   fontWeight: 500, fontStyle: 'normal' };
    case 'IvyOra Text Medium Italic':      return { fontFamily: IVY,   fontWeight: 500, fontStyle: 'italic' };
    // Display/Bold
    case 'Anton':                          return { fontFamily: ANTON, fontWeight: 400, fontStyle: 'normal' };
    case 'Archivo Black':                  return { fontFamily: ARCH,  fontWeight: 900, fontStyle: 'normal' };
    case 'Bebas Neue':                     return { fontFamily: BEBAS, fontWeight: 400, fontStyle: 'normal' };
    case 'Fjalla One':                     return { fontFamily: FJAL,  fontWeight: 400, fontStyle: 'normal' };
    case 'Oswald Regular':                 return { fontFamily: OSWD,  fontWeight: 400, fontStyle: 'normal' };
    case 'Oswald Bold':                    return { fontFamily: OSWD,  fontWeight: 700, fontStyle: 'normal' };
    case 'Oswald SemiBold':                return { fontFamily: OSWD,  fontWeight: 600, fontStyle: 'normal' };
    // Sans-serif
    case 'Montserrat':                     return { fontFamily: MONT,  fontWeight: 600, fontStyle: 'normal' };
    case 'Montserrat Regular':             return { fontFamily: MONT,  fontWeight: 400, fontStyle: 'normal' };
    case 'Montserrat Bold':                return { fontFamily: MONT,  fontWeight: 700, fontStyle: 'normal' };
    case 'Montserrat ExtraBold':           return { fontFamily: MONT,  fontWeight: 800, fontStyle: 'normal' };
    case 'Poppins Regular':                return { fontFamily: POPP,  fontWeight: 400, fontStyle: 'normal' };
    case 'Poppins SemiBold':               return { fontFamily: POPP,  fontWeight: 600, fontStyle: 'normal' };
    case 'Poppins Bold':                   return { fontFamily: POPP,  fontWeight: 700, fontStyle: 'normal' };
    case 'Raleway Bold':                   return { fontFamily: RALE,  fontWeight: 700, fontStyle: 'normal' };
    case 'Raleway ExtraBold':              return { fontFamily: RALE,  fontWeight: 800, fontStyle: 'normal' };
    case 'Inter Light':                    return { fontFamily: INTER, fontWeight: 300, fontStyle: 'normal' };
    case 'Inter Regular':                  return { fontFamily: INTER, fontWeight: 400, fontStyle: 'normal' };
    case 'Inter Medium':                   return { fontFamily: INTER, fontWeight: 500, fontStyle: 'normal' };
    case 'Inter SemiBold':                 return { fontFamily: INTER, fontWeight: 600, fontStyle: 'normal' };
    case 'Inter Bold':                     return { fontFamily: INTER, fontWeight: 700, fontStyle: 'normal' };
    case 'Inter Black':                    return { fontFamily: INTER, fontWeight: 900, fontStyle: 'normal' };
    case 'Barlow Condensed Bold':          return { fontFamily: BARLC, fontWeight: 700, fontStyle: 'normal' };
    case 'Barlow Condensed ExtraBold':     return { fontFamily: BARLC, fontWeight: 800, fontStyle: 'normal' };
    // Serif
    case 'Playfair Display Regular':       return { fontFamily: PLAY,  fontWeight: 400, fontStyle: 'normal' };
    case 'Playfair Display Bold':          return { fontFamily: PLAY,  fontWeight: 700, fontStyle: 'normal' };
    case 'Playfair Display ExtraBold':     return { fontFamily: PLAY,  fontWeight: 900, fontStyle: 'normal' };
    case 'Cormorant Garamond Regular':     return { fontFamily: CORM,  fontWeight: 400, fontStyle: 'normal' };
    case 'Cormorant Garamond SemiBold':    return { fontFamily: CORM,  fontWeight: 600, fontStyle: 'normal' };
    case 'Cormorant Garamond Bold':        return { fontFamily: CORM,  fontWeight: 700, fontStyle: 'normal' };
    case 'Lora Regular':                   return { fontFamily: LORA,  fontWeight: 400, fontStyle: 'normal' };
    case 'Lora Bold':                      return { fontFamily: LORA,  fontWeight: 700, fontStyle: 'normal' };
    case 'DM Serif Display':               return { fontFamily: DMSRF, fontWeight: 400, fontStyle: 'normal' };
    // Famílias usadas nos pares globais
    case 'Space Grotesk Regular':          return { fontFamily: SPACE, fontWeight: 400, fontStyle: 'normal' };
    case 'Space Grotesk Medium':           return { fontFamily: SPACE, fontWeight: 500, fontStyle: 'normal' };
    case 'Space Grotesk Bold':             return { fontFamily: SPACE, fontWeight: 700, fontStyle: 'normal' };
    case 'Lato Regular':                   return { fontFamily: LATO,  fontWeight: 400, fontStyle: 'normal' };
    case 'Lato Bold':                      return { fontFamily: LATO,  fontWeight: 700, fontStyle: 'normal' };
    case 'Roboto Regular':                 return { fontFamily: ROBOT, fontWeight: 400, fontStyle: 'normal' };
    case 'Roboto Medium':                  return { fontFamily: ROBOT, fontWeight: 500, fontStyle: 'normal' };
    case 'Open Sans Regular':              return { fontFamily: OPEN,  fontWeight: 400, fontStyle: 'normal' };
    case 'Open Sans SemiBold':             return { fontFamily: OPEN,  fontWeight: 600, fontStyle: 'normal' };
    case 'Syne Regular':                   return { fontFamily: SYNE,  fontWeight: 400, fontStyle: 'normal' };
    case 'Syne SemiBold':                  return { fontFamily: SYNE,  fontWeight: 600, fontStyle: 'normal' };
    case 'Syne Bold':                      return { fontFamily: SYNE,  fontWeight: 700, fontStyle: 'normal' };
    case 'Syne ExtraBold':                 return { fontFamily: SYNE,  fontWeight: 800, fontStyle: 'normal' };
    case 'DM Sans Regular':                return { fontFamily: DMSAN, fontWeight: 400, fontStyle: 'normal' };
    case 'DM Sans Medium':                 return { fontFamily: DMSAN, fontWeight: 500, fontStyle: 'normal' };
    case 'DM Sans Bold':                   return { fontFamily: DMSAN, fontWeight: 700, fontStyle: 'normal' };
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

/**
 * Deslocamento vertical de um canto quando o TAMANHO da fonte muda.
 *
 * Sem isto o bloco é ancorado pelo topo: aumentar a fonte empurra o texto só
 * para baixo, e ele parece "escorregar" para dentro do slide em vez de crescer.
 * Aqui o bloco cresce a partir do PRÓPRIO CENTRO — o centro fica fixo na linha
 * de referência do template — e o piso é a borda do slide.
 *
 * A primeira versão só fazia isso ENCOLHENDO (`margin + max(0, …)`), tratando a
 * margem como limite duro para cima. Nos TEMPLATES 1 e 2 isso deixou o tamanho
 * quebrado: a referência do spec é ~16,8 px e o slider vai a 64, então quase
 * toda a faixa útil caía na parte travada e o canto só descia. O Editorial
 * escondia o defeito porque a referência dele (27 px) fica no TOPO do slider
 * (máx. 32) — daí "no Editorial funciona perfeitamente".
 *
 * Devolve quanto somar ao topo, já contando a margem. NÃO trava em zero: no
 * Editorial `margin` é o topo absoluto (a distância às bordas), mas no T1/T2 é
 * um DELTA somado ao `y` do spec e vale 0 por padrão — travar aqui devolveria a
 * assimetria justamente nos dois templates quebrados. Quem tem o topo final na
 * mão é que o prende à borda do slide (`cornerTop`).
 */
export function cornerGrowthTop(margin: number, fontSize: number, refFontSize: number): number {
  return margin + (refFontSize - fontSize) / 2;
}

/** Topo final de um canto: o crescimento aplicado, sem sair do slide. */
export function cornerTop(base: number, growth: number): number {
  return Math.max(0, base + growth);
}
