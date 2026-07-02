import {
  Slide,
  GlobalSettings,
  ImageType,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CTA_BUTTON,
} from '@/types';

/**
 * Mapeamento único DB ↔ editor para slides e global settings.
 * Usado pelo autosave (escrita), pelo editor e pelo dashboard (leitura),
 * garantindo que TODOS os campos editáveis persistem — cores/fontes por
 * elemento, highlights, sombra custom, paddings e offsets editoriais.
 */

type DbRow = Record<string, unknown>;

export function mapDbSlideToSlide(sl: DbRow): Slide {
  return {
    id: sl.id as string,
    position: sl.position as number,
    title: (sl.title as string) || '',
    description: (sl.description as string) || '',
    subtitle: (sl.subtitle as string) || '',
    highlightWord: (sl.highlight_word as string) || '',
    highlights: (sl.highlights as Slide['highlights']) || [],
    backgroundImageUrl: (sl.background_image_url as string) || '',
    gridImageUrl: (sl.grid_image_url as string) || '',
    imageType: (sl.image_type as ImageType) || 'grid',
    imagePosition: (sl.image_position as Slide['imagePosition']) || { x: 50, y: 50, zoom: 175 },
    shadow: {
      style: ((sl.shadow_style as string) || 'base') as Slide['shadow']['style'],
      opacity: (sl.shadow_opacity as number) ?? 88,
      color: (sl.shadow_color as string) || undefined,
      size: (sl.shadow_size as number) ?? undefined,
    },
    backgroundColor: (sl.background_color as string) || '#111111',
    textPosition: ((sl.text_position as string) || 'bottom-left') as Slide['textPosition'],
    textOffset: (sl.text_offset as Slide['textOffset']) || undefined,
    textAlignment: ((sl.text_alignment as string) || 'left') as Slide['textAlignment'],
    fontSize: (sl.font_size as Slide['fontSize']) || { title: 70, description: 36 },
    lineHeight: (sl.line_height as number) || 1.2,
    ctaButton: (sl.cta_button as Slide['ctaButton']) || { ...DEFAULT_CTA_BUTTON },
    titleColor: (sl.title_color as string) || undefined,
    descriptionColor: (sl.description_color as string) || undefined,
    subtitleColor: (sl.subtitle_color as string) || undefined,
    titleFont: (sl.title_font as Slide['titleFont']) || undefined,
    descriptionFont: (sl.description_font as Slide['descriptionFont']) || undefined,
    subtitleFont: (sl.subtitle_font as Slide['subtitleFont']) || undefined,
    titleUnderline: (sl.title_underline as boolean) ?? undefined,
    descriptionUnderline: (sl.description_underline as boolean) ?? undefined,
    subtitleUnderline: (sl.subtitle_underline as boolean) ?? undefined,
    titleLetterSpacing: (sl.title_letter_spacing as number) ?? undefined,
    titleDescriptionGap: (sl.title_description_gap as number) ?? undefined,
    textPadding: (sl.text_padding as Slide['textPadding']) || undefined,
    contentLayout: (sl.content_layout as Slide['contentLayout']) || undefined,
    editorialTitleOffsetY: (sl.editorial_title_offset_y as number) ?? undefined,
    editorialDescOffsetY: (sl.editorial_desc_offset_y as number) ?? undefined,
    editorialImageOffsetY: (sl.editorial_image_offset_y as number) ?? undefined,
  };
}

export function mapSlideToDbRow(slide: Slide, carouselId: string, position: number): DbRow {
  return {
    carousel_id: carouselId,
    position,
    title: slide.title ?? '',
    description: slide.description ?? '',
    subtitle: slide.subtitle ?? '',
    highlight_word: slide.highlightWord ?? '',
    highlights: slide.highlights ?? [],
    background_image_url: slide.backgroundImageUrl ?? '',
    grid_image_url: slide.gridImageUrl ?? '',
    image_type: slide.imageType,
    image_position: slide.imagePosition,
    background_color: slide.backgroundColor,
    shadow_style: slide.shadow.style,
    shadow_opacity: slide.shadow.opacity,
    shadow_color: slide.shadow.color ?? null,
    shadow_size: slide.shadow.size ?? null,
    text_position: slide.textPosition,
    text_offset: slide.textOffset ?? null,
    text_alignment: slide.textAlignment ?? 'left',
    font_size: slide.fontSize,
    line_height: slide.lineHeight,
    cta_button: slide.ctaButton,
    title_color: slide.titleColor ?? null,
    description_color: slide.descriptionColor ?? null,
    subtitle_color: slide.subtitleColor ?? null,
    title_font: slide.titleFont ?? null,
    description_font: slide.descriptionFont ?? null,
    subtitle_font: slide.subtitleFont ?? null,
    title_underline: slide.titleUnderline ?? null,
    description_underline: slide.descriptionUnderline ?? null,
    subtitle_underline: slide.subtitleUnderline ?? null,
    title_letter_spacing: slide.titleLetterSpacing ?? null,
    title_description_gap: slide.titleDescriptionGap ?? null,
    text_padding: slide.textPadding ?? null,
    content_layout: slide.contentLayout ?? null,
    editorial_title_offset_y: slide.editorialTitleOffsetY ?? null,
    editorial_desc_offset_y: slide.editorialDescOffsetY ?? null,
    editorial_image_offset_y: slide.editorialImageOffsetY ?? null,
  };
}

export function mapDbCarouselToGlobalSettings(carousel: DbRow): GlobalSettings {
  const stored = (carousel.global_settings as Partial<GlobalSettings> | null) || {};
  return {
    theme: (carousel.theme as GlobalSettings['theme']) || 'dark',
    fontPair: (carousel.font_pair as GlobalSettings['fontPair']) || 'SF Pro Display + IvyOra Text',
    accentColor: (carousel.accent_color as string) || '#00CFFF',
    corners: (carousel.corners as GlobalSettings['corners']) || DEFAULT_GLOBAL_SETTINGS.corners,
    profileBadge: (carousel.profile_badge as GlobalSettings['profileBadge']) || DEFAULT_GLOBAL_SETTINGS.profileBadge,
    metaBar: stored.metaBar || DEFAULT_GLOBAL_SETTINGS.metaBar,
  };
}
