import { describe, expect, it } from 'vitest';
import type { BrandContext } from '@/lib/brand-context';
import { EMPTY_BRAND_CONTEXT, isBrandContextEmpty } from '@/lib/brand-context';
import { brandArtDirection, buildImagePrompt, seriesDirective } from '@/lib/image-prompt';

/**
 * O PROMPT DE IMAGEM, CAMADA POR CAMADA.
 *
 * Antes este arquivo importava de `lib/openai`, que instancia o client da
 * OpenAI no import e por isso exigia uma OPENAI_API_KEY falsa e um import
 * dinâmico. O prompt virou um módulo PURO (`lib/image-prompt`), então o teste
 * importa direto — e é isso que permite afirmar a string INTEIRA sem chave de
 * API e sem gastar um centavo de crédito do Rafael.
 *
 * Os três defeitos que este arquivo tranca, todos achados na fonte:
 *
 * 1. 🔴 O prompt se contradizia no `inset-landscape`: o sufixo fixo terminava
 *    em "vertical composition" e o enquadramento pedia "wide horizontal
 *    composition" — as duas coisas na mesma frase.
 * 2. 🔴 "dark atmosphere" era imposta aos quatro templates, inclusive ao card
 *    BRANCO do Perfil e ao slide creme do Radar.
 * 3. 🔴 A marca não chegava na imagem: o usuário descrevia paleta e tom, o
 *    texto respeitava e a imagem ignorava.
 */

const marca: BrandContext = {
  niche: 'Fitness para mulheres 30+',
  audience: 'Mulheres de 30 a 45 anos',
  brandStory: 'Comecei treinando na sala de casa',
  audiencePains: 'Falta de tempo e culpa',
  tone: 'direto, acolhedor, sem jargão',
  palette: ['#0D39E4', '#EEE5D9'],
};

/** Extrai uma camada nomeada do prompt final. */
function camada(prompt: string, nome: string): string {
  const linha = prompt.split('\n').find((l) => l.startsWith(`${nome}: `));
  return linha ? linha.slice(nome.length + 2) : '';
}

describe('conteúdo editorial', () => {
  it('inclui título e descrição no prompt', () => {
    const p = buildImagePrompt({ title: 'Título', description: 'Desc' });
    expect(p).toContain('Título — Desc');
  });

  it('usa a intenção de capa quando isCover', () => {
    expect(buildImagePrompt({ title: 'T', isCover: true })).toMatch(/Cover slide/);
  });

  it('usa a intenção de fechamento quando isFinal', () => {
    expect(buildImagePrompt({ title: 'T', isFinal: true })).toMatch(/Closing slide/);
  });

  it('miolo: nem capa nem fechamento', () => {
    const p = buildImagePrompt({ title: 'T' });
    expect(p).toMatch(/Middle slide/);
    expect(p).not.toMatch(/Cover slide|Closing slide/);
  });

  it('tece o userPrompt como direção de arte adicional', () => {
    const p = buildImagePrompt({ title: 'T', userPrompt: 'tons frios, neon' });
    expect(p).toContain('Additional art direction: tons frios, neon.');
  });

  it('sem userPrompt não adiciona a seção de direção (não quebra chamadas atuais)', () => {
    const p = buildImagePrompt({ title: 'T', description: 'D' });
    expect(p).not.toContain('Additional art direction');
  });

  it('userPrompt em branco é ignorado', () => {
    const p = buildImagePrompt({ title: 'T', userPrompt: '   ' });
    expect(p).not.toContain('Additional art direction');
  });

  it('a direção do usuário é a ÚLTIMA palavra da camada de arte', () => {
    // O pedido explícito do usuário vem depois da marca, da atmosfera e da
    // série de propósito: é ele quem deve prevalecer dentro da camada.
    const arte = camada(
      buildImagePrompt({ title: 'T', brand: marca, userPrompt: 'aquarela', series: { size: 4 } }),
      'ART DIRECTION',
    );
    expect(arte.trim().endsWith('Additional art direction: aquarela.')).toBe(true);
  });
});

describe('entradas incompletas não produzem prompt quebrado', () => {
  it('sem descrição', () => {
    const p = buildImagePrompt({ title: 'Só o título' });
    expect(camada(p, 'SUBJECT')).toContain('Só o título');
    expect(p).not.toContain('—  ');
  });

  it('título vazio cai num assunto genérico em vez de frase truncada', () => {
    const p = buildImagePrompt({ title: '' });
    expect(camada(p, 'SUBJECT')).toContain('the topic of this slide');
  });

  it('título só com espaços é tratado como vazio', () => {
    expect(camada(buildImagePrompt({ title: '   ' }), 'SUBJECT')).toContain('the topic of this slide');
  });

  it('quebra de linha no título vira uma linha só — camada nunca se parte em duas', () => {
    const p = buildImagePrompt({ title: 'Linha 1\nLinha 2' });
    expect(camada(p, 'SUBJECT')).toContain('Linha 1 Linha 2');
    // Se o \n vazasse, o prompt ganharia uma linha sem rótulo de camada.
    for (const linha of p.split('\n')) expect(linha).toMatch(/^[A-Z ]+: /);
  });

  it('todas as camadas obrigatórias estão presentes mesmo na entrada mínima', () => {
    const p = buildImagePrompt({ title: 'T' });
    for (const nome of ['ROLE', 'SUBJECT', 'ART DIRECTION', 'COMPOSITION', 'EXCLUDE', 'OUTPUT']) {
      expect(camada(p, nome)).not.toBe('');
    }
  });

  it('nenhuma camada sai com rótulo órfão (rótulo seguido de nada)', () => {
    const p = buildImagePrompt({ title: 'T' });
    expect(p).not.toMatch(/^[A-Z ]+: *$/m);
  });
});

describe('🔴 defeito 1 — o prompt não se contradiz mais sobre orientação', () => {
  it('inset-landscape NÃO contém "vertical composition"', () => {
    // Era o bug: o sufixo fixo colava "vertical composition" no prompt do
    // formato DEITADO, na mesma frase do "wide horizontal composition".
    const p = buildImagePrompt({ title: 'Tema', shape: 'inset-landscape' });
    expect(p).not.toMatch(/vertical/i);
    expect(p).toMatch(/horizontal/i);
  });

  it('cada shape declara UMA orientação só, e sempre na mesma camada', () => {
    const orientacoes = {
      'full-bleed': /vertical/i,
      'inset-block': /vertical/i,
      'inset-landscape': /horizontal/i,
    } as const;
    for (const shape of ['full-bleed', 'inset-block', 'inset-landscape'] as const) {
      const p = buildImagePrompt({ title: 'Tema', shape });
      expect(camada(p, 'COMPOSITION')).toMatch(orientacoes[shape]);
      // Orientação só existe em COMPOSITION — nunca no texto fixo de OUTPUT.
      expect(camada(p, 'OUTPUT')).not.toMatch(/vertical|horizontal|portrait|landscape/i);
    }
  });

  it('nenhum shape produz "vertical" e "horizontal" no mesmo prompt', () => {
    for (const shape of ['full-bleed', 'inset-block', 'inset-landscape'] as const) {
      const p = buildImagePrompt({ title: 'Tema', shape });
      expect(/vertical/i.test(p) && /horizontal/i.test(p)).toBe(false);
    }
  });

  it('os TRÊS enquadramentos continuam sendo textos DIFERENTES', () => {
    const textos = (['full-bleed', 'inset-block', 'inset-landscape'] as const).map((shape) =>
      buildImagePrompt({ title: 'Tema', shape }),
    );
    expect(new Set(textos).size).toBe(3);
  });

  it('sem `shape` continua o de sempre: full-bleed', () => {
    expect(buildImagePrompt({ title: 'Tema' })).toBe(
      buildImagePrompt({ title: 'Tema', shape: 'full-bleed' }),
    );
  });

  it('só o full-bleed reserva espaço negativo para o texto', () => {
    // Nos formatos embutidos o texto não vai por cima da imagem: pedir área
    // calma ali jogaria fora metade do quadro sem motivo.
    expect(camada(buildImagePrompt({ title: 'T', shape: 'full-bleed' }), 'COMPOSITION'))
      .toMatch(/headline text will be laid on top/i);
    for (const shape of ['inset-block', 'inset-landscape'] as const) {
      expect(camada(buildImagePrompt({ title: 'T', shape }), 'COMPOSITION'))
        .toMatch(/No text is laid over this image/i);
    }
  });
});

describe('🔴 defeito 2 — a atmosfera vem do destino, não é mais fixa', () => {
  it('surface light pede atmosfera CLARA e recusa a escura', () => {
    const arte = camada(buildImagePrompt({ title: 'T', surface: 'light' }), 'ART DIRECTION');
    expect(arte).toMatch(/High-key, bright and airy/);
    expect(arte).not.toMatch(/Low-key, moody/);
  });

  it('surface dark pede atmosfera ESCURA', () => {
    const arte = camada(buildImagePrompt({ title: 'T', surface: 'dark' }), 'ART DIRECTION');
    expect(arte).toMatch(/Low-key, moody/);
    expect(arte).not.toMatch(/High-key/);
  });

  it('as duas superfícies produzem prompts DIFERENTES', () => {
    // Sem isto o parâmetro existiria sem mudar nada do que a OpenAI recebe.
    expect(buildImagePrompt({ title: 'T', surface: 'light' })).not.toBe(
      buildImagePrompt({ title: 'T', surface: 'dark' }),
    );
  });

  it('sem `surface` o prompt é idêntico ao de surface dark — o padrão de hoje', () => {
    // Compatibilidade: quem não informar superfície recebe a mesma atmosfera
    // que o sufixo fixo impunha antes.
    expect(buildImagePrompt({ title: 'T' })).toBe(buildImagePrompt({ title: 'T', surface: 'dark' }));
  });
});

describe('🔴 defeito 3 — a marca chega na imagem (só o que serve para foto)', () => {
  it('a paleta entra como direção de cor', () => {
    const arte = camada(buildImagePrompt({ title: 'T', brand: marca }), 'ART DIRECTION');
    expect(arte).toContain('#0D39E4');
    expect(arte).toContain('#EEE5D9');
  });

  it('o tom entra como clima', () => {
    expect(camada(buildImagePrompt({ title: 'T', brand: marca }), 'ART DIRECTION'))
      .toContain('direto, acolhedor, sem jargão');
  });

  it('🔴 nicho, público, história e dores NÃO entram — são briefing de COPY', () => {
    // Mandar 200 caracteres de prosa por campo para um modelo de imagem dilui o
    // assunto (que vem do título) e empurra o modelo a DESENHAR essas palavras
    // dentro da foto, contra a camada EXCLUDE.
    const p = buildImagePrompt({ title: 'T', brand: marca });
    expect(p).not.toContain(marca.niche);
    expect(p).not.toContain(marca.audience);
    expect(p).not.toContain(marca.brandStory);
    expect(p).not.toContain(marca.audiencePains);
  });

  it('a paleta é pedida como luz e material, nunca como bloco gráfico', () => {
    expect(camada(buildImagePrompt({ title: 'T', brand: marca }), 'ART DIRECTION'))
      .toMatch(/never as graphic overlays or colour blocks/i);
  });

  it('sem marca o prompt não ganha camada de marca', () => {
    const p = buildImagePrompt({ title: 'T' });
    expect(p).not.toMatch(/brand palette/i);
    expect(p).not.toMatch(/The mood should read as/i);
  });

  it('contexto de marca VAZIO se comporta como ausência de marca', () => {
    // `EMPTY_BRAND_CONTEXT` é o que `getBrandContext` devolve para quem não
    // completou o onboarding — o caminho mais comum de todos.
    expect(isBrandContextEmpty(EMPTY_BRAND_CONTEXT)).toBe(true);
    expect(buildImagePrompt({ title: 'T', brand: EMPTY_BRAND_CONTEXT })).toBe(
      buildImagePrompt({ title: 'T' }),
    );
  });

  it('marca só com paleta, ou só com tom, entra sem sobra de pontuação', () => {
    const soPaleta = buildImagePrompt({ title: 'T', brand: { ...EMPTY_BRAND_CONTEXT, palette: ['#000000'] } });
    const soTom = buildImagePrompt({ title: 'T', brand: { ...EMPTY_BRAND_CONTEXT, tone: 'sóbrio' } });
    expect(soPaleta).toContain('#000000');
    expect(soTom).toContain('sóbrio');
    for (const p of [soPaleta, soTom]) {
      expect(p).not.toMatch(/\.\s*\./);
      expect(p).not.toMatch(/\(\)/);
    }
  });

  it('brandArtDirection devolve string vazia quando não há nada útil', () => {
    expect(brandArtDirection(null)).toBe('');
    expect(brandArtDirection(undefined)).toBe('');
    expect(brandArtDirection(EMPTY_BRAND_CONTEXT)).toBe('');
  });
});

describe('coerência entre os slides do mesmo carrossel', () => {
  it('o lote declara o tamanho da série e o deck', () => {
    const arte = camada(
      buildImagePrompt({ title: 'T', series: { deckTitle: 'Rotina matinal', size: 6 } }),
      'ART DIRECTION',
    );
    expect(arte).toContain('cohesive set of 6 images');
    expect(arte).toContain('"Rotina matinal"');
  });

  it('🔴 a frase de série é IDÊNTICA em todos os slides do lote', () => {
    // É o mecanismo inteiro: cada slide é uma chamada separada à OpenAI, e o
    // que amarra as N imagens é receberem literalmente a mesma direção comum.
    const series = { deckTitle: 'Rotina matinal', size: 3 };
    const frases = [
      buildImagePrompt({ title: 'Slide 1', isCover: true, series }),
      buildImagePrompt({ title: 'Slide 2', series }),
      buildImagePrompt({ title: 'Slide 3', isFinal: true, series }),
    ].map((p) => {
      const m = camada(p, 'ART DIRECTION').match(/This image belongs to.*$/);
      return m ? m[0] : '';
    });
    expect(new Set(frases).size).toBe(1);
    expect(frases[0]).not.toBe('');
  });

  it('🔴 uma imagem só NÃO é uma série', () => {
    // Prometer coerência com um conjunto que não está sendo gerado é ruído no
    // único quadro que o usuário vai receber.
    expect(buildImagePrompt({ title: 'T', series: { size: 1, deckTitle: 'Deck' } }))
      .toBe(buildImagePrompt({ title: 'T' }));
  });

  it('sem série o prompt não fala de conjunto', () => {
    expect(buildImagePrompt({ title: 'T' })).not.toMatch(/cohesive set/i);
    expect(seriesDirective(undefined)).toBe('');
    expect(seriesDirective({})).toBe('');
  });

  it('série sem título do deck ainda amarra pelo tamanho', () => {
    const p = buildImagePrompt({ title: 'T', series: { size: 4 } });
    expect(p).toContain('cohesive set of 4 images');
    expect(p).not.toContain('for the carousel');
  });
});

describe('exclusões e formato de saída', () => {
  it('proíbe texto, logo e marca-d\'água em TODA combinação', () => {
    for (const shape of ['full-bleed', 'inset-block', 'inset-landscape'] as const) {
      for (const surface of ['light', 'dark'] as const) {
        const excluir = camada(buildImagePrompt({ title: 'T', shape, surface }), 'EXCLUDE');
        expect(excluir).toMatch(/No text/i);
        expect(excluir).toMatch(/logos/i);
        expect(excluir).toMatch(/watermarks/i);
      }
    }
  });

  it('a saída pedida é fotografia, e continua editorial e cinematográfica', () => {
    const out = camada(buildImagePrompt({ title: 'T' }), 'OUTPUT');
    expect(out).toMatch(/photograph/i);
    expect(out).toMatch(/editorial/i);
    expect(out).toMatch(/cinematic/i);
    expect(out).toMatch(/shallow depth of field/i);
  });
});

describe('determinismo — mesma entrada, mesma string', () => {
  const entrada = {
    title: 'O hábito que muda tudo',
    description: 'O que ninguém te conta.',
    isCover: true,
    shape: 'full-bleed' as const,
    surface: 'dark' as const,
    userPrompt: 'tons quentes',
    brand: marca,
    series: { deckTitle: 'Rotina', size: 5 },
  };

  it('duas chamadas iguais devolvem exatamente a mesma string', () => {
    expect(buildImagePrompt(entrada)).toBe(buildImagePrompt(entrada));
  });

  it('cem chamadas seguidas não variam', () => {
    // Trava data, random e qualquer coisa que dependa de estado entre chamadas.
    const primeira = buildImagePrompt(entrada);
    for (let i = 0; i < 100; i++) expect(buildImagePrompt(entrada)).toBe(primeira);
  });

  it('a ordem das camadas é fixa', () => {
    const nomes = buildImagePrompt(entrada).split('\n').map((l) => l.split(':')[0]);
    expect(nomes).toEqual(['ROLE', 'SUBJECT', 'ART DIRECTION', 'COMPOSITION', 'EXCLUDE', 'OUTPUT']);
  });

  it('cada combinação de shape × surface × marca × série é única', () => {
    // Se duas combinações colidissem, um dos parâmetros não estaria chegando à
    // OpenAI — que é exatamente o defeito que esta task veio corrigir.
    const prompts = new Set<string>();
    let total = 0;
    for (const shape of ['full-bleed', 'inset-block', 'inset-landscape'] as const) {
      for (const surface of ['light', 'dark'] as const) {
        for (const brand of [undefined, marca]) {
          for (const series of [undefined, { deckTitle: 'D', size: 3 }]) {
            prompts.add(buildImagePrompt({ title: 'T', shape, surface, brand, series }));
            total++;
          }
        }
      }
    }
    expect(prompts.size).toBe(total);
  });
});
