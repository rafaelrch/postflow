import { createAdminSupabaseClient } from './supabase-admin';

export const PRODUCT_EVENT_FEATURES = {
  session_started: 'session',
  onboarding_completed: 'onboarding',
  carousel_created: 'carousel',
  carousel_generated_with_ai: 'carousel',
  carousel_created_manually: 'carousel',
  carousel_imported_json: 'carousel',
  carousel_exported_single: 'carousel',
  carousel_exported_all: 'carousel',
  image_generation_succeeded: 'image',
  image_generation_failed: 'image',
  news_batch_created: 'news',
  schedule_created: 'schedule',
  checkout_started: 'checkout',
} as const;

export type ProductEventName = keyof typeof PRODUCT_EVENT_FEATURES;
type SafeValue = string | number | boolean;

const PROPERTY_KEYS = new Set([
  'model', 'generation_type', 'style', 'slide_count', 'language', 'credits',
  'duration_ms', 'error_code', 'input_tokens', 'output_tokens', 'quality',
  'export_format', 'item_count', 'source', 'schedule_type',
]);

export function validateProductEvent(input: unknown): {
  eventName: ProductEventName;
  feature: (typeof PRODUCT_EVENT_FEATURES)[ProductEventName];
  sessionId: string | null;
  properties: Record<string, SafeValue>;
} | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.eventName !== 'string' || !(raw.eventName in PRODUCT_EVENT_FEATURES)) return null;
  if (raw.sessionId != null && (typeof raw.sessionId !== 'string' || raw.sessionId.length < 1 || raw.sessionId.length > 100)) return null;
  if (raw.properties != null && (typeof raw.properties !== 'object' || Array.isArray(raw.properties))) return null;

  const properties: Record<string, SafeValue> = {};
  for (const [key, value] of Object.entries((raw.properties ?? {}) as Record<string, unknown>)) {
    if (!PROPERTY_KEYS.has(key)) return null;
    if (!['string', 'number', 'boolean'].includes(typeof value)) return null;
    if (typeof value === 'string' && value.length > 100) return null;
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 10_000_000)) return null;
    properties[key] = value as SafeValue;
  }
  if (JSON.stringify(properties).length > 1800) return null;
  const eventName = raw.eventName as ProductEventName;
  return { eventName, feature: PRODUCT_EVENT_FEATURES[eventName], sessionId: (raw.sessionId as string | undefined) ?? null, properties };
}

export async function recordProductEventBestEffort(
  userId: string,
  eventName: ProductEventName,
  properties: Record<string, SafeValue> = {},
  sessionId: string | null = null,
): Promise<void> {
  try {
    const validated = validateProductEvent({ eventName, properties, sessionId });
    if (!validated) throw new Error('invalid_product_event');
    const { error } = await createAdminSupabaseClient().from('product_events').insert({
      user_id: userId,
      event_name: validated.eventName,
      feature: validated.feature,
      session_id: validated.sessionId,
      properties: validated.properties,
    });
    if (error) throw error;
  } catch (error) {
    console.error('[product-events] non-blocking insert failed', error);
  }
}

export type AiGenerationRecord = {
  operationId: string;
  userId: string;
  feature: 'carousel' | 'image';
  status: 'succeeded' | 'failed';
  model: string;
  generationType?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  style?: string;
  language?: string;
  slideCount?: number;
  credits: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
};

export function normalizeGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : 'unknown';
  if (message.includes('rate limit') || message.includes('429')) return 'rate_limit';
  if (message.includes('billing') || message.includes('quota') || message.includes('insufficient')) return 'provider_billing';
  if (message.includes('verification') || message.includes('verified')) return 'provider_verification';
  if (message.includes('upload') || message.includes('bucket')) return 'storage';
  if (message.includes('parse') || message.includes('json')) return 'invalid_provider_response';
  return 'generation_failed';
}

export async function recordAiGenerationBestEffort(record: AiGenerationRecord): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from('ai_generation_events').insert({
      operation_id: record.operationId,
      user_id: record.userId,
      feature: record.feature,
      status: record.status,
      model: record.model,
      generation_type: record.generationType ?? null,
      quality: record.quality ?? null,
      style: record.style ?? null,
      language: record.language ?? null,
      slide_count: record.slideCount ?? null,
      credits: record.credits,
      duration_ms: Math.max(0, Math.round(record.durationMs)),
      input_tokens: record.inputTokens ?? null,
      output_tokens: record.outputTokens ?? null,
      error_code: record.errorCode ?? null,
    });
    if (error) throw error;
    await recordProductEventBestEffort(
      record.userId,
      record.feature === 'carousel'
        ? 'carousel_generated_with_ai'
        : record.status === 'succeeded' ? 'image_generation_succeeded' : 'image_generation_failed',
      {
        model: record.model,
        credits: record.credits,
        duration_ms: Math.max(0, Math.round(record.durationMs)),
        ...(record.errorCode ? { error_code: record.errorCode } : {}),
      },
    );
  } catch (error) {
    console.error('[ai-generation-events] non-blocking insert failed', error);
  }
}

export function trackProductEvent(eventName: ProductEventName, properties: Record<string, SafeValue> = {}): void {
  if (typeof window === 'undefined') return;
  void fetch('/api/product-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventName, properties, sessionId: window.sessionStorage.getItem('postflow-session-id') }),
    keepalive: true,
  }).catch(() => undefined);
}
