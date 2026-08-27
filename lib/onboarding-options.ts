export const PROFESSIONAL_PROFILE_OPTIONS = [
  { value: 'agency', label: 'Agência' },
  { value: 'social_media', label: 'Social media' },
  { value: 'creator', label: 'Creator' },
] as const;

export type ProfessionalProfile = (typeof PROFESSIONAL_PROFILE_OPTIONS)[number]['value'];

export const CHANNEL_OPTIONS = [
  { value: 'instagram_carousel', label: 'Instagram de carrossel', handleLabel: '@ Instagram de carrossel' },
  { value: 'instagram_news', label: 'Instagram de notícias', handleLabel: '@ Instagram de notícias' },
  { value: 'twitter', label: 'Twitter/X', handleLabel: '@ Twitter / X' },
] as const;

export type OnboardingChannel = (typeof CHANNEL_OPTIONS)[number]['value'];

export const REFERRAL_OPTIONS = [
  { value: 'twitter_x', label: 'Twitter/X' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'google_search', label: 'Pesquisa no Google' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'hacker_news', label: 'Hacker News' },
] as const;

export type ReferralSource = (typeof REFERRAL_OPTIONS)[number]['value'];

const PROFESSIONAL_VALUES = new Set<string>(PROFESSIONAL_PROFILE_OPTIONS.map(({ value }) => value));
const CHANNEL_VALUES = new Set<string>(CHANNEL_OPTIONS.map(({ value }) => value));
const REFERRAL_VALUES = new Set<string>(REFERRAL_OPTIONS.map(({ value }) => value));

function fold(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function splitLegacy(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // O formato antigo era texto livre; continua aceitando separadores simples.
  }
  return trimmed.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
}

function professionalValue(value: string): ProfessionalProfile | null {
  const token = fold(value).replace(/[\s-]+/g, '_');
  if (PROFESSIONAL_VALUES.has(token)) return token as ProfessionalProfile;
  if (token.includes('agenc')) return 'agency';
  if (token.includes('social')) return 'social_media';
  if (token.includes('creator') || token.includes('criador')) return 'creator';
  return null;
}

export function parseProfessionalProfiles(value: unknown): ProfessionalProfile[] {
  const selected: ProfessionalProfile[] = [];
  for (const item of splitLegacy(value)) {
    const normalized = professionalValue(item);
    if (normalized && !selected.includes(normalized)) selected.push(normalized);
  }
  return PROFESSIONAL_PROFILE_OPTIONS.map(({ value: option }) => option).filter((option) => selected.includes(option));
}

export function serializeProfessionalProfiles(value: unknown): string {
  return parseProfessionalProfiles(value).join(',');
}

function channelValue(value: string): OnboardingChannel | null {
  const token = fold(value).replace(/[\s-]+/g, '_');
  if (CHANNEL_VALUES.has(token)) return token as OnboardingChannel;
  if (token.includes('carrossel') || token.includes('carousel')) return 'instagram_carousel';
  if (token.includes('notic')) return 'instagram_news';
  if (token.includes('twitter') || token === 'x') return 'twitter';
  return null;
}

export function parseSelectedChannels(
  value: unknown,
  handles: Partial<Record<OnboardingChannel, unknown>> = {}
): OnboardingChannel[] {
  const explicit = value !== undefined && value !== null;
  const selected: OnboardingChannel[] = [];
  for (const item of splitLegacy(value)) {
    const normalized = channelValue(item);
    if (normalized && !selected.includes(normalized)) selected.push(normalized);
  }
  if (!explicit) {
    if (typeof handles.instagram_carousel === 'string' && handles.instagram_carousel.trim()) selected.push('instagram_carousel');
    if (typeof handles.instagram_news === 'string' && handles.instagram_news.trim()) selected.push('instagram_news');
    if (typeof handles.twitter === 'string' && handles.twitter.trim()) selected.push('twitter');
  }
  return CHANNEL_OPTIONS.map(({ value: option }) => option).filter((option) => selected.includes(option));
}

export function serializeSelectedChannels(value: unknown): OnboardingChannel[] {
  return parseSelectedChannels(value);
}

export function parseReferralSource(value: unknown): ReferralSource | null {
  if (typeof value !== 'string') return null;
  const normalized = fold(value).replace(/[\s/-]+/g, '_');
  if (REFERRAL_VALUES.has(normalized)) return normalized as ReferralSource;
  if (normalized === 'twitter' || normalized === 'x' || normalized === 'twitter_x') return 'twitter_x';
  if (normalized === 'google' || normalized === 'google_search' || normalized === 'pesquisa_no_google') return 'google_search';
  if (normalized === 'hackernews' || normalized === 'hacker_news') return 'hacker_news';
  return null;
}

export function legacyChannelSelection(
  value: unknown,
  handles: Partial<Record<OnboardingChannel, unknown>>
) {
  return parseSelectedChannels(value, handles);
}
