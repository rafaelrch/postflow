import {
  useCallback,
  useRef,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { ArrowLeftEndOnRectangleIcon as RawArrowLeftEndOnRectangleIcon } from '@heroicons-animated/react/arrow-left-end-on-rectangle';
import { ArchiveBoxArrowDownIcon as RawArchiveBoxArrowDownIcon } from '@heroicons-animated/react/archive-box-arrow-down';
import { ArrowDownTrayIcon as RawArrowDownTrayIcon } from '@heroicons-animated/react/arrow-down-tray';
import { BookmarkSquareIcon as RawBookmarkSquareIcon } from '@heroicons-animated/react/bookmark-square';
import { CalendarDateRangeIcon as RawCalendarDateRangeIcon } from '@heroicons-animated/react/calendar-date-range';
import { CalendarDaysIcon as RawCalendarDaysIcon } from '@heroicons-animated/react/calendar-days';
import { Cog6ToothIcon as RawCog6ToothIcon } from '@heroicons-animated/react/cog-6-tooth';
import { MapIcon as RawMapIcon } from '@heroicons-animated/react/map';
import { MoonIcon as RawMoonIcon } from '@heroicons-animated/react/moon';
import { NewspaperIcon as RawNewspaperIcon } from '@heroicons-animated/react/newspaper';
import { PlusIcon as RawPlusIcon } from '@heroicons-animated/react/plus';
import { PlusCircleIcon as RawPlusCircleIcon } from '@heroicons-animated/react/plus-circle';
import { Squares2X2Icon as RawSquares2X2Icon } from '@heroicons-animated/react/squares-2x2';
import { SunIcon as RawSunIcon } from '@heroicons-animated/react/sun';
import { SwatchIcon as RawSwatchIcon } from '@heroicons-animated/react/swatch';
import { TrashIcon as RawTrashIcon } from '@heroicons-animated/react/trash';

export interface AnimatedHeroiconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export type AnimatedHeroiconProps = HTMLAttributes<HTMLDivElement> & { size?: number };

export type AnimatedHeroiconComponent = (
  props: AnimatedHeroiconProps & { ref?: Ref<AnimatedHeroiconHandle> },
) => ReactNode;

export interface NativeHoverAnimation {
  iconRef: RefObject<AnimatedHeroiconHandle | null>;
  onMouseEnter: MouseEventHandler<HTMLElement>;
  onMouseLeave: MouseEventHandler<HTMLElement>;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Connects a semantic mouse target to the icon's native imperative API. */
export function useNativeHoverAnimation(enabled = true): NativeHoverAnimation {
  const iconRef = useRef<AnimatedHeroiconHandle | null>(null);

  const onMouseEnter = useCallback<MouseEventHandler<HTMLElement>>(() => {
    if (!enabled || prefersReducedMotion()) {
      iconRef.current?.stopAnimation();
      return;
    }
    iconRef.current?.startAnimation();
  }, [enabled]);

  const onMouseLeave = useCallback<MouseEventHandler<HTMLElement>>(() => {
    iconRef.current?.stopAnimation();
  }, []);

  return { iconRef, onMouseEnter, onMouseLeave };
}

export const ArchiveBoxArrowDownIcon = RawArchiveBoxArrowDownIcon;
export const ArrowDownTrayIcon = RawArrowDownTrayIcon;
export const ArrowLeftEndOnRectangleIcon = RawArrowLeftEndOnRectangleIcon;
export const BookmarkSquareIcon = RawBookmarkSquareIcon;
export const CalendarDateRangeIcon = RawCalendarDateRangeIcon;
export const CalendarDaysIcon = RawCalendarDaysIcon;
export const Cog6ToothIcon = RawCog6ToothIcon;
export const MapIcon = RawMapIcon;
export const MoonIcon = RawMoonIcon;
export const NewspaperIcon = RawNewspaperIcon;
export const PlusIcon = RawPlusIcon;
export const PlusCircleIcon = RawPlusCircleIcon;
export const Squares2X2Icon = RawSquares2X2Icon;
export const SunIcon = RawSunIcon;
export const SwatchIcon = RawSwatchIcon;
export const TrashIcon = RawTrashIcon;

export const Squares2x2 = Squares2X2Icon;
export const Newspaper = NewspaperIcon;
export const CalendarDays = CalendarDaysIcon;
export const Cog6Tooth = Cog6ToothIcon;
export const Map = MapIcon;
export const ArrowLeftOnRectangle = ArrowLeftEndOnRectangleIcon;
export const ArchiveBoxArrowDown = ArchiveBoxArrowDownIcon;
export const ArrowDownTray = ArrowDownTrayIcon;
export const BookmarkSquare = BookmarkSquareIcon;
export const CalendarDateRange = CalendarDateRangeIcon;
export const Moon = MoonIcon;
export const Sun = SunIcon;
export const Plus = PlusIcon;
export const PlusCircle = PlusCircleIcon;
export const Swatch = SwatchIcon;
export const Trash = TrashIcon;
