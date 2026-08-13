/**
 * Geometria do recorte da foto de perfil — UMA fonte para prévia e exportação.
 *
 * Antes havia dois modelos: a prévia era CSS (`object-cover` + `transform:
 * scale() rotate()`) e a exportação desenhava num canvas 640×640 com aritmética
 * própria. Coincidiam por acaso enquanto só existiam zoom e rotação em torno do
 * centro. Com deslocamento (arrastar) qualquer divergência viraria "arrastei
 * aqui e saiu cortado diferente" — e o usuário culpa a si mesmo, não o produto.
 *
 * Agora os dois chamam `cropGeometry`/`drawCrop` com o MESMO estado; o único
 * parâmetro que muda é o lado do quadrado de destino (px da tela na prévia,
 * EXPORT_SIZE na exportação). Por isso o deslocamento é normalizado pelo lado
 * do quadrado: o mesmo estado enquadra igual em qualquer tamanho.
 *
 * Convenção: o quadrado de destino tem lado S e centro na origem. A imagem é
 * transladada por (offsetX·S, offsetY·S), girada por `rotation` e desenhada
 * centrada. Nessa ordem — o clamp abaixo depende dela.
 */

export type CropState = {
  /** 1 = imagem no tamanho mínimo que cobre o quadrado. Nunca menor. */
  zoom: number;
  /** Graus, horário. */
  rotation: number;
  /** Deslocamento do centro da imagem, em frações do lado do quadrado. */
  offsetX: number;
  offsetY: number;
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
/** Lado do JPEG gerado. A prévia usa outro lado e enquadra igual. */
export const EXPORT_SIZE = 640;

export const IDENTITY_CROP: CropState = { zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 };

const toRad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * |cos| + |sin| — meia-extensão (em lados do quadrado) da caixa alinhada aos
 * eixos que contém o quadrado girado por -θ. É o fator que diz o quanto a
 * imagem precisa crescer para continuar cobrindo o quadrado depois de girar.
 * Vale 1 sem rotação e √2 a 45°.
 */
function coverFactor(rotation: number): number {
  const t = toRad(rotation);
  return Math.abs(Math.cos(t)) + Math.abs(Math.sin(t));
}

/**
 * Escala da imagem RELATIVA ao lado do quadrado (multiplique por S para obter
 * px). É o mínimo que cobre o quadrado — daí não haver como abrir buraco vazio
 * girando ou dando zoom: a cobertura é imposta pela própria escala base.
 */
export function coverScale(
  naturalWidth: number,
  naturalHeight: number,
  rotation: number,
  zoom: number,
): number {
  const shorter = Math.min(naturalWidth, naturalHeight);
  if (!(shorter > 0)) return 0;
  return (coverFactor(rotation) * Math.max(zoom, MIN_ZOOM)) / shorter;
}

/**
 * Limita o deslocamento ao que mantém o quadrado INTEIRO dentro da imagem.
 *
 * Trabalha no referencial da imagem (girado por -θ), onde a imagem é um
 * retângulo alinhado aos eixos: aí a condição "quadrado contido no retângulo"
 * vira comparação de caixas, exata porque o retângulo é alinhado e convexo.
 * O limite depende de zoom E rotação — é por isso que ele é recalculado a cada
 * mudança de qualquer um dos dois, e não só ao arrastar.
 */
export function clampOffset(
  state: CropState,
  naturalWidth: number,
  naturalHeight: number,
): { offsetX: number; offsetY: number } {
  const scale = coverScale(naturalWidth, naturalHeight, state.rotation, state.zoom);
  if (!(scale > 0)) return { offsetX: 0, offsetY: 0 };

  const k = coverFactor(state.rotation);
  // Folga em cada eixo LOCAL: metade da imagem menos metade da caixa do
  // quadrado girado. Zerado no eixo curto quando zoom = 1 (encaixe exato).
  const maxLocalX = Math.max(0, (naturalWidth * scale - k) / 2);
  const maxLocalY = Math.max(0, (naturalHeight * scale - k) / 2);

  const t = toRad(state.rotation);
  const cos = Math.cos(t);
  const sin = Math.sin(t);

  // Centro do quadrado visto do referencial da imagem: R(-θ)·(-d).
  const localX = -(state.offsetX * cos + state.offsetY * sin);
  const localY = -(-state.offsetX * sin + state.offsetY * cos);

  const cx = clamp(localX, -maxLocalX, maxLocalX);
  const cy = clamp(localY, -maxLocalY, maxLocalY);

  // De volta para a tela: d = -R(θ)·p.
  return {
    offsetX: -(cx * cos - cy * sin),
    offsetY: -(cx * sin + cy * cos),
  };
}

export type CropGeometry = {
  /** Rotação em radianos, para ctx.rotate. */
  rotationRad: number;
  /** Para onde levar a origem antes de girar (px do alvo). */
  translateX: number;
  translateY: number;
  /** Canto da imagem já no referencial girado (px do alvo). */
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
  /** O offset efetivamente usado — o de entrada já passado pelo clamp. */
  offsetX: number;
  offsetY: number;
};

/**
 * A geometria completa para um quadrado de lado `size`. Prévia e exportação
 * chamam esta função; nenhuma das duas recalcula nada por conta própria.
 */
export function cropGeometry(
  state: CropState,
  naturalWidth: number,
  naturalHeight: number,
  size: number,
): CropGeometry {
  const { offsetX, offsetY } = clampOffset(state, naturalWidth, naturalHeight);
  const scale = coverScale(naturalWidth, naturalHeight, state.rotation, state.zoom) * size;
  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;
  return {
    rotationRad: toRad(state.rotation),
    translateX: size / 2 + offsetX * size,
    translateY: size / 2 + offsetY * size,
    drawX: -drawWidth / 2,
    drawY: -drawHeight / 2,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
  };
}

/** Fonte de imagem que o canvas aceita e da qual dá para ler o tamanho natural. */
type DrawableImage = CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };

function naturalSizeOf(image: DrawableImage): { width: number; height: number } {
  return {
    width: image.naturalWidth ?? (typeof image.width === 'number' ? image.width : 0),
    height: image.naturalHeight ?? (typeof image.height === 'number' ? image.height : 0),
  };
}

/**
 * Desenha o recorte num quadrado de lado `size`. Usada pela prévia (a cada
 * quadro) e pela exportação (uma vez) — é o que garante que o que se vê é o
 * que sai.
 */
export function drawCrop(
  context: CanvasRenderingContext2D,
  image: DrawableImage,
  state: CropState,
  size: number,
): void {
  const { width, height } = naturalSizeOf(image);
  context.save();
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  if (width > 0 && height > 0) {
    const geometry = cropGeometry(state, width, height, size);
    context.translate(geometry.translateX, geometry.translateY);
    context.rotate(geometry.rotationRad);
    context.drawImage(image, geometry.drawX, geometry.drawY, geometry.drawWidth, geometry.drawHeight);
  }
  context.restore();
}

/**
 * Os quatro cantos do quadrado de destino no referencial da imagem, em
 * unidades de meia-imagem: |x| e |y| <= 1 significa canto dentro da imagem.
 * Existe para o teste do clamp poder afirmar "não há área vazia" olhando a
 * mesma geometria que desenha, em vez de reimplementá-la.
 */
export function targetCornersInImageSpace(
  state: CropState,
  naturalWidth: number,
  naturalHeight: number,
  size: number,
): { x: number; y: number }[] {
  const geometry = cropGeometry(state, naturalWidth, naturalHeight, size);
  const cos = Math.cos(-geometry.rotationRad);
  const sin = Math.sin(-geometry.rotationRad);
  const corners = [
    [0, 0],
    [size, 0],
    [0, size],
    [size, size],
  ];
  return corners.map(([x, y]) => {
    const dx = x - geometry.translateX;
    const dy = y - geometry.translateY;
    return {
      x: (dx * cos - dy * sin) / (geometry.drawWidth / 2),
      y: (dx * sin + dy * cos) / (geometry.drawHeight / 2),
    };
  });
}
