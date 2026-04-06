import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { v4 as uuidv4 } from 'uuid';
import { Slide, DEFAULT_SLIDE } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return uuidv4();
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

export function getFontFamilies(fontPair: string): { title: string; body: string } {
  const pairs: Record<string, { title: string; body: string }> = {
    // SF Pro Display é a fonte nativa da Apple (sistema). IvyOra Text via local()
    'SF Pro Display + IvyOra Text': {
      title: "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif",
      body: "'IvyOra Text', 'Georgia', serif",
    },
    'Space Grotesk + Inter': { title: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif" },
    'Playfair Display + Lato': { title: "'Playfair Display', serif", body: "'Lato', sans-serif" },
    'Oswald + Roboto': { title: "'Oswald', sans-serif", body: "'Roboto', sans-serif" },
    'Montserrat + Open Sans': { title: "'Montserrat', sans-serif", body: "'Open Sans', sans-serif" },
    'Bebas Neue + Inter': { title: "'Bebas Neue', sans-serif", body: "'Inter', sans-serif" },
    'Syne + DM Sans': { title: "'Syne', sans-serif", body: "'DM Sans', sans-serif" },
  };
  return pairs[fontPair] ?? pairs['SF Pro Display + IvyOra Text'];
}

export function getFontGoogleUrl(fontPair: string): string {
  // SF Pro Display + IvyOra: fontes do sistema/locais, sem Google Fonts
  const urls: Record<string, string> = {
    'SF Pro Display + IvyOra Text': '',
    'Space Grotesk + Inter':
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600&display=swap',
    'Playfair Display + Lato':
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lato:wght@400;700&display=swap',
    'Oswald + Roboto':
      'https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Roboto:wght@400;500&display=swap',
    'Montserrat + Open Sans':
      'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600&display=swap',
    'Bebas Neue + Inter':
      'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap',
    'Syne + DM Sans':
      'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@400;500;700&display=swap',
  };
  return urls[fontPair] ?? '';
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
