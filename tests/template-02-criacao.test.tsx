import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template02Slide from '@/components/slides/Template02Slide';
import {
  TEMPLATE_02_DEFAULT_MODELS,
  TEMPLATE_02_EXTRA_SLOTS,
  TEMPLATE_02_MODELS,
  TEMPLATE_02_PRIMARY_SLOTS,
  TEMPLATE_02_SPEC,
  Template02Slots,
  template02DefaultSlots,
  template02HeaderSlots,
  template02HighlightLine,
  template02ModelAt,
  template02ModelOf,
  template02NewSlideSlots,
  template02NextModel,
  template02Overflows,
  template02SlotsFromContent,
  template02TextSlotsForModel,
  template02Addendum,
  template02Limits,
} from '@/lib/templates/template-02';
import { TEMPLATE_SIDEBAR_CONFIG } from '@/components/editor/sidebar/panels';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide, SlideStyle } from '@/types';

/**
 * TEMPLATE 2 × CRIAÇÃO (fatia S3).
 *
 * Duas regras duras herdadas do Template 1, e a razão de cada uma:
 *
 * 1. **A geração não escreve estilo.** Foi o bug que apagou os degradês do T1:
 *    a paleta da marca do onboarding era gravada em todo slide, virava "escolha
 *    do usuário" por comparação de valor e pintava por cima do template.
 * 2. **Deck gerado não exibe copy do spec.** Todo slot de texto sai com o que a
 *    IA escreveu ou com string VAZIA — nunca com o FC Barcelona.
 */

/** Textos ilustrativos que jamais podem aparecer num deck gerado. */
const COPY_DO_SPEC = [
  'FC BARCELONA',
  'FC Barcelona',
  'Barcelona',
  'OANDRELONA',
  'BRANDING & DESIGN DE MARCA',
  'CHAMADA PARA AÇÃO',
  'NOVA TIPOGRAFIA',
  'Mais que um clube',
  'O caos visual',
];

function markup(model: number, slots: Template02Slots): string {
  const slide = {
    ...DEFAULT_SLIDE,
    id: 's',
    position: 0,
    templateModel: model,
    templateSlots: slots,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  } as Slide;
  return renderToStaticMarkup(
    <Template02Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={0}
      totalSlides={5}
    />
  );
}

/** O que o wizard monta para o slide `i` de um deck gerado. */
function slotsGerados(i: number, ai: { title: string; description: string; extras?: Record<string, string> }, marca = 'Arke Studio', handle = 'arkebranding') {
  const model = template02ModelAt(i);
  return {
    model,
    slots: {
      ...template02SlotsFromContent(model, {
        title: ai.title,
        description: ai.description,
        extras: ai.extras,
      }),
      ...template02HeaderSlots(marca, handle),
    } as Template02Slots,
  };
}

describe('TEMPLATE 2 — modelo do deck gerado', () => {
  it('a sequência gravada é a `sequenciaPadrao` do spec', () => {
    expect([0, 1, 2, 3, 4].map(template02ModelAt)).toEqual(TEMPLATE_02_DEFAULT_MODELS);
    expect(TEMPLATE_02_DEFAULT_MODELS).toEqual([1, 2, 3, 2, 3]);
  });

  it('continua alternando além dos 5 — o deck do T2 é ABERTO', () => {
    // Ao contrário do T1, não há clamp: o slide 9 não vira "o último modelo".
    const dez = Array.from({ length: 10 }, (_, i) => template02ModelAt(i));
    expect(dez).toEqual([1, 2, 3, 2, 3, 2, 3, 2, 3, 2]);
    for (let i = 2; i < dez.length; i++) expect(dez[i]).not.toBe(dez[i - 1]);
  });

  it('o modelo gravado vence a posição depois de reordenar', () => {
    // É por isso que a geração GRAVA `templateModel` em vez de deixar sair da
    // posição: mover a capa para o fim não pode transformá-la noutro modelo.
    expect(template02ModelOf({ templateModel: 1 }, 4)).toBe(1);
    expect(template02ModelOf({ templateModel: 3 }, 1)).toBe(3);
  });

  it('o estilo `template02` não é deck fixo', () => {
    // `isFixedDeck` é só do T1; se o T2 entrasse ali, o slider de quantidade
    // sumiria e o deck viraria 6 fixos.
    expect(TEMPLATE_02_DEFAULT_MODELS.length).toBe(5);
    const estilos: SlideStyle[] = ['template01', 'template02'];
    expect(estilos.every((e) => TEMPLATE_SIDEBAR_CONFIG[e])).toBe(true);
  });
});

describe('TEMPLATE 2 — a geração não deixa copy do spec', () => {
  it('todo slot de texto do slide sai preenchido, nem que seja vazio', () => {
    for (const model of TEMPLATE_02_MODELS) {
      const slots = template02SlotsFromContent(model, { title: '', description: '' });
      for (const d of template02TextSlotsForModel(model)) {
        expect(slots[d.slot], `${model}/${d.slot}`).toBe('');
      }
    }
  });

  it('um deck gerado renderiza SEM nenhum texto do spec, mesmo com a IA muda', () => {
    for (let i = 0; i < 5; i++) {
      const { model, slots } = slotsGerados(i, { title: '', description: '' });
      const html = markup(model, slots);
      for (const copy of COPY_DO_SPEC) expect(html, `slide ${i}: ${copy}`).not.toContain(copy);
    }
  });

  it('com a IA respondendo, o texto dela é o que aparece', () => {
    const { model, slots } = slotsGerados(1, {
      title: 'Marca não é logo',
      description: 'O logo é a parte mais visível — e a menos importante.',
    });
    const html = markup(model, slots);
    expect(html).toContain('Marca não é logo');
    expect(html).toContain('a menos importante');
    for (const copy of COPY_DO_SPEC) expect(html).not.toContain(copy);
  });

  it('a capa usa `extras` para o marcador e a chamada', () => {
    const { model, slots } = slotsGerados(0, {
      title: 'POR QUE 9 EM CADA 10\nSTARTUPS ERRAM A\nIDENTIDADE VISUAL',
      description: 'ignorada na capa',
      extras: { highlight: 'ERRAM A', cta: 'ARRASTA PRO LADO' },
    });
    expect(model).toBe(1);
    expect(slots['cover.headline']).toContain('STARTUPS ERRAM A');
    expect(slots['cover.highlight']).toBe('ERRAM A');
    expect(slots['cover.cta']).toBe('ARRASTA PRO LADO');
    // E o marcador de fato desenha, numa linha só.
    const html = markup(model, slots);
    expect(html).toContain('data-slot="cover.highlight"');
    expect([...html.matchAll(/data-slot="cover\.highlight"/g)]).toHaveLength(1);
  });

  it('a descrição da capa é descartada — ela não tem bloco de corpo', () => {
    const { slots } = slotsGerados(0, { title: 'CAPA', description: 'texto que não cabe' });
    expect(Object.values(slots)).not.toContain('texto que não cabe');
    expect(TEMPLATE_02_PRIMARY_SLOTS[1].body).toBeUndefined();
  });

  it('sem chamada, a pílula some em vez de sair vazia', () => {
    const { model, slots } = slotsGerados(0, { title: 'CAPA SEM CTA', description: '' });
    expect(slots['cover.cta']).toBe('');
    expect(markup(model, slots)).not.toContain('data-slot="cover.cta"');
  });

  it('os extras da capa apontam para os slots do spec', () => {
    expect(TEMPLATE_02_EXTRA_SLOTS[1]).toEqual({
      highlight: 'cover.highlight',
      cta: 'cover.cta',
    });
    // Os modelos de conteúdo não têm extras: title/description bastam.
    expect(TEMPLATE_02_EXTRA_SLOTS[2]).toBeUndefined();
    expect(TEMPLATE_02_EXTRA_SLOTS[3]).toBeUndefined();
  });

  it('o cabeçalho gerado é a marca do usuário, nunca a do spec', () => {
    const { slots } = slotsGerados(2, { title: 'T', description: 'D' });
    expect(slots['header.category']).toBe('ARKE STUDIO');
    expect(slots['header.handle']).toBe('@ARKEBRANDING');
  });

  it('sem onboarding preenchido, o cabeçalho sai VAZIO', () => {
    const slots = {
      ...template02SlotsFromContent(2, { title: 'T', description: 'D' }),
      ...template02HeaderSlots('', ''),
    };
    expect(slots['header.category']).toBe('');
    expect(slots['header.handle']).toBe('');
    expect(markup(2, slots)).not.toContain('OANDRELONA');
  });

  it('a imagem gerada vai para o slot do modelo', () => {
    expect(
      template02SlotsFromContent(1, { title: 'T', description: '', imageUrl: 'https://x/f.jpg' })
    ).toHaveProperty('cover.image', 'https://x/f.jpg');
    expect(
      template02SlotsFromContent(3, { title: 'T', description: '', imageUrl: 'https://x/f.jpg' })
    ).toHaveProperty('content.image', 'https://x/f.jpg');
  });

  it('o conteúdo de fábrica continua intacto para quem NÃO gerou', () => {
    // É dele que sai a fidelidade de 0px: slide sem `templateSlots` desenha o
    // spec. A regra acima só vale para o deck gerado.
    expect(template02DefaultSlots(2)['content.title']).toBe(
      TEMPLATE_02_SPEC.layouts[1].elementos.find((e) => e.id === 'content.title')?.conteudoExemplo
    );
  });
});

describe('TEMPLATE 2 — o contrato da IA cabe no desenho', () => {
  it('texto no limite do spec não estoura em nenhum modelo', () => {
    const L = (slot: string) => template02Limits(slot);
    const linha = 'a'.repeat(L('cover.headline').maxCharPorLinha!);
    const capa = template02SlotsFromContent(1, {
      title: Array.from({ length: L('cover.headline').maxLinhas! }, () => linha).join('\n'),
      description: '',
      extras: { highlight: linha, cta: 'c'.repeat(L('cover.cta').maxChar!) },
    });
    expect(template02Overflows(1, capa)).toEqual([]);

    const conteudo = template02SlotsFromContent(2, {
      title: 't'.repeat(L('content.title').maxChar!),
      description: 'd'.repeat(L('content.body').maxChar!),
    });
    expect(template02Overflows(2, conteudo)).toEqual([]);
  });

  it('o marcador que a IA escolheu tem de estar numa linha da headline', () => {
    // Se não estiver, ele não desenha — e o usuário não descobre por quê. É a
    // regra que o addendum manda o modelo respeitar.
    const bom = slotsGerados(0, {
      title: 'LINHA UM\nLINHA DOIS',
      description: '',
      extras: { highlight: 'LINHA DOIS' },
    }).slots;
    expect(template02HighlightLine(bom['cover.headline'], bom['cover.highlight'])).toBe(1);

    const ruim = slotsGerados(0, {
      title: 'LINHA UM\nLINHA DOIS',
      description: '',
      extras: { highlight: 'UM\nLINHA' },
    }).slots;
    expect(template02HighlightLine(ruim['cover.headline'], ruim['cover.highlight'])).toBe(-1);
    expect(markup(1, ruim)).not.toContain('data-slot="cover.highlight"');
  });
});

describe('TEMPLATE 2 — adicionar slide', () => {
  it('o modelo sugerido é o que continua a alternância', () => {
    // Pedido do Rafael: "se o usuário quiser adicionar mais slides, vai alternar
    // entre o modelo do slide 2 e o modelo do slide 3".
    expect(template02NextModel(1)).toBe(2); // deck só com a capa
    expect(template02NextModel(2)).toBe(3);
    expect(template02NextModel(3)).toBe(2);
    // Num deck padrão de 5 (termina no modelo 3), o sugerido é o 2.
    const ultimo = TEMPLATE_02_DEFAULT_MODELS[TEMPLATE_02_DEFAULT_MODELS.length - 1];
    expect(template02NextModel(ultimo)).toBe(2);
  });

  it('o slide novo nasce com cabeçalho lorem independente e dentro dos limites', () => {
    const herdado = { 'header.category': 'ARKE STUDIO', 'header.handle': '@ARKEBRANDING' };
    for (const model of TEMPLATE_02_MODELS) {
      const slots = template02NewSlideSlots(model, herdado);
      expect(slots['header.category']).toBe('LOREM IPSUM');
      expect(slots['header.handle']).toBe('@LOREMIPSUM');
      expect(template02Overflows(model, slots)).toEqual([]);
      const html = markup(model, slots);
      for (const copy of COPY_DO_SPEC) expect(html, `${model}: ${copy}`).not.toContain(copy);
    }
  });

  it('o slide novo nasce sem imagem — quem escolhe é o usuário', () => {
    const slots = template02NewSlideSlots(2);
    expect(slots['content.image']).toBeUndefined();
    expect(markup(2, slots)).toContain('>Imagem<');
  });
});

describe('TEMPLATE 2 — addendum do prompt', () => {
  const addendum = template02Addendum();

  it('os limites saem dos EFETIVOS, não redigitados', () => {
    // Uma cópia à mão envelheceria em silêncio no primeiro ajuste; lendo da
    // fonte única, o prompt acompanha sozinho. Depois da fatia 5 isso importa
    // mais ainda: pedir 17 car./linha à IA e aceitar 25 na barra seria mentira.
    expect(addendum).toContain(String(template02Limits('cover.headline').maxCharPorLinha));
    expect(addendum).toContain(String(template02Limits('cover.headline').maxLinhas));
    expect(addendum).toContain(String(template02Limits('cover.cta').maxChar));
    expect(addendum).toContain(String(template02Limits('content.title').maxChar));
    expect(addendum).toContain(String(template02Limits('content.body').maxChar));
  });

  it('diz as duas regras que não são sugestão', () => {
    // 1) a headline vaza a caixa acima do limite POR LINHA;
    expect(addendum).toMatch(/POR LINHA/);
    expect(addendum).toContain('1080px');
    expect(addendum).not.toContain('836px');
    // 2) o marcador tem de caber numa única linha, senão não aparece.
    expect(addendum).toMatch(/ÚNICA linha da headline/);
    expect(addendum).toMatch(/marcador simplesmente não aparece/);
  });

  it('explica que a capa não tem descrição', () => {
    expect(addendum).toMatch(/NÃO tem descrição/);
    expect(addendum).toMatch(/"description" do slide 1 é ignorada/);
  });

  it('usa o mecanismo `extras`, sem campo novo no contrato', () => {
    expect(addendum).toContain('"extras"');
    expect(addendum).toContain('"highlight"');
    expect(addendum).toContain('"cta"');
  });

  it('proíbe copy que não seja do tema pedido', () => {
    expect(addendum).toMatch(/Nunca devolva texto de exemplo/);
  });
});
