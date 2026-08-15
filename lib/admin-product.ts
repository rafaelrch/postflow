import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResolvedPeriod } from './admin-period';

export type ProductBlock<T> = { ok: true; value: T } | { ok: false };
export type CountPoint = { bucket: string; count: number };

export interface ProductActivity {
  collectedSince: string | null;
  dau: number;
  wau: number;
  mau: number;
  series: { bucket: string; users: number }[];
  existingCarousels: number;
  existingNews: number;
}

export interface ProductCreation {
  contentSeries: CountPoint[];
  carouselModes: { mode: string; count: number }[];
  exportsSingle: number;
  exportsAll: number;
  images: number;
  newsBatches: number;
  schedules: number;
  styles: { style: string; count: number }[];
  averageSlides: number | null;
}

export interface ProductFeatures {
  features: { feature: string; events: number; users: number }[];
  createdNeverExported: number;
  paidNeverCreated: number;
  reelsDisabled: boolean;
}

export interface ProductCreditsAi {
  creditsByFeature: { feature: string; credits: number }[];
  aiSucceeded: number;
  aiFailed: number;
  zeroCredits: number;
  models: { model: string; generations: number; inputTokens: number | null; outputTokens: number | null }[];
}

export interface AdminProduct {
  activity: ProductBlock<ProductActivity>;
  creation: ProductBlock<ProductCreation>;
  features: ProductBlock<ProductFeatures>;
  creditsAi: ProductBlock<ProductCreditsAi>;
}

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {};
const array = (value: unknown): Raw[] => Array.isArray(value) ? value.map(object) : [];
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullableNumber = (value: unknown) => value === null || value === undefined ? null : number(value);
const nullableString = (value: unknown) => typeof value === 'string' && value ? value : null;

export function parseProductBlock(block: string, value: unknown): ProductActivity | ProductCreation | ProductFeatures | ProductCreditsAi {
  const raw = object(value);
  if (block === 'activity') return {
    collectedSince: nullableString(raw.collected_since), dau: number(raw.dau), wau: number(raw.wau), mau: number(raw.mau),
    series: array(raw.series).map((x) => ({ bucket: String(x.bucket ?? ''), users: number(x.users) })),
    existingCarousels: number(raw.existing_carousels), existingNews: number(raw.existing_news),
  };
  if (block === 'creation') return {
    contentSeries: array(raw.content_series).map((x) => ({ bucket: String(x.bucket ?? ''), count: number(x.count) })),
    carouselModes: array(raw.carousel_modes).map((x) => ({ mode: String(x.mode ?? 'unknown'), count: number(x.count) })),
    exportsSingle: number(raw.exports_single), exportsAll: number(raw.exports_all), images: number(raw.images),
    newsBatches: number(raw.news_batches), schedules: number(raw.schedules),
    styles: array(raw.styles).map((x) => ({ style: String(x.style ?? 'Não identificado'), count: number(x.count) })),
    averageSlides: nullableNumber(raw.average_slides),
  };
  if (block === 'features') return {
    features: array(raw.features).map((x) => ({ feature: String(x.feature ?? ''), events: number(x.events), users: number(x.users) })),
    createdNeverExported: number(raw.created_never_exported), paidNeverCreated: number(raw.paid_never_created),
    reelsDisabled: raw.reels_disabled === true,
  };
  return {
    creditsByFeature: array(raw.credits_by_feature).map((x) => ({ feature: String(x.feature ?? ''), credits: number(x.credits) })),
    aiSucceeded: number(raw.ai_succeeded), aiFailed: number(raw.ai_failed), zeroCredits: number(raw.zero_credits),
    models: array(raw.models).map((x) => ({ model: String(x.model ?? ''), generations: number(x.generations), inputTokens: nullableNumber(x.input_tokens), outputTokens: nullableNumber(x.output_tokens) })),
  };
}

async function load<T>(admin: SupabaseClient, block: string, period: ResolvedPeriod): Promise<ProductBlock<T>> {
  try {
    const { data, error } = await admin.rpc('admin_product_metrics', { p_block: block, p_from: period.from, p_to: period.to });
    if (error) throw error;
    return { ok: true, value: parseProductBlock(block, data) as T };
  } catch (error) {
    console.error(`[admin-product] falha isolada em ${block}`, error);
    return { ok: false };
  }
}

export async function loadAdminProduct(admin: SupabaseClient, period: ResolvedPeriod): Promise<AdminProduct> {
  const [activity, creation, features, creditsAi] = await Promise.all([
    load<ProductActivity>(admin, 'activity', period),
    load<ProductCreation>(admin, 'creation', period),
    load<ProductFeatures>(admin, 'features', period),
    load<ProductCreditsAi>(admin, 'credits_ai', period),
  ]);
  return { activity, creation, features, creditsAi };
}
