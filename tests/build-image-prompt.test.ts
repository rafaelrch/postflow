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

  it('só o full-bleed trata a região da tipografia — e ela é CALMA, nunca vazia', () => {
    // 🔴 MUDOU NESTA FATIA. Antes este teste travava a frase "Leave a calm,
    // low-detail, low-contrast area ... where headline text will be laid on
    // top", que na prática entregava BURACO: o modelo lia "leave an area" como
    // painel liso e jogava fora metade do quadro. A decisão de fundo continua
    // de pé (a região do texto tem de ter menos interferência visual), o que
    // caiu foi o "leave". Agora o teste afirma as DUAS metades, porque só a
    // primeira é o que produzia o defeito.
    const comp = camada(buildImagePrompt({ title: 'T', shape: 'full-bleed' }), 'COMPOSITION');
    // Metade 1 — a região onde a tipografia entra é mais calma.
    expect(comp).toMatch(/typography/i);
    expect(comp).toMatch(/calmer/i);
    expect(comp).toMatch(/lower detail|less visual interference/i);
    // Metade 2 — e continua sendo cena: ambiente, textura, luz e profundidade.
    expect(comp).toMatch(/environment/i);
    expect(comp).toMatch(/texture/i);
    expect(comp).toMatch(/light/i);
    expect(comp).toMatch(/depth/i);
    for (const shape of ['inset-block', 'inset-landscape'] as const) {
      expect(camada(buildImagePrompt({ title: 'T', shape }), 'COMPOSITION'))
        .toMatch(/No text is laid over this image/i);
    }
  });

  it('🔴 nenhum shape pede área vazia — o defeito que a fatia 1 veio matar', () => {
    // O pacote é explícito: nunca "leave a blank area", "leave half the image
    // empty", "reserve an empty corner". O quadro inteiro é preenchido de
    // propósito; o que varia é a DENSIDADE, nunca a presença de cena.
    for (const shape of ['full-bleed', 'inset-block', 'inset-landscape'] as const) {
      const p = buildImagePrompt({ title: 'T', shape });
      expect(p).not.toMatch(/blank/i);
      expect(p).not.toMatch(/empty/i);
      expect(p).not.toMatch(/\bleave\b|\breserve\b/i);
      expect(p).not.toMatch(/negative space/i);
    }
    expect(camada(buildImagePrompt({ title: 'T', shape: 'full-bleed' }), 'COMPOSITION'))
      .toMatch(/fill the entire photographic frame/i);
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
        // "No text" virou "No random readable text": o veto ao texto SOLTO
        // continua absoluto, o que deixou de ser absoluto é o veto ao logo.
        expect(excluir).toMatch(/No random readable text/i);
        expect(excluir).toMatch(/unrequested logos/i);
        expect(excluir).toMatch(/watermarks/i);
      }
    }
  });

  it('a saída pedida é fotografia, e continua editorial e cinematográfica', () => {
    const out = camada(buildImagePrompt({ title: 'T' }), 'OUTPUT');
    expect(out).toMatch(/photograph/i);
    expect(out).toMatch(/editorial/i);
    expect(out).toMatch(/cinematic/i);
  });

  it('🔴 o OUTPUT não obriga mais SHALLOW DEPTH OF FIELD em toda imagem', () => {
    // Era uma lente colada em todo pedido. Metade das metáforas desta direção
    // visual depende do AMBIENTE estar legível (o homem preso na roda gigante
    // só lê se a roda estiver nítida) — e desfocar o ambiente por regra mata
    // justamente o que a imagem precisa comunicar. A profundidade de campo
    // passa a ser escolha de conceito, na camada de ART DIRECTION.
    const p = buildImagePrompt({ title: 'T' });
    expect(camada(p, 'OUTPUT')).not.toMatch(/shallow depth of field/i);
    expect(camada(p, 'ART DIRECTION')).toMatch(/depth of field/i);
    expect(camada(p, 'ART DIRECTION')).toMatch(/only when|when it strengthens/i);
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

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TASK 4 — FATIA 1: CINEMATIC CONCEPTUAL REALISM.
 *
 * O que estes testes travam é uma mudança de NATUREZA do prompt, não de
 * tamanho. Antes a copy do slide entrava como DESCRIÇÃO DE CENA — "Cover
 * slide: Você pode estar treinando muito e evoluindo pouco" — e o modelo
 * fotografava literalmente o assunto: um homem treinando. A frase da copy é
 * uma CONTRADIÇÃO, e a contradição desaparecia na imagem.
 *
 * Agora a copy entra como CONTEXTO SEMÂNTICO e a metáfora visual é
 * obrigatória: a imagem tem de comunicar a ideia mesmo para quem nunca lê a
 * headline. É a diferença entre "homem treinando" e "homem correndo com
 * enorme esforço dentro de uma roda, preso no mesmo lugar".
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('a copy é CONTEXTO SEMÂNTICO, não descrição de cena', () => {
  it('a copy é declarada como contexto semântico e proibida de aparecer na imagem', () => {
    const sub = camada(
      buildImagePrompt({ title: 'Você pode estar treinando muito', description: 'E evoluindo pouco' }),
      'SUBJECT',
    );
    expect(sub).toMatch(/SEMANTIC CONTEXT ONLY/);
    expect(sub).toMatch(/Never reproduce, quote, translate, spell or display this copy inside the image/i);
  });

  it('🔴 a copy continua chegando LITERAL ao modelo — contexto não é resumo', () => {
    // Se a copy fosse reescrita ou truncada aqui, o modelo perderia a
    // contradição que é justamente o que precisa virar metáfora.
    const p = buildImagePrompt({ title: 'Título', description: 'Desc' });
    expect(p).toContain('Título — Desc');
  });

  it('exige metáfora visual — representar o tema não basta', () => {
    // 🔴 "it is not enough to merely represent the topic" SAIU: a CONCEPT
    // VALIDATION RULE diz a mesma coisa de forma verificável ("serviria para
    // várias headlines?"), e a frase genérica só ocupava espaço ao lado dela.
    // "tension" saiu junto com os outros sinônimos de contraste — ver o teste
    // da lista de relações mais abaixo.
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/photograph the relation, not one side of it/i);
    expect(sub).toMatch(/contradiction/i);
    expect(sub).toMatch(/transformation/i);
    expect(sub).toMatch(/metaphor/i);
  });

  it('a imagem tem de funcionar sem a headline', () => {
    expect(camada(buildImagePrompt({ title: 'T' }), 'SUBJECT'))
      .toMatch(/even if the viewer never reads the headline/i);
  });

  it('CONCEPT VALIDATION RULE está presente — e agora é OPERACIONAL', () => {
    // 🔴 SUBSTITUÍDA depois da evidência em pixel. A versão antiga dizia "se a
    // imagem puder ser confundida com uma foto genérica sobre o tema, o
    // conceito não é forte o bastante" — e ela estava no prompt DAS GERAÇÕES
    // QUE FALHARAM. Vaga demais: o modelo não consegue aplicá-la a si mesmo.
    // A nova pergunta uma coisa verificável: a MESMA imagem serviria para
    // VÁRIAS headlines diferentes? As fotos de academia cansada passariam na
    // regra velha e reprovam nesta.
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/CONCEPT VALIDATION RULE/);
    expect(sub).toMatch(/several different generic headlines about this topic/i);
    expect(sub).toMatch(/reject it and find a more specific metaphor/i);
    // A frase antiga saiu de vez — se voltar, voltou a redundância.
    expect(sub).not.toMatch(/mistaken for a normal generic photograph/i);
  });

  it('METAPHOR FIRST, EFFECTS SECOND — VFX não é padrão automático', () => {
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/METAPHOR FIRST, EFFECTS SECOND/);
    // A lista de muletas que o modelo aplica sozinho quando ouve "cinematic".
    expect(sub).toMatch(/holograms/i);
    expect(sub).toMatch(/neon/i);
    expect(sub).toMatch(/cyberpunk/i);
  });

  it('título vazio não produz um bloco de copy órfão', () => {
    const sub = camada(buildImagePrompt({ title: '' }), 'SUBJECT');
    expect(sub).toContain('the topic of this slide');
    expect(sub).not.toMatch(/SEMANTIC CONTEXT ONLY/);
    // E a exigência de metáfora continua valendo mesmo sem copy.
    expect(sub).toMatch(/METAPHOR FIRST, EFFECTS SECOND/);
  });
});

describe('capa, miolo e final continuam sendo direções DIFERENTES', () => {
  it('a capa pede conceito de abertura que para o scroll', () => {
    const sub = camada(buildImagePrompt({ title: 'T', isCover: true }), 'SUBJECT');
    expect(sub).toMatch(/Cover slide/);
    expect(sub).toMatch(/establishing concept/i);
    expect(sub).toMatch(/feed-stopping focal point/i);
  });

  it('o miolo pede UMA metáfora focada', () => {
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/Middle slide/);
    expect(sub).toMatch(/focused visual metaphor supporting one clear idea/i);
  });

  it('o final pede gesto contido, não clímax', () => {
    const sub = camada(buildImagePrompt({ title: 'T', isFinal: true }), 'SUBJECT');
    expect(sub).toMatch(/Closing slide/);
    expect(sub).toMatch(/restrained but memorable concluding visual gesture/i);
  });

  it('as três posições produzem prompts DIFERENTES', () => {
    const p = [
      buildImagePrompt({ title: 'T', isCover: true }),
      buildImagePrompt({ title: 'T' }),
      buildImagePrompt({ title: 'T', isFinal: true }),
    ];
    expect(new Set(p).size).toBe(3);
  });
});

describe('ROLE — diretor de conceito visual, não fotógrafo de banco de imagem', () => {
  it('declara a linguagem visual oficial do produto', () => {
    expect(camada(buildImagePrompt({ title: 'T' }), 'ROLE'))
      .toMatch(/CINEMATIC CONCEPTUAL REALISM/);
  });

  it('pede metáfora fotográfica original e produção real', () => {
    const role = camada(buildImagePrompt({ title: 'T' }), 'ROLE');
    expect(role).toMatch(/photographic metaphors/i);
    expect(role).toMatch(/photographed on location/i);
  });

  it('🔴 o ROLE ainda NÃO fala de compositing — isso é a fatia 3', () => {
    // Identity Mode não existe nesta fatia: o builder nem sabe que existe
    // referência humana. Um ROLE falando de compositing sem referência
    // mandaria o modelo colar rosto num quadro que não tem rosto nenhum.
    expect(buildImagePrompt({ title: 'T' })).not.toMatch(/compositing/i);
  });
});

describe('ART DIRECTION — realismo fotográfico e impacto visual', () => {
  it('pede anatomia, pele e materiais reais', () => {
    const arte = camada(buildImagePrompt({ title: 'T' }), 'ART DIRECTION');
    expect(arte).toMatch(/real human anatomy/i);
    expect(arte).toMatch(/authentic skin texture/i);
    expect(arte).toMatch(/visible pores/i);
    expect(arte).toMatch(/individual hair strands/i);
  });

  it('a luz tem de ter FONTE dentro da cena', () => {
    expect(camada(buildImagePrompt({ title: 'T' }), 'ART DIRECTION'))
      .toMatch(/motivated by actual sources/i);
  });

  it('as imperfeições da fotografia real são pedidas, não evitadas', () => {
    const arte = camada(buildImagePrompt({ title: 'T' }), 'ART DIRECTION');
    expect(arte).toMatch(/sensor grain/i);
    expect(arte).toMatch(/lens softness/i);
    expect(arte).toMatch(/highlight rolloff/i);
    expect(arte).toMatch(/hyper-clean synthetic perfection/i);
  });

  it('impacto visual: UM ponto focal e hierarquia forte', () => {
    const arte = camada(buildImagePrompt({ title: 'T' }), 'ART DIRECTION');
    expect(arte).toMatch(/one unmistakable focal point/i);
    expect(arte).toMatch(/strong visual hierarchy/i);
    expect(arte).toMatch(/easiest to understand at a glance/i);
  });

  it('🔴 impacto não é pedido com adjetivo vazio', () => {
    // "epic", "insane", "viral", "extreme" são o atalho que o modelo traduz em
    // exagero genérico. O impacto vem de perspectiva, escala e luz.
    const p = buildImagePrompt({ title: 'T' });
    expect(p).not.toMatch(/\bepic\b|\binsane\b|\bviral\b|\bextreme\b/i);
  });

  it('o realismo vale para as duas superfícies', () => {
    for (const surface of ['light', 'dark'] as const) {
      expect(camada(buildImagePrompt({ title: 'T', surface }), 'ART DIRECTION'))
        .toMatch(/real human anatomy/i);
    }
  });
});

describe('userPrompt — prioridade criativa alta, sem furar regra técnica', () => {
  it('a direção do usuário é declarada como prioritária', () => {
    const arte = camada(buildImagePrompt({ title: 'T', userPrompt: 'aquarela' }), 'ART DIRECTION');
    expect(arte).toMatch(/Prioritize the following user direction/i);
    expect(arte).toMatch(/does not conflict with/i);
  });

  it('🔴 mas o limite é dito no mesmo lugar: composição, identidade e exclusões', () => {
    const arte = camada(buildImagePrompt({ title: 'T', userPrompt: 'aquarela' }), 'ART DIRECTION');
    expect(arte).toMatch(/technical composition/i);
    expect(arte).toMatch(/identity fidelity/i);
    expect(arte).toMatch(/exclusion requirements/i);
  });

  it('sem userPrompt a moldura de prioridade também não aparece', () => {
    // Rótulo de prioridade sem pedido nenhum é ruído.
    expect(buildImagePrompt({ title: 'T' })).not.toMatch(/Prioritize the following user direction/i);
  });
});

describe('OUTPUT — fotografia crível, sem aparência de IA', () => {
  it('pede peça editorial/campanha premium com ponto focal claro', () => {
    const out = camada(buildImagePrompt({ title: 'T' }), 'OUTPUT');
    expect(out).toMatch(/premium editorial or creative campaign photograph/i);
    expect(out).toMatch(/one clear focal point/i);
    expect(out).toMatch(/minimal visible signs of AI generation/i);
  });

  it('elementos extraordinários são permitidos, mas integrados à física da cena', () => {
    expect(camada(buildImagePrompt({ title: 'T' }), 'OUTPUT'))
      .toMatch(/physically integrated into the photographed world/i);
  });

  it('continua recusando ilustração, 3D infantil e pose de banco de imagem', () => {
    const out = camada(buildImagePrompt({ title: 'T' }), 'OUTPUT');
    expect(out).toMatch(/no illustration/i);
    expect(out).toMatch(/stock-photo staging/i);
  });
});

describe('a fatia 1 NÃO abre as portas das fatias seguintes', () => {
  it('nenhum campo novo é exigido — toda chamada de hoje continua válida', () => {
    // Compatibilidade é o contrato desta fatia: a rota chama com os mesmos
    // campos de sempre e não pode quebrar.
    expect(() =>
      buildImagePrompt({
        title: 'T',
        description: 'D',
        isCover: true,
        shape: 'full-bleed',
        surface: 'dark',
        userPrompt: 'x',
        brand: marca,
        series: { deckTitle: 'D', size: 3 },
      }),
    ).not.toThrow();
  });

  it('Identity Mode, seriesIndex e textSafeArea continuam fora', () => {
    const p = buildImagePrompt({ title: 'T' });
    expect(p).not.toMatch(/IDENTITY LOCKED/i);
    expect(p).not.toMatch(/reference photograph/i);
    expect(p).not.toMatch(/safe area/i);
  });

  it('🔴 o EXCLUDE já é o DINÂMICO — a decisão pendente do Rafael chegou', () => {
    // MUDOU. Na fatia 1 este teste travava a string literal de então, porque a
    // regra de marcas estava esperando decisão. A decisão veio: existe UM
    // EXCLUDE, condicional, e ele vale para toda geração. Ver o describe
    // "EXCLUDE — um só, condicional" mais abaixo, que é onde ele é afirmado.
    const excluir = camada(buildImagePrompt({ title: 'T' }), 'EXCLUDE');
    expect(excluir).toMatch(/explicitly requested/i);
    expect(excluir).toMatch(/random readable text/i);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TASK 4 — FATIA 4: seriesIndex e os shot cues.
 *
 * O defeito que isto ataca: a série já amarrava as N imagens no MESMO ensaio
 * (mesma luz, mesma grade de cor, mesmo tratamento) — e amarrava DEMAIS. Como
 * as N chamadas recebiam texto idêntico nessa camada, o modelo tendia ao mesmo
 * enquadramento seis vezes: seis planos médios do mesmo tipo de cena. Coerente
 * e monótono.
 *
 * `seriesIndex` é a única coisa que DIFERE entre os slides do lote, e ela muda
 * só o ENQUADRAMENTO — nunca a luz, a cor ou o tratamento, que continuam vindo
 * idênticos da frase de série. É o ensaio ganhando plano aberto, plano médio e
 * detalhe, em vez de seis vezes o mesmo plano.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('seriesIndex — variedade de enquadramento sem perder o ensaio', () => {
  it('dois índices diferentes produzem cues DIFERENTES', () => {
    const a = camada(buildImagePrompt({ title: 'T', series: { size: 5, index: 1 } }), 'ART DIRECTION');
    const b = camada(buildImagePrompt({ title: 'T', series: { size: 5, index: 3 } }), 'ART DIRECTION');
    expect(a).not.toBe(b);
    expect(a).toMatch(/environmental or establishing view/i);
    expect(b).toMatch(/tighter tactile detail/i);
  });

  it('os CINCO índices da volta dão as cinco cues, todas distintas', () => {
    const cues = [1, 2, 3, 4, 5].map((index) =>
      camada(buildImagePrompt({ title: 'T', series: { size: 5, index } }), 'ART DIRECTION'),
    );
    expect(new Set(cues).size).toBe(5);
  });

  it('🔴 o mesmo índice SEMPRE devolve a mesma string', () => {
    // Determinismo é a regra de ouro do módulo: o cue sai de aritmética, nunca
    // de sorteio. Se algum dia virar random, o ensaio deixa de ser reprodutível
    // e o teste de determinismo geral não pegaria só esta camada.
    const entrada = { title: 'T', series: { deckTitle: 'D', size: 6, index: 3 } };
    const primeira = buildImagePrompt(entrada);
    for (let i = 0; i < 50; i++) expect(buildImagePrompt(entrada)).toBe(primeira);
  });

  it('a lista dá a volta de 5 em 5 — índice 1 e índice 6 têm o MESMO cue', () => {
    const cue = (index: number) =>
      camada(buildImagePrompt({ title: 'T', series: { size: 8, index } }), 'ART DIRECTION');
    expect(cue(6)).toBe(cue(1));
    expect(cue(7)).toBe(cue(2));
  });

  it('índice fora da faixa não quebra o prompt', () => {
    // O valor vem do cliente. Zero, negativo, fracionário e absurdo não podem
    // produzir `undefined` no meio da camada nem derrubar o builder.
    for (const index of [0, -1, -7, 2.7, 999, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = buildImagePrompt({ title: 'T', series: { size: 5, index } });
      expect(p).not.toMatch(/undefined|NaN|Infinity/);
      for (const linha of p.split('\n')) expect(linha).toMatch(/^[A-Z ]+: /);
    }
  });

  it('🔴 SEM seriesIndex o prompt é EXATAMENTE o de antes desta fatia', () => {
    // Compatibilidade: a rota de hoje não manda índice nenhum, e nenhuma
    // chamada atual pode mudar de resultado por causa desta fatia.
    const semIndice = buildImagePrompt({ title: 'T', series: { deckTitle: 'D', size: 4 } });
    expect(semIndice).toBe(
      buildImagePrompt({ title: 'T', series: { deckTitle: 'D', size: 4, index: undefined } }),
    );
    // E nenhuma das cinco cues aparece.
    expect(semIndice).not.toMatch(/Favour an environmental|Favour a medium contextual|Favour a tighter|Favour an unusual|Favour a clean hero/i);
  });

  it('índice inválido se comporta como ausência de índice', () => {
    const semIndice = buildImagePrompt({ title: 'T', series: { size: 4 } });
    for (const index of [0, -3, Number.NaN]) {
      expect(buildImagePrompt({ title: 'T', series: { size: 4, index } })).toBe(semIndice);
    }
  });

  it('🔴 seriesIndex vale MESMO sem série de verdade — e isso é decisão, não descuido', () => {
    // `seriesDirective` ignora `size` menor que 2 de propósito: aquela frase
    // PROMETE coerência com um conjunto, e prometer conjunto para uma imagem
    // avulsa é ruído. O shot cue não tem esse defeito — ele não cita imagem
    // nenhuma, só diz o enquadramento DESTA. E gating dele seria pior: quando o
    // usuário regera SÓ o slide 3 de um deck de 6, ele perderia justamente o
    // enquadramento que aquele slide tinha no lote.
    const avulso = buildImagePrompt({ title: 'T', series: { index: 3 } });
    expect(avulso).toMatch(/tighter tactile detail/i);
    // Mas a frase de conjunto continua fora: uma imagem só não é um ensaio.
    expect(avulso).not.toMatch(/cohesive set/i);
  });

  it('🔴 o cue muda o ENQUADRAMENTO, e a âncora do ensaio continua idêntica', () => {
    // É a divisão inteira desta fatia: o que amarra (luz, cor, tratamento) é
    // literalmente igual nas N chamadas; o que varia é só o plano.
    const ancora = (index: number) => {
      const m = camada(
        buildImagePrompt({ title: 'T', series: { deckTitle: 'D', size: 3, index } }),
        'ART DIRECTION',
      ).match(/This image belongs to[^.]*\.[^.]*\./);
      return m ? m[0] : '';
    };
    expect(ancora(1)).toBe(ancora(2));
    expect(ancora(1)).not.toBe('');
  });

  it('o cue não rouba a última palavra do usuário', () => {
    const arte = camada(
      buildImagePrompt({ title: 'T', series: { size: 5, index: 2 }, userPrompt: 'aquarela' }),
      'ART DIRECTION',
    );
    expect(arte.trim().endsWith('Additional art direction: aquarela.')).toBe(true);
  });

  it('o cue não fala de orientação — ela continua saindo só da COMPOSITION', () => {
    for (const index of [1, 2, 3, 4, 5]) {
      const p = buildImagePrompt({ title: 'T', shape: 'inset-landscape', series: { size: 5, index } });
      expect(p).not.toMatch(/vertical/i);
      expect(camada(p, 'ART DIRECTION')).not.toMatch(/vertical|horizontal|portrait|landscape/i);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TASK 4 — FATIAS 2 e 3, DEPOIS DA CORREÇÃO DE RUMO DO RAFAEL.
 *
 * A primeira versão destas fatias pôs TRÊS CHECKBOXES na barra lateral, um por
 * modo. O Rafael olhou a tela e disse: "isso aqui não tem que ter esse
 * checkbox. O usuário só tem que conseguir gerar." Os três saíram.
 *
 * E o recurso não encolheu — ficou MAIOR, porque o texto do material sempre foi
 * condicional: "When real public figures are explicitly part of the editorial
 * subject...", "brands or products explicitly requested by the source copy or
 * user direction...". Escrito assim, quem avalia a condição é o MODELO, que já
 * recebe a copy inteira no SUBJECT e, quando há referência, a própria foto pelo
 * `images.edit`. A condição nunca precisou morar do nosso lado.
 *
 * O que isso apagou de vez: a lista curada de nomes de marca que uma detecção
 * local exigiria, e que já tínhamos descartado por errar nos dois sentidos.
 *
 * Sobrou UMA pergunta no nosso código, e é a única que ele consegue responder
 * sozinho: existe foto de entrada, sim ou não (`hasReference`, derivado de
 * `referenceImageUrl` na rota).
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('IDENTITY — a condicional é avaliada por quem OLHA a foto', () => {
  const comReferencia = { title: 'T', hasReference: true };

  it('a direção entra sempre que existe referência, e é CONDICIONAL', () => {
    const sub = camada(buildImagePrompt(comReferencia), 'SUBJECT');
    // 🔴 A condicional ABRE o bloco. As três declarações em caixa alta ficam
    // DENTRO dela: "IDENTITY LOCKED" gritado sobre uma foto de produto seria
    // uma ordem sem objeto.
    expect(sub).toMatch(/If the supplied reference photograph shows a person/);
    expect(sub).toMatch(/IDENTITY LOCKED/);
    expect(sub).toMatch(/BODY POSE UNLOCKED/);
    expect(sub).toMatch(/FACE ANGLE CONSERVATIVE/);
    expect(sub.indexOf('If the supplied reference photograph shows a person'))
      .toBeLessThan(sub.indexOf('IDENTITY LOCKED'));
  });

  it('🔴 e diz o que fazer quando a foto NÃO é gente', () => {
    // É o outro lado da condicional, e o que dispensa o checkbox: referência de
    // produto ou lugar tem instrução própria, em vez de cair no vazio.
    expect(camada(buildImagePrompt(comReferencia), 'SUBJECT'))
      .toMatch(/object, product or place instead/i);
  });

  it('proíbe parecido, embelezado e redesenhado', () => {
    const sub = camada(buildImagePrompt(comReferencia), 'SUBJECT');
    expect(sub).toMatch(/exact real person/i);
    expect(sub).toMatch(/merely resembles the reference/i);
    expect(sub).toMatch(/Do not beautify/i);
    expect(sub).toMatch(/Do not redesign facial features/i);
  });

  it('a lista de traços a preservar chega inteira', () => {
    const sub = camada(buildImagePrompt(comReferencia), 'SUBJECT');
    for (const traco of [
      'face shape', 'hairline', 'eyebrows', 'eyelids', 'eye spacing', 'nostrils',
      'lip proportions', 'jaw', 'chin', 'ears', 'facial hair', 'natural asymmetry',
    ]) {
      expect(sub).toContain(traco);
    }
  });

  it('🔴 a referência NÃO define o ângulo da selfie — é o erro A dos testes visuais', () => {
    const sub = camada(buildImagePrompt(comReferencia), 'SUBJECT');
    expect(sub).toMatch(/defines WHO the person is/i);
    expect(sub).toMatch(/does not define the original selfie angle/i);
    expect(sub).toMatch(/body pose, gaze, expression/i);
  });

  it('🔴 nem vira máscara frontal colada num corpo girado', () => {
    const sub = camada(buildImagePrompt(comReferencia), 'SUBJECT');
    expect(sub).toMatch(/flat frontal mask/i);
    expect(sub).toMatch(/head, neck, shoulders and body must remain anatomically coherent/i);
  });

  it('com UMA referência só, o ângulo facial é conservador', () => {
    const sub = camada(buildImagePrompt(comReferencia), 'SUBJECT');
    expect(sub).toMatch(/extreme orientation/i);
    expect(sub).toMatch(/near-frontal or three-quarter/i);
  });

  it('🔴 SEM referência, nada de identidade aparece — este teste sobreviveu à mudança', () => {
    // O Orquestrador mandou que ele ficasse, e ele fica: sem foto de entrada
    // não há sujeito a preservar, e mandar a direção assim mesmo faria o modelo
    // procurar uma pessoa que ninguém pediu.
    const p = buildImagePrompt({ title: 'T' });
    expect(p).not.toMatch(/IDENTITY LOCKED/);
    expect(p).not.toMatch(/reference photograph/i);
    expect(p).not.toMatch(/compositing/i);
  });

  it('o ROLE ganha compositing SÓ quando existe referência', () => {
    expect(camada(buildImagePrompt(comReferencia), 'ROLE')).toMatch(/compositing/i);
    expect(camada(buildImagePrompt({ title: 'T' }), 'ROLE')).not.toMatch(/compositing/i);
  });

  it('🔴 o ROLE fala de "reference subject", não de pessoa', () => {
    // O painel aceita produto, cenário ou pessoa. O ROLE é o lugar errado para
    // decidir qual dos três chegou — quem decide é a condicional do SUBJECT.
    const role = camada(buildImagePrompt(comReferencia), 'ROLE');
    expect(role).toMatch(/reference subject/i);
    expect(role).not.toMatch(/the supplied real person/i);
  });

  it('hasReference muda o prompt de verdade', () => {
    expect(buildImagePrompt({ title: 'T', hasReference: true }))
      .not.toBe(buildImagePrompt({ title: 'T' }));
    expect(buildImagePrompt({ title: 'T', hasReference: false }))
      .toBe(buildImagePrompt({ title: 'T' }));
  });
});

describe('EXCLUDE — um só, condicional, em TODA geração', () => {
  it('🔴 não existem mais duas versões: o EXCLUDE é o mesmo em tudo', () => {
    // Era escolhido por sinalizador. O sinalizador saiu, e com ele o risco de
    // duas strings divergirem em silêncio.
    const textos = new Set(
      (['full-bleed', 'inset-block', 'inset-landscape'] as const).flatMap((shape) =>
        (['light', 'dark'] as const).map((surface) =>
          camada(buildImagePrompt({ title: 'T', shape, surface }), 'EXCLUDE'),
        ),
      ),
    );
    expect(textos.size).toBe(1);
  });

  it('a marca PEDIDA é permitida, e a condição está escrita no texto', () => {
    // 🔴 ENCOLHEU. "are intentionally allowed, because they are part of the
    // editorial narrative" virou "may appear where editorially relevant": mesma
    // permissão, mesma condicional, 60 caracteres a menos em TODA imagem.
    const excluir = camada(buildImagePrompt({ title: 'Codex vs Claude Code' }), 'EXCLUDE');
    expect(excluir).toMatch(/explicitly requested by the copy or user direction/i);
    expect(excluir).toMatch(/may appear where editorially relevant/i);
    // 🔴 O veto absoluto não pode conviver com a permissão: "No logos" e "logos
    // pedidos são permitidos" na mesma camada deixa o modelo escolher qual das
    // duas obedecer. Era esse o defeito.
    expect(excluir).not.toMatch(/(^|[^a-z])logos, wordmarks/i);
  });

  it('marca NÃO pedida continua proibida', () => {
    // 🔴 "Do not invent unrelated brands" saiu por REDUNDÂNCIA, não por decisão:
    // "unrequested logos and brands may not [appear]" já diz a mesma coisa, e as
    // duas frases juntas custavam 32 caracteres em toda imagem para repetir uma
    // proibição que o modelo já tinha lido na frase anterior.
    const excluir = camada(buildImagePrompt({ title: 'T' }), 'EXCLUDE');
    expect(excluir).toMatch(/unrequested logos and brands may not/i);
  });

  it('sem asset oficial, símbolo coerente vence pseudo-logo deformado', () => {
    const excluir = camada(buildImagePrompt({ title: 'T' }), 'EXCLUDE');
    expect(excluir).toMatch(/coherent symbolic identity/i);
    expect(excluir).toMatch(/distorted pseudo-logos/i);
  });

  it('🔴 liberar MARCA não libera TEXTO — a tipografia do slide vai por cima', () => {
    // O EXCLUDE proíbe letra porque o texto do template é desenhado sobre a
    // foto: letra inventada pela IA briga com o texto de verdade. A exceção é
    // para o elemento de marca PEDIDO, nunca para letreiro, legenda ou UI falsa.
    const excluir = camada(buildImagePrompt({ title: 'T' }), 'EXCLUDE');
    expect(excluir).toMatch(/random readable text/i);
    expect(excluir).toMatch(/captions/i);
    expect(excluir).toMatch(/headlines/i);
    expect(excluir).toMatch(/watermarks/i);
    expect(excluir).toMatch(/fake UI copy/i);
    expect(excluir).toMatch(/Do not invent brand lettering, slogans or product copy/i);
  });

  it('🔴 "childish logo battle" saiu do EXCLUDE — e a regra não se perdeu', () => {
    // Ela era uma proibição de COMPOSIÇÃO escondida na camada de exclusões, e
    // ia em toda imagem. O que ela queria evitar (duas marcas encaradas como
    // pôster de luta) é exatamente o que o bloco de rivalidade agora trata, com
    // muito mais precisão e só quando há rivalidade de verdade.
    expect(camada(buildImagePrompt({ title: 'T' }), 'EXCLUDE')).not.toMatch(/logo battle/i);
    expect(camada(buildImagePrompt({ title: 'Codex vs Claude Code' }), 'SUBJECT'))
      .toMatch(/the cliche to avoid is the versus poster/i);
  });

  it('o EXCLUDE continua sem falar de orientação', () => {
    expect(camada(buildImagePrompt({ title: 'T', shape: 'inset-landscape' }), 'EXCLUDE'))
      .not.toMatch(/vertical|portrait/i);
  });
});

describe('PUBLIC FIGURES — sempre presente, e condicional no próprio texto', () => {
  it('🔴 a direção entra em TODA geração, sem sinalizador nenhum', () => {
    // Quem sabe se a copy cita Sam Altman é quem lê a copy — e ela chega
    // inteira algumas frases acima, nesta mesma camada.
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/When real public figures are explicitly part of the editorial subject/);
  });

  it('representação editorial permitida, tratadas como pessoas reais', () => {
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/recognizable editorial representations/i);
    expect(sub).toMatch(/premium editorial photograph/i);
  });

  it('sem caricatura e sem virar personagem de ficção', () => {
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/Do not caricature/i);
    expect(sub).toMatch(/fictional characters/i);
  });

  it('🔴 a fórmula do versus simétrico é recusada', () => {
    const sub = camada(buildImagePrompt({ title: 'OpenAI vs Anthropic' }), 'SUBJECT');
    expect(sub).toMatch(/symmetrical versus compositions/i);
    expect(sub).toMatch(/reflections/i);
    expect(sub).toMatch(/foreground objects/i);
    expect(sub).toMatch(/environmental storytelling/i);
  });

  it('a direção de figuras não fala de orientação', () => {
    expect(buildImagePrompt({ title: 'T', shape: 'inset-landscape' })).not.toMatch(/vertical/i);
  });
});

describe('a correção de rumo não desfez nada do que já passou', () => {
  it('as 6 camadas, na ordem, uma linha cada — com e sem referência', () => {
    for (const hasReference of [false, true]) {
      const p = buildImagePrompt({
        title: 'OpenAI vs Anthropic',
        description: 'Sam Altman e Dario Amodei estão no centro dessa corrida.',
        hasReference,
        shape: 'full-bleed',
        surface: 'dark',
        series: { deckTitle: 'D', size: 5, index: 2 },
        userPrompt: 'luz de fim de tarde',
        brand: marca,
      });
      expect(p.split('\n').map((l) => l.split(':')[0])).toEqual([
        'ROLE', 'SUBJECT', 'ART DIRECTION', 'COMPOSITION', 'EXCLUDE', 'OUTPUT',
      ]);
      for (const linha of p.split('\n')) expect(linha).toMatch(/^[A-Z ]+: /);
      expect(camada(p, 'ART DIRECTION').trim().endsWith('Additional art direction: luz de fim de tarde.')).toBe(true);
    }
  });

  it('determinismo: cem chamadas com referência não variam', () => {
    const entrada = { title: 'T', hasReference: true, series: { deckTitle: 'D', size: 4, index: 3 } };
    const primeira = buildImagePrompt(entrada);
    for (let i = 0; i < 100; i++) expect(buildImagePrompt(entrada)).toBe(primeira);
  });

  it('a orientação continua saindo SÓ da COMPOSITION, com referência', () => {
    const p = buildImagePrompt({ title: 'T', shape: 'inset-landscape', hasReference: true });
    expect(p).not.toMatch(/vertical/i);
    expect(camada(p, 'OUTPUT')).not.toMatch(/vertical|horizontal|portrait|landscape/i);
  });

  it('o conserto do full-bleed sobrevive à referência', () => {
    const p = buildImagePrompt({ title: 'T', shape: 'full-bleed', hasReference: true });
    expect(p).toMatch(/fill the entire photographic frame/i);
    expect(p).not.toMatch(/\bleave\b|\bblank\b|\bempty\b|\breserve\b/i);
  });

  it('METAPHOR FIRST, cover/middle/final e seriesIndex seguem de pé', () => {
    const p = buildImagePrompt({ title: 'T', isCover: true, hasReference: true, series: { size: 5, index: 3 } });
    expect(p).toMatch(/METAPHOR FIRST, EFFECTS SECOND/);
    expect(p).toMatch(/Cover slide/);
    expect(p).toMatch(/tighter tactile detail/i);
    expect(p).toMatch(/real human anatomy/i);
    expect(p).toMatch(/selective lighting/i);
  });

  it('🔴 nenhum campo de modo sobreviveu — a chamada tem UMA pergunta sobre referência', () => {
    // Se alguém reintroduzir um sinalizador, este teste não pega. O que ele
    // trava é o contrário: que `hasReference` sozinho já entrega tudo.
    const comFoto = buildImagePrompt({ title: 'T', hasReference: true });
    expect(comFoto).toMatch(/If the supplied reference photograph shows a person/);
    expect(comFoto).toMatch(/When real public figures are explicitly part/);
    expect(camada(comFoto, 'EXCLUDE')).toMatch(/explicitly requested/i);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TASK 4 — REFINAMENTO DEPOIS DA PRIMEIRA EVIDÊNCIA EM PIXEL.
 *
 * Até aqui todo teste deste arquivo afirmava STRING. Estes aqui nascem de
 * IMAGEM: o Rafael gerou de verdade no Creatools e três coisas falharam.
 *
 *   A) "Você pode estar treinando muito e evoluindo pouco" devolveu homem
 *      exausto na academia. Esforço + CANSAÇO, quando a ideia é esforço +
 *      POUCO PROGRESSO. Metade da contradição.
 *   C) "Codex vs Claude Code" devolveu um CÓDICE — manuscrito antigo. O nome
 *      foi lido pelo dicionário, não pela entidade.
 *   D) "OpenAI vs Anthropic" devolveu o pôster de versus que o prompt mandava
 *      evitar: divisor luminoso central, poses espelhadas, lado frio e quente.
 *
 *   B) E uma coisa FUNCIONOU: o Identity Mode. Pessoa reconhecível, ângulo
 *      conservador, sem o rosto frontal colado em corpo virado. É o único
 *      módulo com aprovação em pixel, e por isso está intocado.
 *
 * A regra desta rodada foi consertar SEM ENGORDAR: substituir instrução fraca,
 * compactar redundância, e mover regra periférica para condicional.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('relação conceitual — mostrar UM lado não basta', () => {
  it('exige nomear a RELAÇÃO — agora com TRÊS tipos, não oito', () => {
    // 🔴 ENCOLHEU de propósito. Eram oito, e cinco deles (imbalance,
    // expectation versus reality, progress versus stagnation, tension) são
    // sinônimos de contraste: enumerar sinônimo não ensina nada, e o método
    // concreto que entrou logo abaixo faz o trabalho que a lista tentava fazer.
    // Sobraram os três que são relações REALMENTE diferentes entre si.
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/name the RELATION that gives the idea its meaning/);
    for (const rel of ['contradiction', 'cause versus result', 'transformation']) {
      expect(sub).toContain(rel);
    }
    for (const morto of ['imbalance', 'expectation versus reality', 'progress versus stagnation']) {
      expect(sub).not.toContain(morto);
    }
  });

  it('🔴 diz explicitamente que fotografar UM LADO da contradição é insuficiente', () => {
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/photograph the relation, not one side of it/);
  });

  it('🔴 "both must be legible in the same frame" SAIU — e a regra ficou melhor', () => {
    // Eu mesmo registrei essa frase como risco na entrega passada: pedir os
    // dois lados legíveis empurrava para composição de duas metades, brigando
    // com a cláusula anti-simetria três frases adiante. O recurso concreto
    // resolve a tensão em vez de administrá-la — a exigência dos dois lados
    // continua, mas agora dentro de UM objeto.
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).not.toMatch(/both must be legible in the same frame/i);
    expect(sub).not.toMatch(/great effort AND unchanged result/);
    expect(sub).toMatch(/carry BOTH sides inside one object or situation/);
  });

  it('🔴 NÃO existe cena de fitness hardcoded em lugar nenhum do prompt', () => {
    // A evidência veio de uma copy de academia, e a tentação era resolver ALI.
    // A regra tem de valer igual para dinheiro parado x rendendo e aparência x
    // realidade — se o prompt trouxesse esteira e halteres, ele estaria
    // resolvendo um caso e estragando todos os outros.
    for (const entrada of [
      { title: 'Você pode estar treinando muito e evoluindo pouco' },
      { title: 'Guardar dinheiro não vai te deixar rico' },
      { title: 'Rotina matinal' },
    ]) {
      const p = buildImagePrompt(entrada);
      expect(p).not.toMatch(/\bgym\b|\bfitness\b|treadmill|workout|dumbbell|barbell|academia|esteira|dieta|muscle|hamster/i);
    }
  });

  it('a regra de relação é a MESMA para qualquer tema', () => {
    // O bloco de conceito é constante: nenhum assunto recebe tratamento
    // especial. Se algum dia alguém ramificar por tema, isto quebra.
    const rel = (title: string) => {
      const sub = camada(buildImagePrompt({ title }), 'SUBJECT');
      return sub.slice(sub.indexOf('Then name the specific RELATION'));
    };
    expect(rel('Guardar dinheiro não vai te deixar rico')).toBe(rel('Rotina matinal'));
  });
});

describe('desambiguação de entidade — o nome não vale pelo dicionário', () => {
  it('a regra está presente e vem ANTES do conceito', () => {
    // O caso C: entender de QUEM se fala é pré-requisito para decidir o que
    // fotografar. Se a desambiguação viesse depois, o conceito já teria sido
    // desenhado em cima do códice medieval.
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/First resolve entities through the editorial context/);
    expect(sub).toMatch(/never the dictionary sense of the name/i);
    expect(sub.indexOf('First resolve entities'))
      .toBeLessThan(sub.indexOf('Then name the RELATION'));
  });

  it('cobre nome próprio, produto, empresa, tecnologia e figura pública', () => {
    expect(camada(buildImagePrompt({ title: 'T' }), 'SUBJECT'))
      .toMatch(/proper names, products, companies, technologies and public figures/i);
  });

  it('🔴 UM exemplo curto, e NENHUM catálogo de marcas', () => {
    // O exemplo do Codex é permitido porque é a ilustração da regra. O que não
    // pode existir é lista: catálogo envelhece, e um nome fora dele não ativa.
    const p = buildImagePrompt({ title: 'T' });
    expect(p).toMatch(/"Codex" is OpenAI Codex, not an ancient manuscript/);
    // Nenhuma outra marca citada no prompt — se virar lista, isto quebra.
    for (const marca of ['Anthropic', 'Nike', 'Adidas', 'Apple', 'Google', 'ChatGPT', 'Claude']) {
      expect(p).not.toContain(marca);
    }
  });
});

describe('rivalidade — bloco FORTE, e só quando existe rivalidade', () => {
  const rival = { title: 'Codex vs Claude Code', description: 'Quem está ganhando a guerra dos agentes?' };

  it('o bloco entra e proíbe o pôster de versus item por item', () => {
    const sub = camada(buildImagePrompt(rival), 'SUBJECT');
    expect(sub).toMatch(/RIVALRY FRAMING/);
    expect(sub).toMatch(/one subject on the left and another on the right/i);
    expect(sub).toMatch(/central divider/i);
    expect(sub).toMatch(/luminous beam/i);
    expect(sub).toMatch(/contrasting colour halves/i);
    expect(sub).toMatch(/mirrored poses/i);
    expect(sub).toMatch(/symmetrical versus compositions/i);
  });

  it('e oferece o SUBSTITUTO — proibir sem alternativa não muda nada', () => {
    const sub = camada(buildImagePrompt(rival), 'SUBJECT');
    expect(sub).toMatch(/one coherent photographic environment/i);
    expect(sub).toMatch(/spatial tension/i);
    expect(sub).toMatch(/eyelines/i);
    expect(sub).toMatch(/a single object or space that both are contesting/i);
  });

  it('🔴 conteúdo comum NÃO carrega o bloco — é o ponto da limpeza', () => {
    // Um carrossel sobre rotina matinal carregava, em todo slide, instrução
    // sobre não pôr dois executivos em lados opostos do quadro.
    for (const title of ['Rotina matinal', 'Guardar dinheiro não vai te deixar rico', 'T']) {
      expect(buildImagePrompt({ title })).not.toMatch(/RIVALRY FRAMING/);
    }
  });

  it('dispara por vs, vs., versus, contra e quem ganha — sem acento e sem caixa', () => {
    for (const title of [
      'Codex vs Claude Code', 'Codex VS. Claude Code', 'Codex versus Claude Code',
      'Codex contra Claude Code', 'Quem ganha: Codex ou Claude Code?',
      'QUEM GANHA essa disputa', 'Códex Versus Claude',
    ]) {
      expect(buildImagePrompt({ title })).toMatch(/RIVALRY FRAMING/);
    }
  });

  it('🔴 o limite de palavra protege: contradição, contraste e encontrar NÃO disparam', () => {
    // Sem \b, "contra" casaria dentro de três palavras comuníssimas em copy
    // editorial, e metade dos carrosséis ganharia um parágrafo sobre duelo.
    for (const title of [
      'A contradição que trava seu negócio',
      'O contraste entre o que você diz e o que faz',
      'Como encontrar tempo para treinar',
      'Vsauce e o conteúdo científico',
    ]) {
      expect(buildImagePrompt({ title })).not.toMatch(/RIVALRY FRAMING/);
    }
  });

  it('a descrição e o prompt do usuário também disparam', () => {
    expect(buildImagePrompt({ title: 'Agentes de código', description: 'Codex vs Claude Code' }))
      .toMatch(/RIVALRY FRAMING/);
    expect(buildImagePrompt({ title: 'Agentes', userPrompt: 'mostre um duelo, um contra o outro' }))
      .toMatch(/RIVALRY FRAMING/);
  });

  it('🔴 se o usuário PEDIR split-screen, o pedido dele vence', () => {
    // Direção criativa do usuário não é requisito técnico. Entregar um
    // parágrafo proibindo exatamente o que ele acabou de pedir faria o prompt
    // brigar consigo mesmo na frente do modelo.
    const p = buildImagePrompt({ title: 'Codex vs Claude Code', userPrompt: 'quero um split screen' });
    expect(p).not.toMatch(/RIVALRY FRAMING/);
    expect(p).toContain('Additional art direction: quero um split screen.');
  });

  it('a cláusula curta anti-simetria fica no texto SEMPRE presente', () => {
    // É a rede para o falso negativo: "a guerra entre X e Y" não dispara o
    // bloco, e sem esta frase ficaria sem nada.
    // 🔴 A frase MUDOU nesta rodada: "never a symmetrical two-sides composition"
    // virou "never in two halves of the image", colada no recurso concreto. É
    // mais concreta, está sempre presente do mesmo jeito, e por isso continua
    // cobrindo o falso negativo — que é a única coisa que esta guarda existe
    // para fazer. Uma frase a menos dizendo a mesma coisa duas vezes.
    const semGatilho = buildImagePrompt({ title: 'A guerra entre os agentes de código' });
    expect(semGatilho).not.toMatch(/RIVALRY FRAMING/);
    expect(semGatilho).toMatch(/never in two halves of the image/i);
  });

  it('o bloco de rivalidade não fala de orientação', () => {
    const p = buildImagePrompt({ title: 'Codex vs Claude Code', shape: 'inset-landscape' });
    expect(p).not.toMatch(/vertical/i);
    expect(p).toMatch(/RIVALRY FRAMING/);
  });

  it('determinismo: a detecção não varia entre chamadas', () => {
    const entrada = { title: 'Codex vs Claude Code', description: 'Quem ganha?' };
    const primeira = buildImagePrompt(entrada);
    for (let i = 0; i < 50; i++) expect(buildImagePrompt(entrada)).toBe(primeira);
  });
});

describe('a limpeza não desfez o que já funcionava', () => {
  it('🔴 o Identity Mode está INTEIRO — é o único módulo aprovado em pixel', () => {
    const sub = camada(buildImagePrompt({ title: 'T', hasReference: true }), 'SUBJECT');
    for (const trecho of [
      'If the supplied reference photograph shows a person',
      'IDENTITY LOCKED', 'BODY POSE UNLOCKED', 'FACE ANGLE CONSERVATIVE',
      'exact real person', 'do not beautify', 'do not redesign facial features',
      'face shape', 'hairline', 'eyebrows', 'eyelids', 'eye spacing', 'nostrils',
      'lip proportions', 'jaw', 'chin', 'ears', 'facial hair', 'natural asymmetry',
      'defines WHO the person is', 'does not define the original selfie angle',
      'extreme orientation', 'near-frontal or three-quarter',
      'flat frontal mask', 'anatomically coherent',
    ]) {
      expect(sub).toContain(trecho);
    }
  });

  it('o dark manteve o refino, e o full-bleed manteve o conserto', () => {
    const p = buildImagePrompt({ title: 'T', shape: 'full-bleed', surface: 'dark' });
    const arte = camada(p, 'ART DIRECTION');
    expect(arte).toMatch(/rich shadows/i);
    expect(arte).toMatch(/selective lighting/i);
    expect(arte).toMatch(/environment stays readable/i);
    expect(arte).toMatch(/uniformly dark/i);
    expect(arte).not.toMatch(/let the darkest areas fall to near-black/i);
    expect(camada(p, 'COMPOSITION')).toMatch(/fill the entire photographic frame/i);
    expect(p).not.toMatch(/\bleave\b|\bblank\b|\bempty\b|\breserve\b/i);
  });

  it('o realismo continua lá, sem lista nova de adjetivos', () => {
    const arte = camada(buildImagePrompt({ title: 'T' }), 'ART DIRECTION');
    expect(arte).toMatch(/real human anatomy/i);
    expect(arte).toMatch(/visible pores/i);
    expect(arte).toMatch(/sensor grain/i);
    expect(arte).toMatch(/hyper-clean synthetic perfection/i);
  });

  it('as 6 camadas e a ordem, com rivalidade e referência ligadas', () => {
    const p = buildImagePrompt({
      title: 'OpenAI vs Anthropic',
      description: 'Sam Altman e Dario Amodei estão no centro dessa corrida.',
      hasReference: true, shape: 'full-bleed', surface: 'dark',
      series: { deckTitle: 'D', size: 5, index: 3 }, brand: marca,
    });
    expect(p.split('\n').map((l) => l.split(':')[0])).toEqual([
      'ROLE', 'SUBJECT', 'ART DIRECTION', 'COMPOSITION', 'EXCLUDE', 'OUTPUT',
    ]);
    for (const linha of p.split('\n')) expect(linha).toMatch(/^[A-Z ]+: /);
    expect(p).toMatch(/RIVALRY FRAMING/);
    expect(p).toMatch(/IDENTITY LOCKED/);
    expect(p).toMatch(/tighter tactile detail/i);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * O REPERTÓRIO DE RECURSOS VISUAIS — terceira rodada, e a que achou a causa.
 *
 * O refinamento anterior ("nomeie a RELAÇÃO e fotografe a relação") NÃO
 * resolveu: a mesma copy de fitness voltou com homem exausto no banco e homem
 * exausto ajoelhado. Mesmo defeito, outra pose.
 *
 * O TESTE DE CONTROLE revelou a causa. O Rafael digitou a cena à mão no prompt
 * livre — "homem correndo com muito esforço dentro de uma enorme roda de metal,
 * preso no mesmo lugar" — e o modelo entregou a imagem certa DE PRIMEIRA.
 * Conclusão: o gpt-image-2 DESENHA ótimo. O que ele não faz é o salto de
 * raciocínio de virar ideia abstrata em cena. Toda a instrução anterior era uma
 * ORDEM DE RACIOCÍNIO — e por isso o modelo captava o CLIMA da frase (cansaço)
 * e desenhava o clima.
 *
 * O que faltava: "pouco progresso" NÃO TEM APARÊNCIA. Esforço tem — suor, peso,
 * músculo. A ausência de progresso só existe se alguém inventar um OBJETO que a
 * torne visível. Faltava REPERTÓRIO, não mais conceito.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('repertório — o método concreto que faltava', () => {
  it('ensina a inventar um RECURSO FOTOGRÁFICO para o lado invisível', () => {
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/One side of a relation often has no natural appearance/);
    expect(sub).toMatch(/concrete photographic device that makes the invisible side visible/);
  });

  it('as cinco FAMÍLIAS de recurso estão presentes', () => {
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    for (const familia of [
      'a mechanism that always returns to its start',
      'a marker left unchanged beside a repeated action',
      'a measure that refuses to rise',
      'two identical states separated by time',
      'a tiny cause with an enormous consequence',
    ]) {
      expect(sub).toContain(familia);
    }
  });

  it('🔴 o recurso une os dois lados em UM objeto, nunca em duas metades', () => {
    // É a sacada que resolve a tensão que a entrega passada registrou como
    // risco: a exigência dos dois lados empurrava para composição partida ao
    // meio, contra a regra anti-simetria. Num único objeto, as duas coisas
    // convivem sem dividir o quadro.
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub).toMatch(/carry BOTH sides inside one object or situation/);
    expect(sub).toMatch(/never in two halves of the image/);
  });

  it('🔴 NENHUMA cena literal e NENHUMA palavra de tema no prompt inteiro', () => {
    // Se "roda de hamster" entrasse aqui, todo carrossel de fitness sairia com
    // roda de hamster — repetitivo e óbvio. O que entra é a FAMÍLIA. Este é o
    // teste que impede alguém de "consertar" um caso hardcodando a cena dele.
    const proibidas = [
      'gym', 'workout', 'treadmill', 'hamster', 'wheel', 'money', 'safe', 'vault',
      'calendar', 'escalator', 'staircase', 'clock', 'mirror', 'tape measure',
      'academia', 'esteira', 'dinheiro', 'cofre', 'roda',
    ];
    // 🔴 'scale' fica FORA desta lista, e o motivo importa: ele existe no prompt
    // em "perspective, scale, tension" (ART DIRECTION) e "sense of scale" (shot
    // cue), onde significa PROPORÇÃO — direção fotográfica legítima, não uma
    // balança. Varrer a palavra crua acusaria as duas e me obrigaria a estragar
    // texto que funciona para o teste passar.
    // A copy do usuário entra citada no SUBJECT, então uma copy sobre dinheiro
    // contém "dinheiro" — e isso é correto, não vazamento. O que este teste
    // varre é o prompt DESCONTADA a citação: as instruções que NÓS escrevemos.
    const semACopy = (entrada: Parameters<typeof buildImagePrompt>[0]) => {
      const p = buildImagePrompt(entrada);
      const citada = [entrada.title, entrada.description].filter(Boolean).join(' — ');
      return p.replace(citada, '<<COPY>>');
    };
    for (const entrada of [
      { title: 'Você pode estar treinando muito e evoluindo pouco' },
      { title: 'Guardar dinheiro não vai te deixar rico' },
      { title: 'Rotina matinal' },
      { title: 'Codex vs Claude Code' },
      { title: 'T', hasReference: true },
    ]) {
      const p = semACopy(entrada);
      for (const palavra of proibidas) {
        expect(new RegExp(`\\b${palavra}\\b`, 'i').test(p)).toBe(false);
      }
    }
  });

  it('🔴 e quando a palavra de tema aparece, ela vem SÓ da copy citada', () => {
    // O outro lado da mesma prova: "dinheiro" existe no prompt de uma copy
    // sobre dinheiro, e existe exatamente uma vez — dentro das aspas do
    // contexto semântico. Se aparecesse duas, alguma instrução nossa teria
    // absorvido o tema.
    const p = buildImagePrompt({ title: 'Guardar dinheiro não vai te deixar rico' });
    expect(p.match(/dinheiro/gi)).toHaveLength(1);
    expect(p).toContain('SEMANTIC CONTEXT ONLY: "Guardar dinheiro não vai te deixar rico"');
  });

  it('🔴 o repertório é o MESMO para qualquer tema — nenhum assunto tem tratamento especial', () => {
    const trecho = (title: string) => {
      const sub = camada(buildImagePrompt({ title }), 'SUBJECT');
      return sub.slice(sub.indexOf('One side of a relation'), sub.indexOf('CONCEPT VALIDATION'));
    };
    const fitness = trecho('Você pode estar treinando muito e evoluindo pouco');
    expect(fitness).toBe(trecho('Guardar dinheiro não vai te deixar rico'));
    expect(fitness).toBe(trecho('Rotina matinal'));
    expect(fitness).not.toBe('');
  });

  it('o repertório vem DEPOIS da relação — método sem relação nomeada não tem alvo', () => {
    const sub = camada(buildImagePrompt({ title: 'T' }), 'SUBJECT');
    expect(sub.indexOf('Then name the RELATION'))
      .toBeLessThan(sub.indexOf('One side of a relation'));
  });

  it('não fala de orientação, e não reabre área vazia', () => {
    const p = buildImagePrompt({ title: 'T', shape: 'inset-landscape' });
    expect(p).not.toMatch(/vertical|portrait/i);
    expect(buildImagePrompt({ title: 'T', shape: 'full-bleed' }))
      .not.toMatch(/\bleave\b|\bblank\b|\bempty\b|\breserve\b/i);
  });

  it('determinismo com o repertório dentro', () => {
    const entrada = {
      title: 'Você pode estar treinando muito e evoluindo pouco',
      shape: 'full-bleed' as const, surface: 'dark' as const, hasReference: true,
      series: { deckTitle: 'D', size: 5, index: 2 },
    };
    const primeira = buildImagePrompt(entrada);
    for (let i = 0; i < 100; i++) expect(buildImagePrompt(entrada)).toBe(primeira);
    expect(primeira.split('\n').map((l) => l.split(':')[0])).toEqual([
      'ROLE', 'SUBJECT', 'ART DIRECTION', 'COMPOSITION', 'EXCLUDE', 'OUTPUT',
    ]);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * O "X" DE CONFRONTO — achado no USO REAL, não em teste.
 *
 * O Rafael escreveu "Codex x Claude Code" e o bloco de rivalidade não entrou:
 * a detecção só conhecia vs, versus, contra e quem ganha. No Brasil o X é a
 * forma MAIS comum de escrever confronto — "Flamengo x Vasco". Naquela geração
 * o resultado saiu bom mesmo assim, mas só porque o prompt livre descrevia a
 * cena; sem isso o clichê do pôster passaria batido.
 *
 * 🔴 O X CRU SERIA PIOR QUE A FALHA. Um `\bx\b` solto pega dimensão
 * ("1080 x 1350" — que é o tamanho dos próprios slides do produto, então
 * APARECE), multiplicação ("10 x mais rápido") e frequência ("3 x por semana",
 * comuníssimo em copy de hábito). A regra que separa: só vale como confronto
 * com LETRA dos dois lados. Dígito de qualquer lado desqualifica.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('rivalidade — o X de confronto, e os três falsos positivos que ele traria', () => {
  const dispara = (entrada: Parameters<typeof buildImagePrompt>[0]) =>
    /RIVALRY FRAMING/.test(buildImagePrompt(entrada));

  it('🔴 DISPARA com letra dos dois lados', () => {
    for (const title of [
      'Codex x Claude Code',
      'Flamengo x Vasco',
      'OpenAI x Anthropic',
      'Aparência x realidade',
      'Codex X Claude Code',
    ]) {
      expect(dispara({ title })).toBe(true);
    }
  });

  it('🔴 NÃO dispara com dígito de qualquer lado', () => {
    for (const title of [
      '1080 x 1350',
      '10 x mais rápido',
      '3 x por semana',
      'Treino 5 x na semana',
      'x',
    ]) {
      expect(dispara({ title })).toBe(false);
    }
  });

  it('🔴 os quatro casos que mais preocupavam continuam SEM disparar', () => {
    // Nenhum deles pode passar a disparar por causa do X. São os que o limite
    // de palavra do `contra` e do `vs` já protegia.
    for (const title of [
      'CONTRADIÇÃO',
      'O contraste entre teoria e prática',
      'Como encontrar seu nicho',
      'Vsauce e o algoritmo',
    ]) {
      expect(dispara({ title })).toBe(false);
    }
  });

  it('o sinal de multiplicação unicode segue a MESMA regra', () => {
    expect(dispara({ title: 'Codex × Claude Code' })).toBe(true);
    expect(dispara({ title: '1080 × 1350' })).toBe(false);
  });

  it('o X vale na descrição e no prompt do usuário, como os outros gatilhos', () => {
    expect(dispara({ title: 'Agentes', description: 'Codex x Claude Code' })).toBe(true);
    expect(dispara({ title: 'Agentes', userPrompt: 'faça Codex x Claude' })).toBe(true);
  });

  it('e continua desligando com pedido explícito de split screen', () => {
    expect(dispara({ title: 'Codex x Claude Code', userPrompt: 'quero um split screen' })).toBe(false);
  });

  it('o X não mexeu nos gatilhos antigos', () => {
    for (const title of ['Codex vs Claude Code', 'Codex versus Claude', 'Codex contra Claude', 'Quem ganha?']) {
      expect(dispara({ title })).toBe(true);
    }
  });

  it('determinismo do gatilho novo', () => {
    const entrada = { title: 'Codex x Claude Code' };
    const primeira = buildImagePrompt(entrada);
    for (let i = 0; i < 50; i++) expect(buildImagePrompt(entrada)).toBe(primeira);
  });
});
