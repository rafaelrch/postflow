import { describe, it, expect, vi } from 'vitest';

// `lib/openai` cria o client no topo do módulo e exige chave. Aqui só nos
// interessam `buildImagePrompt` e `imageSizeForShape`, que são puros.
vi.mock('openai', () => ({ default: class { constructor() {} } }));

import { imageShape, imagePatch, imageDestination } from '@/hooks/useGenerateCarouselImages';
import { buildImagePrompt, imageSizeForShape } from '@/lib/openai';
import { DEFAULT_SLIDE, Slide } from '@/types';

/**
 * FORMATO DO DESTINO DA IMAGEM — pedido do Rafael.
 *
 * O defeito: a rota mandava `size: '1024x1536'` fixo e o prompt não dizia nada
 * sobre enquadramento. A capa full-bleed (1080x1350) e o bloco interno do
 * Template 2 (380x1089, quase 1:3) recebiam exatamente a mesma imagem — uma das
 * duas sempre chegava mal cortada.
 *
 * O que estes testes travam: `imageShape` deriva o formato do MODELO do slide,
 * igual `imagePatch` faz, e concorda com ele. Se alguém fizer o shape depender
 * de `index + 1` ou abrir uma segunda verdade sobre "onde a imagem vai", quebra
 * aqui.
 */

const slide = (extra: Partial<Slide> = {}): Slide => ({ ...DEFAULT_SLIDE, ...extra }) as Slide;

describe('imageShape', () => {
  it('T2: a capa (modelo 1) é full-bleed, o interno é bloco estreito', () => {
    expect(imageShape(slide(), 'template02', 0, 'background')).toBe('full-bleed');
    expect(imageShape(slide(), 'template02', 1, 'content')).toBe('inset-block');
  });

  it('T2: o `target` não manda — quem decide é o modelo do slide', () => {
    // Pedir 'content' na capa do T2 não a transforma em bloco: a imagem dela
    // continua indo para o fundo, e o formato tem de acompanhar.
    expect(imageShape(slide(), 'template02', 0, 'content')).toBe('full-bleed');
    expect(imageShape(slide(), 'template02', 1, 'background')).toBe('inset-block');
  });

  it('T1: modelo com imagem de fundo é full-bleed; modelo com bloco é inset', () => {
    // O modelo 1 do T1 é capa (fundo) e o 3 tem o retângulo de conteúdo.
    expect(imageShape(slide(), 'template01', 0, 'background')).toBe('full-bleed');
    expect(imageShape(slide(), 'template01', 2, 'content')).toBe('inset-block');
  });

  it('estilos sem modelo: aí sim o target decide', () => {
    expect(imageShape(slide(), 'editorial', 0, 'background')).toBe('full-bleed');
    expect(imageShape(slide(), 'editorial', 1, 'content')).toBe('inset-block');
    expect(imageShape(slide(), 'minimalist', 0, 'background')).toBe('full-bleed');
  });

  it('Perfil: grava no fundo, mas o formato é a caixa de mídia DEITADA', () => {
    // O `kind` do Perfil é 'background' porque é onde a imagem é GRAVADA
    // (`gridImageUrl`/`backgroundImageUrl`, que é o que o ProfileSlide lê).
    // O destino na tela, porém, não é fundo de slide: é a caixa de mídia do
    // post, 864x510. Enquanto isto devolvia 'full-bleed', a OpenAI recebia
    // pedido de retrato sangrado para uma caixa embutida horizontal.
    expect(imageShape(slide(), 'profile', 0, 'background')).toBe('inset-landscape');
    expect(imageDestination(slide(), 'profile', 0, 'background').kind).toBe('background');
    expect(imagePatch(slide(), 'profile', 0, 'background', 'u').backgroundImageUrl).toBe('u');
  });

  it('concorda com `imagePatch`: full-bleed grava fundo, inset grava conteúdo', () => {
    // A mesma pergunta ("onde a imagem vai?") não pode ter duas respostas.
    const fundo = imagePatch(slide(), 'minimalist', 0, 'background', 'u');
    expect(imageShape(slide(), 'minimalist', 0, 'background')).toBe('full-bleed');
    expect(fundo.backgroundImageUrl).toBe('u');

    const bloco = imagePatch(slide(), 'minimalist', 1, 'content', 'u');
    expect(imageShape(slide(), 'minimalist', 1, 'content')).toBe('inset-block');
    expect(bloco.contentImageUrl).toBe('u');
  });
});

describe('imageSizeForShape', () => {
  it('só devolve tamanho que o SDK aceita', () => {
    // openai@6.33.0: os modelos GPT de imagem aceitam 1024x1024, 1536x1024 e
    // 1024x1536, e nada mais. Não existe proporção mais estreita que o retrato
    // 2:3 — por isso os dois formatos EM PÉ caem nele, e quem adapta o
    // enquadramento entre os dois é o prompt.
    const aceitos = ['1024x1024', '1024x1536', '1536x1024'];
    expect(aceitos).toContain(imageSizeForShape('full-bleed'));
    expect(aceitos).toContain(imageSizeForShape('inset-block'));
    expect(aceitos).toContain(imageSizeForShape('inset-landscape'));
  });

  it('só o `inset-landscape` muda de tamanho: é o único destino deitado', () => {
    expect(imageSizeForShape('inset-landscape')).toBe('1536x1024');
    expect(imageSizeForShape('full-bleed')).toBe('1024x1536');
    expect(imageSizeForShape('inset-block')).toBe('1024x1536');
  });
});

describe('buildImagePrompt — direção de enquadramento', () => {
  it('full-bleed pede composição que aguenta corte e região CALMA — nunca vazia', () => {
    // 🔴 MUDOU NA FATIA 1 DA TASK 4. O nome antigo deste teste era "área calma
    // para o texto", e o prompt dizia "Leave a calm, low-detail area across the
    // lower half". O verbo "leave" é o defeito: o modelo entregava metade do
    // quadro lisa, e a foto chegava ao slide já pela metade. A decisão de fundo
    // NÃO mudou — a região onde a tipografia entra continua tendo de ser mais
    // calma, porque o texto do slide é desenhado por cima. O que mudou é que
    // calma passou a significar MENOS INTERFERÊNCIA, não ausência de cena.
    const p = buildImagePrompt({ title: 'Tema', shape: 'full-bleed' });
    expect(p).toMatch(/full-bleed/i);
    expect(p).toMatch(/crop/i);
    // Metade 1: a região da tipografia é mais calma.
    expect(p).toMatch(/typography/i);
    expect(p).toMatch(/calmer/i);
    // Metade 2: e continua sendo cena fotografada.
    expect(p).toMatch(/still contain/i);
    expect(p).toMatch(/environment, texture, light, atmosphere and depth/i);
    // E o quadro inteiro é preenchido de propósito.
    expect(p).toMatch(/fill the entire photographic frame/i);
    expect(p).not.toMatch(/\bleave\b|\bblank\b|\bempty\b/i);
  });

  it('inset-block pede assunto centrado e recorte vertical apertado', () => {
    const p = buildImagePrompt({ title: 'Tema', shape: 'inset-block' });
    expect(p).toMatch(/centered/i);
    expect(p).toMatch(/narrow portrait/i);
  });

  it('inset-landscape pede assunto centrado numa composição LARGA', () => {
    const p = buildImagePrompt({ title: 'Tema', shape: 'inset-landscape' });
    expect(p).toMatch(/centered/i);
    expect(p).toMatch(/horizontal/i);
    // O corte na caixa de 864x510 come em cima e embaixo, não nos lados.
    expect(p).toMatch(/top and bottom/i);
  });

  it('os TRÊS enquadramentos são textos DIFERENTES', () => {
    // Sem isto o parâmetro existiria sem mudar nada do que a OpenAI recebe.
    const textos = (['full-bleed', 'inset-block', 'inset-landscape'] as const).map((shape) =>
      buildImagePrompt({ title: 'Tema', shape }),
    );
    expect(new Set(textos).size).toBe(3);
  });

  it('sem `shape` continua o de sempre: full-bleed', () => {
    expect(buildImagePrompt({ title: 'Tema' }))
      .toBe(buildImagePrompt({ title: 'Tema', shape: 'full-bleed' }));
  });

  it('a direção do usuário continua entrando no prompt', () => {
    expect(buildImagePrompt({ title: 'Tema', shape: 'inset-block', userPrompt: 'aquarela' }))
      .toMatch(/aquarela/);
  });
});
