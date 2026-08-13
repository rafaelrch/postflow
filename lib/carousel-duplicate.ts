type DbRow = Record<string, unknown>;

const CAROUSEL_CONTENT_COLUMNS = [
  'project_id',
  'template_id',
  'description',
  'style',
  'source_kind',
  'source_id',
  'theme',
  'font_pair',
  'accent_color',
  'corners',
  'profile_badge',
  'global_settings',
  'caption',
  'hashtags',
  'metadata',
] as const;

const GENERATED_SLIDE_COLUMNS = new Set(['id', 'carousel_id', 'created_at', 'updated_at']);

/** Campos do carrossel que formam uma cópia editável, sem identidade/datas. */
export function duplicateCarouselPayload(source: DbRow): DbRow {
  const payload: DbRow = {
    title: `${String(source.title || 'Novo Carrossel')} (cópia)`,
    status: 'draft',
  };

  for (const column of CAROUSEL_CONTENT_COLUMNS) {
    if (source[column] !== undefined) payload[column] = source[column];
  }

  return payload;
}

/**
 * Clona cada linha sem sequer enviar `id`: `id: undefined` ainda fazia o
 * PostgREST incluir a coluna no insert em lote, anulando o default UUID.
 */
export function duplicateSlidesPayload(slides: DbRow[], carouselId: string): DbRow[] {
  return slides.map((slide) => ({
    ...Object.fromEntries(
      Object.entries(slide).filter(([column]) => !GENERATED_SLIDE_COLUMNS.has(column))
    ),
    carousel_id: carouselId,
  }));
}
