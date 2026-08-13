/**
 * Geometria do card na faixa do editor.
 *
 * Era fit-to-height puro: `scale = alturaDisponível / altura do formato`. Sem
 * teto pela largura, o card só cabia porque a janela costuma ser mais larga que
 * alta — em janela estreita e alta (ou com a barra lateral mais larga) o card
 * passava da área e escapava horizontalmente, porque a largura dele é
 * consequência do scale, não uma restrição dele.
 *
 * Aqui a altura continua mandando; a largura só entra como TETO.
 */
export interface CanvasFit {
  /** Fator aplicado ao palco 1080×H do formato. */
  scale: number;
  /** Largura do card em px de tela. */
  cardW: number;
  /** Altura do card em px de tela. */
  cardH: number;
}

export function fitCard(
  availW: number,
  availH: number,
  format: { width: number; height: number }
): CanvasFit {
  // Antes da primeira medição do ResizeObserver as duas dimensões são 0 — o
  // 0.4 histórico continua sendo o palpite dessa janela de um frame.
  const byHeight = availH > 0 ? availH / format.height : 0.4;
  const byWidth = availW > 0 ? availW / format.width : byHeight;
  const scale = Math.min(byHeight, byWidth);
  return {
    scale,
    cardW: Math.round(format.width * scale),
    // Deriva do scale, não de `availH`: com o teto ativo a altura tem de
    // encolher junto, senão o card estica e deforma o preview.
    cardH: Math.round(format.height * scale),
  };
}
