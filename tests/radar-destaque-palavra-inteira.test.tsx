// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Template02Slide from '@/components/slides/Template02Slide';
import {
  template02HighlightLine,
  template02HighlightParts,
  template02IndexOfWholeWord,
  template02MissingHighlightTerms,
} from '@/lib/templates/template-02';
import {
  headlineWords,
  highlightWordKey,
  selectedHighlightWords,
} from '@/components/editor/sidebar/HighlightWordChips';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

/**
 * O DESTAQUE DO RADAR SÓ CASA PALAVRA INTEIRA.
 *
 * Bug achado pelo Rafael em 03/09/2026, palavras dele: *"no template do Radar,
 * na aba de destaque: eu selecionei a palavra 'O' e ele selecionou também o 'O'
 * da palavra 'GANCHOS'. Isso não pode acontecer. Se eu selecionei aquilo, é só
 * aquilo."*
 *
 * A causa era `line.indexOf(t, cursor)` em `template02HighlightParts`: busca de
 * SUBSTRING, sem nenhuma noção de palavra. Termo curto casava dentro de
 * qualquer palavra que o contivesse.
 *
 * 🔴 A MEDIÇÃO É NO RENDER, não só na função. O que o Rafael viu foi a tarja
 * pintada em cima de "GANCH[O]S" — contar `data-slot="cover.highlight"` no DOM
 * é o que reproduz a queixa dele. Os casos de unidade abaixo existem para dizer
 * POR QUE, não no lugar disso.
 */

afterEach(cleanup);

const HEADLINE_DO_RAFAEL = '10 GANCHOS PARA A PRIMEIRA LINHA QUE FAZ PARAR O FEED';

function capa(slots: Record<string, string>): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 'capa',
    position: 0,
    templateModel: 1,
    templateSlots: slots,
  } as Slide;
}

/** Os trechos que o render de fato marcou, na ordem em que aparecem. */
function marcados(slide: Slide): string[] {
  const { container } = render(
    <Template02Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={0}
      totalSlides={5}
    />,
  );
  return Array.from(container.querySelectorAll('[data-slot="cover.highlight"]')).map(
    (el) => el.textContent ?? '',
  );
}

describe('o caso exato do Rafael', () => {
  it('o "O" de GANCHOS NÃO é marcado — saem exatamente 3 marcações', () => {
    const saiu = marcados(
      capa({ 'cover.headline': HEADLINE_DO_RAFAEL, 'cover.highlight': 'PARAR, O, FEED' }),
    );

    expect(saiu).toEqual(['PARAR', 'O', 'FEED']);
    expect(saiu).toHaveLength(3);
  });

  it('a palavra GANCHOS chega inteira ao texto, sem ser partida', () => {
    // O sintoma que ele fotografou: a headline saía como "GANCH" + tarja + "S".
    // Se a palavra estiver inteira num pedaço só, ela não foi partida.
    const partes = template02HighlightParts(HEADLINE_DO_RAFAEL, ['PARAR', 'O', 'FEED']);
    const naoMarcado = partes.filter((p) => !p.marked).map((p) => p.text);

    expect(naoMarcado.some((t) => t.includes('GANCHOS'))).toBe(true);
    expect(partes.some((p) => p.marked && p.text !== 'PARAR' && p.text !== 'O' && p.text !== 'FEED'))
      .toBe(false);
  });

  it('o "A" sozinho também não invade PARA nem PARAR', () => {
    // Mesmo bug, termo ainda mais curto: em "10 GANCHOS PARA A PRIMEIRA" o "A"
    // tem lugares errados para casar ANTES do certo.
    //
    // 🔴 CONTAR O TEXTO MARCADO NÃO BASTA AQUI, e a prova de falha-antes foi
    // quem mostrou: com o bug, o trecho marcado também sai com o texto "A" —
    // só que é o "A" de dentro de "PARA". Os dois estados dão `['A']`. O que
    // separa um do outro é a POSIÇÃO, então é a posição que este caso mede.
    const partes = template02HighlightParts(HEADLINE_DO_RAFAEL, ['A']);
    const antesDoMarcado = partes.slice(0, partes.findIndex((p) => p.marked))
      .map((p) => p.text)
      .join('');

    // Tudo o que vem antes da tarja tem de conter PARA inteiro e intacto: se a
    // marcação tivesse caído dentro dele, "PARA" estaria partido em "P" + "AR".
    expect(antesDoMarcado).toContain('10 GANCHOS PARA ');
    expect(partes.filter((p) => p.marked)).toEqual([{ text: 'A', marked: true }]);
  });
});

describe('acento — a razão de não usar \\b', () => {
  /**
   * 🔴 ESTE CASO GUARDA UMA ESCOLHA DE IMPLEMENTAÇÃO, e é por isso que ele
   * afirma o que `\b` FARIA. O `\b` do JavaScript é ASCII: ele enxerga
   * fronteira de palavra no meio de qualquer palavra acentuada. Em "AÇÃO", o
   * `\b` marca em volta do "Ç" e do "Ã", então `/\bA\b/` casa com o "A"
   * inicial — e o bug do Rafael voltaria, só que apenas nas palavras com
   * acento, que é a pior forma de ele voltar.
   */
  it('o \\b do JavaScript REALMENTE falharia aqui — a premissa, medida', () => {
    expect(/\bA\b/u.test('AÇÃO')).toBe(true);
    expect(/\bO\b/u.test('AVIÃO')).toBe(true);
  });

  it('a implementação de verdade recusa os dois', () => {
    expect(template02IndexOfWholeWord('AÇÃO RÁPIDA', 'A')).toBe(-1);
    expect(template02IndexOfWholeWord('UM AVIÃO', 'O')).toBe(-1);
  });

  it('no render, o termo curto não invade a palavra acentuada', () => {
    expect(marcados(capa({ 'cover.headline': 'UMA AÇÃO RÁPIDA', 'cover.highlight': 'A' })))
      .toEqual([]);
    // E a palavra acentuada inteira continua marcável.
    expect(marcados(capa({ 'cover.headline': 'UMA AÇÃO RÁPIDA', 'cover.highlight': 'AÇÃO' })))
      .toEqual(['AÇÃO']);
  });

  it('acento decomposto (NFD) não abre uma brecha pelos fundos', () => {
    // Texto colado de fora pode chegar decomposto: "Á" = "A" + acento separado.
    // Sem `\p{M}` na classe, o vizinho do "A" seria a marca de acento, que não
    // é letra nem dígito, e o termo "A" casaria dentro do "Á".
    const nfd = 'UMA ÁGUA CLARA';
    expect(nfd.normalize('NFC')).toContain('ÁGUA');
    expect(template02IndexOfWholeWord(nfd, 'A')).toBe(-1);
  });
});

describe('o que NÃO podia quebrar junto', () => {
  it('termo de DUAS palavras continua casando como um só', () => {
    // A fronteira é do termo inteiro, não de cada palavra dele.
    expect(marcados(capa({ 'cover.headline': HEADLINE_DO_RAFAEL, 'cover.highlight': 'PARAR O FEED' })))
      .toEqual(['PARAR O FEED']);
  });

  it('termo colado em pontuação continua casando', () => {
    // Ponto, vírgula e afins não são letra nem dígito: a regra já os aceita.
    for (const [headline, esperado] of [
      ['ELE PAROU O FEED.', 'FEED'],
      ['O FEED, ENFIM', 'FEED'],
      ['PARE O FEED!', 'FEED'],
      ['(O FEED)', 'FEED'],
    ] as const) {
      expect(
        marcados(capa({ 'cover.headline': headline, 'cover.highlight': esperado })),
        `falhou em ${headline}`,
      ).toEqual([esperado]);
      cleanup();
    }
  });

  it('o desempate por termo mais longo continua valendo', () => {
    // "MARCA" antes de "MAR", na mesma posição. Antes do fix o "MAR" nem
    // deveria casar em "MARCA" — mas o desempate existe para termos que casam
    // de verdade no mesmo ponto, e a lógica dele não foi tocada.
    const parts = template02HighlightParts('MAR MARCA FORTE', ['MAR', 'MARCA']);
    expect(parts.filter((p) => p.marked).map((p) => p.text)).toEqual(['MAR', 'MARCA']);
  });

  it('cada termo continua sendo usado UMA vez só', () => {
    // Comportamento antigo, deliberadamente não mexido nesta tarefa.
    const parts = template02HighlightParts('A CASA E A CASA', ['CASA']);
    expect(parts.filter((p) => p.marked)).toHaveLength(1);
  });

  it('as funções vizinhas usam a MESMA noção de casar', () => {
    // Se elas continuassem com `includes`, diriam que a linha tem o marcador e
    // que nada está faltando — enquanto o render não pintaria nada. Dois
    // critérios diferentes para a mesma pergunta é o estado pior que o bug.
    expect(template02HighlightLine('10 GANCHOS\nOUTRA LINHA', 'O')).toBe(-1);
    expect(template02MissingHighlightTerms('10 GANCHOS', 'O')).toEqual(['O']);
    // E quando o termo está lá de verdade, as duas continuam achando.
    expect(template02HighlightLine('10 GANCHOS\nPARAR O FEED', 'O')).toBe(1);
    expect(template02MissingHighlightTerms('PARAR O FEED', 'O')).toEqual([]);
  });
});

describe('VARREDURA: as pastilhas do editor sofrem do mesmo problema?', () => {
  /**
   * NÃO. A resposta, medida: elas acendem por IGUALDADE de palavra normalizada
   * (`selected.has(word.normalized)`), nunca por substring. No print do Rafael a
   * pastilha "O" estava acesa corretamente — quem errava era só o render. O bug
   * tinha uma ponta, não duas.
   */
  it('a pastilha de GANCHOS não acende quando o termo marcado é "O"', () => {
    // A chave ganhou a OCORRÊNCIA em 04/09/2026 (ver
    // tests/radar-destaque-ocorrencia.test.tsx). O que este caso afirma não
    // mudou: a palavra que contém o termo não acende.
    const selecionadas = selectedHighlightWords('PARAR, O, FEED', HEADLINE_DO_RAFAEL);
    const acesas = headlineWords(HEADLINE_DO_RAFAEL)
      .filter((w) => selecionadas.has(highlightWordKey(w.normalized, w.occurrence)))
      .map((w) => w.display);

    expect(acesas).toEqual(['PARAR', 'O', 'FEED']);
    expect(acesas).not.toContain('GANCHOS');
  });

  it('nem com palavra acentuada, que é onde uma checagem ASCII cairia', () => {
    const headline = 'UMA AÇÃO RÁPIDA A MAIS';
    const selecionadas = selectedHighlightWords('A', headline);
    const acesas = headlineWords(headline)
      .filter((w) => selecionadas.has(highlightWordKey(w.normalized, w.occurrence)))
      .map((w) => w.display);

    expect(acesas).toEqual(['A']);
  });
});
