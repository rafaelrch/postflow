import { describe, it, expect, vi } from 'vitest';

// `lib/openai` cria o client no topo do módulo e exige chave. Nada aqui precisa
// dele — só do hook e do spec do Template 1, que são puros.
vi.mock('openai', () => ({ default: class { constructor() {} } }));

import { imageSurface, imageShape } from '@/hooks/useGenerateCarouselImages';
import { template01SlideSurface } from '@/lib/templates/template-01';
import { DEFAULT_SLIDE, Slide } from '@/types';

/**
 * A SUPERFÍCIE DO DESTINO — o defeito 2 do achado do Rafael.
 *
 * Até aqui `dark atmosphere` era constante no prompt, colada em TODO pedido de
 * imagem. Mas as quatro estéticas não são a mesma:
 *   - Radar (template02): papel creme #EEE5D9 nos internos;
 *   - Perfil: card BRANCO #FFFFFF;
 *   - Manifesto (template01): alterna #FFFFFF, #050416 e #0D39E4 por modelo;
 *   - Atelier/Minimalist: seguem o TEMA que o usuário escolheu.
 *
 * Foto escura em slide claro entrega um slide brigando consigo mesmo. Estes
 * testes travam a regra que substituiu a constante.
 */

const slide = (extra: Partial<Slide> = {}): Slide => ({ ...DEFAULT_SLIDE, ...extra }) as Slide;

describe('template01SlideSurface — sai do SPEC, não de tabela escrita à mão', () => {
  it('os modelos com fundo BRANCO são claros', () => {
    // slides 4 e 5 do spec são #FFFFFF chapado.
    expect(template01SlideSurface(4)).toBe('light');
    expect(template01SlideSurface(5)).toBe('light');
  });

  it('o modelo quase-preto é escuro', () => {
    // slide 3 é #050416.
    expect(template01SlideSurface(3)).toBe('dark');
  });

  it('o azul saturado conta como ESCURO — luminância percebida, não média RGB', () => {
    // O modelo 6 é #0D39E4. Um (r+g+b)/3 ingênuo o chamaria de médio; com os
    // pesos do olho (o azul quase não pesa) ele é escuro, que é como ele se
    // comporta na tela.
    expect(template01SlideSurface(6)).toBe('dark');
  });

  it('modelo de fundo em DEGRADÊ é escuro — é onde a foto leva scrim por cima', () => {
    // Os modelos 1 e 2 são justamente os que têm imagem de FUNDO, com scrim
    // preto e texto branco por cima. Escuro ali é o que o template pede.
    expect(template01SlideSurface(1)).toBe('dark');
    expect(template01SlideSurface(2)).toBe('dark');
  });

  it('índice inexistente não explode', () => {
    expect(['light', 'dark']).toContain(template01SlideSurface(99));
  });
});

describe('imageSurface por estilo', () => {
  it('🔴 Perfil é CLARO — o card do post é #FFFFFF', () => {
    // Este é o caso mais gritante do defeito: a mídia do Perfil é uma caixa
    // dentro de um card branco, e recebia "dark atmosphere" como todo o resto.
    expect(imageSurface(slide(), 'profile', 0, 'background', 'dark')).toBe('light');
    // Nem o tema do deck muda isso: o card do Perfil é branco sempre.
    expect(imageSurface(slide(), 'profile', 0, 'background', 'light')).toBe('light');
  });

  it('🔴 Radar: capa é escura (foto de fundo sob cabeçalho branco), interno é claro', () => {
    // A `regraCabecalho` do spec do T2 diz: com imagem de fundo o cabeçalho vira
    // #FFFFFF. Texto branco só existe sobre foto escura.
    expect(imageSurface(slide(), 'template02', 0, 'background', 'dark')).toBe('dark');
    // Os internos são bloco sobre o papel creme #EEE5D9.
    expect(imageSurface(slide(), 'template02', 1, 'content', 'dark')).toBe('light');
  });

  it('Manifesto: a superfície acompanha o MODELO, não o índice', () => {
    expect(imageSurface(slide(), 'template01', 2, 'content', 'dark')).toBe('dark');  // modelo 3
    expect(imageSurface(slide(), 'template01', 3, 'content', 'dark')).toBe('light'); // modelo 4
    expect(imageSurface(slide(), 'template01', 4, 'content', 'dark')).toBe('light'); // modelo 5
  });

  it('Manifesto: o modelo do slide manda mesmo fora de ordem', () => {
    // `templateModel` explícito tem de vencer a posição no deck — é a mesma
    // regra que `imageDestination` já segue.
    expect(imageSurface(slide({ templateModel: 4 }), 'template01', 0, 'content', 'dark')).toBe('light');
    expect(imageSurface(slide({ templateModel: 3 }), 'template01', 4, 'content', 'dark')).toBe('dark');
  });

  it('Atelier e Minimalist seguem o TEMA — não têm papel próprio', () => {
    for (const style of ['editorial', 'minimalist'] as const) {
      expect(imageSurface(slide(), style, 0, 'background', 'dark')).toBe('dark');
      expect(imageSurface(slide(), style, 0, 'background', 'light')).toBe('light');
    }
  });

  it('a superfície é independente do SHAPE — são duas perguntas diferentes', () => {
    // O Perfil prova os dois: formato DEITADO e superfície CLARA. Se as duas
    // respostas viessem da mesma fonte, uma delas estaria errada.
    expect(imageShape(slide(), 'profile', 0, 'background')).toBe('inset-landscape');
    expect(imageSurface(slide(), 'profile', 0, 'background', 'dark')).toBe('light');
  });

  it('todo estilo devolve uma superfície válida em qualquer combinação', () => {
    const estilos = ['profile', 'editorial', 'template01', 'template02', 'minimalist'] as const;
    for (const style of estilos) {
      for (const target of ['background', 'content'] as const) {
        for (let i = 0; i < 6; i++) {
          expect(['light', 'dark']).toContain(imageSurface(slide(), style, i, target, 'dark'));
        }
      }
    }
  });
});
