import { describe, expect, it } from 'vitest';
import { duplicateCarouselPayload, duplicateSlidesPayload } from '@/lib/carousel-duplicate';

describe('duplicação de carrossel', () => {
  it('copia conteúdo e estilo sem copiar identidade nem datas do carrossel', () => {
    const payload = duplicateCarouselPayload({
      id: 'original',
      user_id: 'u1',
      title: 'Meu carrossel',
      style: 'template02',
      corners: { show: true },
      global_settings: { format: '4:5' },
      caption: 'Legenda',
      hashtags: ['teste'],
      created_at: 'ontem',
      updated_at: 'hoje',
    });

    expect(payload).toMatchObject({
      title: 'Meu carrossel (cópia)',
      status: 'draft',
      style: 'template02',
      corners: { show: true },
      global_settings: { format: '4:5' },
      caption: 'Legenda',
      hashtags: ['teste'],
    });
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('created_at');
    expect(payload).not.toHaveProperty('updated_at');
  });

  it('remove a chave id dos slides para o banco gerar UUIDs novos', () => {
    const payload = duplicateSlidesPayload([
      {
        id: 'slide-original',
        carousel_id: 'carousel-original',
        position: 0,
        title: 'Título',
        template_slots: { 'cover.headline': 'Conteúdo' },
        template_slot_styles: { 'header.category': { margin: 24 } },
        metadata: { origem: 'teste' },
        created_at: 'ontem',
        updated_at: 'hoje',
      },
    ], 'carousel-copia');

    expect(payload).toEqual([{
      carousel_id: 'carousel-copia',
      position: 0,
      title: 'Título',
      template_slots: { 'cover.headline': 'Conteúdo' },
      template_slot_styles: { 'header.category': { margin: 24 } },
      metadata: { origem: 'teste' },
    }]);
    expect(Object.hasOwn(payload[0], 'id')).toBe(false);
  });
});
