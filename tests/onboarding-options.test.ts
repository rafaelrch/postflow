import { describe, expect, it } from 'vitest';
import {
  parseProfessionalProfiles,
  parseReferralSource,
  parseSelectedChannels,
  serializeProfessionalProfiles,
} from '@/lib/onboarding-options';

describe('opções compatíveis do onboarding', () => {
  it('normaliza perfil profissional legado e mantém somente as três opções', () => {
    expect(parseProfessionalProfiles('Agência')).toEqual(['agency']);
    expect(parseProfessionalProfiles('Agência, social media, creator')).toEqual([
      'agency',
      'social_media',
      'creator',
    ]);
    expect(serializeProfessionalProfiles(['creator', 'agency'])).toBe('agency,creator');
    expect(parseProfessionalProfiles('consultor')).toEqual([]);
  });

  it('lê canais legados pelos handles independentes sem misturá-los', () => {
    expect(parseSelectedChannels(undefined, {
      instagram_carousel: '@carrossel',
      instagram_news: '',
      twitter: '@x',
    })).toEqual(['instagram_carousel', 'twitter']);
    expect(parseSelectedChannels(['instagram_news'], {
      instagram_carousel: '@carrossel',
      instagram_news: '@noticias',
      twitter: '@x',
    })).toEqual(['instagram_news']);
  });

  it('normaliza rótulos do referral e aceita ausência de resposta', () => {
    expect(parseReferralSource('Twitter/X')).toBe('twitter_x');
    expect(parseReferralSource('Pesquisa no Google')).toBe('google_search');
    expect(parseReferralSource(null)).toBeNull();
    expect(parseReferralSource('')).toBeNull();
  });
});
