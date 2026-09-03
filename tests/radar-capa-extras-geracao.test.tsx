// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Template02Slide from '@/components/slides/Template02Slide';
import {
  template02Addendum,
  template02HighlightTerms,
  template02ModelAt,
  template02SlotsFromContent,
} from '@/lib/templates/template-02';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

/**
 * A CAPA DO RADAR: marcador e chamada para ação, do prompt até o pixel.
 *
 * ⚠️ ESTE ARQUIVO NÃO ACOMPANHA UM CONSERTO. Ele tranca um caminho que JÁ
 * funciona, e o registro de por que ele existe importa mais que o de costume:
 *
 * A T5 concluiu que "não existe addendum de template02 no prompt". ERRADO — eu
 * escrevi isso e me corrijo aqui. O `template02Addendum()` existe desde o
 * commit que integrou o template 2 (6e79153), está fiado em
 * app/api/generate-carousel/route.ts e já manda a IA devolver
 * `extras: { highlight, cta }` para a capa, com os limites LIDOS do spec. O
 * engano veio de procurar a constante `TEMPLATE_02_ADDENDUM` dentro do route:
 * o template 1 usa uma constante local, o 2 e o 3 usam uma FUNÇÃO que mora no
 * módulo do próprio template. Grep no lugar errado, conclusão errada.
 *
 * Medida a cadeia inteira, ela está íntegra: o addendum pede os extras, o route
 * devolve o JSON sem podar campos, o wizard repassa `extras` e
 * `template02SlotsFromContent` mapeia para `cover.highlight` e `cover.cta`.
 *
 * O que FALTAVA era teste num elo só — a FIAÇÃO no route. O template 3 tem esse
 * teste (tests/template-03-ia-export.test.ts), o template 2 não tinha. Quem
 * apagasse a fiação do T2 não veria nenhuma luz vermelha, e o sintoma que o
 * Rafael relatou (capa sem marcador e sem chamada) voltaria calado. É esse
 * buraco que este arquivo fecha, junto do render condicional da pílula, que
 * também não tinha teste.
 */

// Caminho a partir da raiz do projeto: neste arquivo o ambiente é jsdom, e lá
// `import.meta.url` não é uma URL `file:` — ler por ela quebra na carga.
const route = readFileSync(
  join(process.cwd(), 'app/api/generate-carousel/route.ts'),
  'utf8',
);

/** A capa como ela sai da geração, com o que a IA devolveu em `extras`. */
function capaGerada(extras?: Record<string, string>): Slide {
  const model = template02ModelAt(0);
  const slots = template02SlotsFromContent(model, {
    title: 'CINCO ERROS QUE\nTRAVAM SEU CRESCIMENTO',
    description: '',
    extras,
  });
  return {
    ...DEFAULT_SLIDE,
    id: 'capa',
    position: 0,
    templateModel: model,
    templateSlots: slots,
  } as Slide;
}

function desenha(slide: Slide) {
  const { container } = render(
    <Template02Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={0}
      totalSlides={5}
    />,
  );
  return {
    cta: container.querySelector('[data-slot="cover.cta"]'),
    marcados: Array.from(container.querySelectorAll('[data-slot="cover.highlight"]')),
  };
}

afterEach(cleanup);

describe('a rota consome o addendum do módulo do template 2', () => {
  // O elo que não tinha teste. O T3 já tinha o equivalente; o T2 ficou de fora,
  // e é justamente a linha cuja remoção reproduz a queixa do Rafael.
  it('importa e aplica template02Addendum quando o estilo é template02', () => {
    expect(route).toContain("import { template02Addendum } from '@/lib/templates/template-02';");
    expect(route).toContain("body.style === 'template02' ? template02Addendum() : ''");
  });

  it('o addendum é condicionado ao estilo — os outros não o recebem', () => {
    // Sem a condição, todo carrossel levaria as regras da capa do Radar junto.
    expect(route).not.toContain('${template02Addendum()}');
    expect(route).toContain("body.style === 'template01' ? TEMPLATE_01_ADDENDUM : ''");
    expect(route).toContain("body.style === 'template03' ? template03Addendum() : ''");
  });

  it('o addendum pede os DOIS extras da capa, e só os que o mapeamento conhece', () => {
    const addendum = template02Addendum();
    expect(addendum).toContain('"extras"');
    expect(addendum).toContain('"highlight"');
    expect(addendum).toContain('"cta"');
    // `TEMPLATE_02_EXTRA_SLOTS[1]` só conhece estes dois. Pedir um terceiro
    // campo à IA gastaria token para produzir texto que ninguém lê.
    expect(addendum).not.toContain('"eyebrow"');
    expect(addendum).not.toContain('"kicker"');
  });
});

describe('os extras da IA chegam aos slots da capa', () => {
  it('highlight e cta viram cover.highlight e cover.cta', () => {
    const slots = capaGerada({ highlight: 'CINCO ERROS', cta: 'ME SEGUE PRA MAIS' })
      .templateSlots!;

    expect(slots['cover.highlight']).toBe('CINCO ERROS');
    expect(slots['cover.cta']).toBe('ME SEGUE PRA MAIS');
    // A headline continua sendo o `title`, com a quebra escrita pela IA.
    expect(slots['cover.headline']).toContain('\n');
  });

  it('sem extras, os dois slots nascem vazios — nunca com a copy do spec', () => {
    const slots = capaGerada().templateSlots!;

    // O texto de fábrica ("CHAMADA PARA AÇÃO", o headline do FC Barcelona) não
    // pode sobrar num carrossel gerado: vazio é melhor que ilustrativo.
    expect(slots['cover.highlight']).toBe('');
    expect(slots['cover.cta']).toBe('');
  });
});

describe('o que a capa desenha, no fim da cadeia', () => {
  it('com cta preenchida, a pílula aparece com o texto da IA', () => {
    const { cta } = desenha(capaGerada({ highlight: 'CINCO ERROS', cta: 'ME SEGUE PRA MAIS' }));

    expect(cta, 'a pílula de CTA não foi desenhada').not.toBeNull();
    expect(cta!.textContent).toBe('ME SEGUE PRA MAIS');
  });

  it('com cta vazia, a pílula NÃO existe — é o estado que o Rafael relatou', () => {
    const { cta } = desenha(capaGerada());

    expect(cta).toBeNull();
  });

  it('o marcador pinta o trecho pedido, e só ele', () => {
    const { marcados } = desenha(capaGerada({ highlight: 'CINCO ERROS', cta: 'VAI' }));

    expect(marcados).toHaveLength(1);
    expect(marcados[0].textContent).toBe('CINCO ERROS');
  });
});

describe('termo de destaque que não está na headline', () => {
  /**
   * Comportamento MEDIDO antes de decidir, não escolhido: o termo é ignorado no
   * mapeamento e a geração segue. É o que o próprio addendum promete à IA ("se
   * não estiver, o marcador simplesmente não aparece"), então não há nada a
   * mudar — só a travar, porque quebrar a geração por causa de um marcador
   * seria trocar um defeito cosmético por um carrossel perdido.
   */
  it('o texto vai para o slot, mas nada é marcado — e a headline fica intacta', () => {
    const slide = capaGerada({ highlight: 'PALAVRA QUE NAO EXISTE', cta: 'VAI' });
    const { marcados, cta } = desenha(slide);

    expect(slide.templateSlots!['cover.highlight']).toBe('PALAVRA QUE NAO EXISTE');
    expect(marcados).toHaveLength(0);
    // O resto da capa não é punido pelo termo que não casou.
    expect(cta!.textContent).toBe('VAI');
  });

  it('numa lista, os termos que casam continuam valendo', () => {
    const { marcados } = desenha(
      capaGerada({ highlight: 'CINCO ERROS, PALAVRA QUE NAO EXISTE', cta: 'VAI' }),
    );

    expect(template02HighlightTerms('CINCO ERROS, PALAVRA QUE NAO EXISTE')).toEqual([
      'CINCO ERROS',
      'PALAVRA QUE NAO EXISTE',
    ]);
    expect(marcados).toHaveLength(1);
    expect(marcados[0].textContent).toBe('CINCO ERROS');
  });
});
