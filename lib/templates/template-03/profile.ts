import { Slide } from '@/types';
import { template03AvatarSlot, template03SpecNode, template03SpecSlideOf } from './index';
import type { Template03Node } from './index';

export interface Template03ProfilePart {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Template03ProfileGeometry {
  avatar: Template03ProfilePart;
  handle: Template03ProfilePart;
  badge: Template03ProfilePart;
  group: {
    alignment: Template03ProfileAlignment;
    originX: number;
    originY: number;
    scale: number;
  };
}

export type Template03ProfileAlignment = 'left' | 'right';

interface Template03ProfileBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Template03ProfileStyle {
  /** Escala do grupo inteiro, em percentagem. */
  profileScale?: number;
  /** Zoom do recorte da foto, em percentagem. */
  avatarZoom?: number;
  /** Posição horizontal do recorte, em percentagem. */
  avatarPositionX?: number;
  /** Posição vertical do recorte, em percentagem. */
  avatarPositionY?: number;
}

export const TEMPLATE_03_PROFILE_DEFAULTS = {
  profileScale: 100,
  avatarZoom: 100,
  avatarPositionX: 50,
  avatarPositionY: 50,
} as const;

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * A barra guarda os quatro valores no estilo do slot de avatar do MODELO.
 * Ausência continua significando o desenho original do spec.
 */
export function template03ProfileStyleFor(
  slide: Pick<Slide, 'templateSlotStyles'> | null | undefined,
  model: number
): Required<Template03ProfileStyle> {
  const raw = slide?.templateSlotStyles?.[template03AvatarSlot(model)] as
    | Template03ProfileStyle
    | undefined;
  return {
    profileScale: clamp(raw?.profileScale, 80, 140, TEMPLATE_03_PROFILE_DEFAULTS.profileScale),
    avatarZoom: clamp(raw?.avatarZoom, 100, 250, TEMPLATE_03_PROFILE_DEFAULTS.avatarZoom),
    avatarPositionX: clamp(raw?.avatarPositionX, 0, 100, TEMPLATE_03_PROFILE_DEFAULTS.avatarPositionX),
    avatarPositionY: clamp(raw?.avatarPositionY, 0, 100, TEMPLATE_03_PROFILE_DEFAULTS.avatarPositionY),
  };
}

/** Aplica os controles T3 no slot persistido do avatar do MODELO. */
export function template03ApplyProfileStyle(
  slide: Pick<Slide, 'templateSlotStyles'>,
  model: number,
  patch: Template03ProfileStyle
): Pick<Slide, 'templateSlotStyles'> {
  const slot = template03AvatarSlot(model);
  return {
    templateSlotStyles: {
      ...(slide.templateSlotStyles ?? {}),
      [slot]: {
        ...(slide.templateSlotStyles?.[slot] ?? {}),
        ...patch,
      },
    },
  };
}

function part(node: Template03Node, top: number): Template03ProfilePart {
  return {
    left: node.box.x,
    top,
    width: node.box.w,
    height: node.box.h,
  };
}

/**
 * A origem vem da constraint do Group 6 no spec, não de um controle salvo.
 * O material hoje é LEFT; manter RIGHT aqui preserva o contrato caso um modelo
 * futuro do mesmo template venha ancorado na borda oposta.
 */
export function template03ProfileAlignmentFor(model: number): Template03ProfileAlignment {
  const slide = template03SpecSlideOf(model);
  const group = slide.nodes.find(
    (node) => node.name === 'Group 6' && node.slot === `s${slide.index}.Group 6`
  );
  return group?.constraints?.horizontal.toLowerCase() === 'right' ? 'right' : 'left';
}

/** Origem da escala conjunta: a borda de ancoragem do grupo, não seu centro. */
export function template03ProfileScaleOrigin(
  bounds: Template03ProfileBounds,
  alignment: Template03ProfileAlignment
): { originX: number; originY: number } {
  return {
    originX: alignment === 'right' ? bounds.right : bounds.left,
    originY: (bounds.top + bounds.bottom) / 2,
  };
}

/**
 * Geometria única da Barra de perfil.
 *
 * O spec é a régua default: avatar, @ e selo verificado são derivados no mesmo
 * passo e sobem/desce junto do bloco de conteúdo. A escala do grupo, quando
 * existe, é aplicada no wrapper único da barra; o crop fica somente na foto.
 */
export function template03ProfileGeometry(
  model: number,
  blockTop: number,
  style: Pick<Template03ProfileStyle, 'profileScale'> = {}
): Template03ProfileGeometry {
  const title = template03SpecNode(`s${model}.title`, model)!;
  const handle = template03SpecNode(`s${model}.handle`, model)!;
  const avatar = template03SpecNode(`s${model}.avatar`, model)!;
  const badge = template03SpecNode(`s${model}.badge`, model)!;
  const above = (node: Template03Node) => blockTop - (title.box.y - node.box.y);

  const parts = {
    avatar: part(avatar, above(avatar)),
    handle: part(handle, above(handle)),
    badge: part(badge, above(badge)),
  };
  const all = Object.values(parts);
  const left = Math.min(...all.map((item) => item.left));
  const right = Math.max(...all.map((item) => item.left + item.width));
  const top = Math.min(...all.map((item) => item.top));
  const bottom = Math.max(...all.map((item) => item.top + item.height));

  const alignment = template03ProfileAlignmentFor(model);
  const origin = template03ProfileScaleOrigin(
    { left, right, top, bottom },
    alignment
  );

  return {
    ...parts,
    group: {
      alignment,
      ...origin,
      scale: clamp(style.profileScale, 80, 140, TEMPLATE_03_PROFILE_DEFAULTS.profileScale) / 100,
    },
  };
}
