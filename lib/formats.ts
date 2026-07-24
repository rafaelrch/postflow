import type { SlideFormat } from '@/types';

/**
 * Fonte ÚNICA de verdade dos formatos de slide.
 * Todo lugar que antes tinha 1080/1350 hardcoded passa a ler daqui.
 *
 * REGRA-CHAVE: os três formatos compartilham a LARGURA 1080 — só a ALTURA muda.
 * Assim a escala horizontal é idêntica em todos e o texto nunca deforma ao
 * trocar de formato (a única dimensão que varia é a vertical).
 */
export interface FormatDef {
  id: SlideFormat;
  label: string;
  /** Rótulo amigável do dropdown de formato (ex.: "Carrossel (4:5)"). */
  menuLabel: string;
  width: number;
  height: number;
  /** Proporção largura/altura (ex.: 0.8 para 4:5). */
  aspectRatio: number;
}

export const FORMATS: Record<SlideFormat, FormatDef> = {
  '4:5':  { id: '4:5',  label: '4:5 · Feed',     menuLabel: 'Carrossel (4:5)', width: 1080, height: 1350, aspectRatio: 4 / 5 },
  '1:1':  { id: '1:1',  label: '1:1 · Quadrado', menuLabel: 'Quadrado (1:1)',  width: 1080, height: 1080, aspectRatio: 1 },
  '9:16': { id: '9:16', label: '9:16 · Stories', menuLabel: 'Stories (9:16)',  width: 1080, height: 1920, aspectRatio: 9 / 16 },
};

/** Formato padrão/legado — projetos sem formato salvo assumem este. */
export const DEFAULT_FORMAT: SlideFormat = '4:5';

/** Ordem estável para renderizar o seletor. */
export const FORMAT_LIST: FormatDef[] = [FORMATS['4:5'], FORMATS['1:1'], FORMATS['9:16']];

/**
 * Resolve o formato ativo. Ausência/valor inválido cai no 4:5 (legado),
 * garantindo que carrosséis e projetos antigos não deformem nem percam conteúdo.
 */
export function getFormat(format?: SlideFormat | null): FormatDef {
  return (format && FORMATS[format]) || FORMATS[DEFAULT_FORMAT];
}
