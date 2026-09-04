// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import Template02Slide from '@/components/slides/Template02Slide';
import HighlightWordChips, {
  headlineWords,
  highlightWordKey,
  selectedHighlightWords,
  toggleHighlightWord,
} from '@/components/editor/sidebar/HighlightWordChips';
import {
  template02HighlightLine,
  template02HighlightParts,
  template02HighlightTerms,
  template02HighlightTermsParsed,
  template02Measure,
  template02MissingHighlightTerms,
  template02SlotsForModel,
} from '@/lib/templates/template-02';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

/**
 * DESTAQUE POR OCORRÊNCIA — marcar UM dos dois FEED.
 *
 * Pedido do Rafael (04/09/2026): *"se aparecer a palavra FEED duas vezes e ele
 * selecionou UM desses FEED, é só pra destacar aquele que ele selecionou. Não é
 * pra selecionar ambas."*
 *
 * ANTES, as duas pontas erravam em DIREÇÕES OPOSTAS, e é isso que torna a
 * tarefa maior que "marcar a segunda": a PASTILHA acendia as duas ocorrências
 * (comparava só o texto normalizado) enquanto o RENDER pintava só a primeira.
 * Consertar uma delas deixaria a interface mentindo sobre a outra.
 *
 * FORMATO: sufixo OPCIONAL `::N` no termo, dentro do mesmo slot string.
 * **Sem sufixo = primeira ocorrência = o comportamento de antes.** É essa regra
 * que dispensa migração de banco e mudança no prompt da IA.
 */

afterEach(cleanup);

/**
 * Duas vezes FEED — o caso do Rafael. As posições, porque os casos abaixo as
 * citam e o `\n` conta como separador de palavra:
 *   0 O · 1 FEED · 2 MUDOU · 3 E · 4 O · 5 SEU · 6 FEED · 7 TAMBEM
 */
const HEADLINE = 'O FEED MUDOU\nE O SEU FEED TAMBEM';

function capa(highlight: string, headline = HEADLINE): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 'capa',
    position: 0,
    templateModel: 1,
    templateSlots: { 'cover.headline': headline, 'cover.highlight': highlight },
  } as Slide;
}

/** Os trechos que o RENDER marcou, e onde. */
function marcado(slide: Slide): { textos: string[]; html: string } {
  const { container } = render(
    <Template02Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={0}
      totalSlides={5}
    />,
  );
  const headline = container.querySelector('[data-slot="cover.headline"]') as HTMLElement;
  return {
    textos: Array.from(container.querySelectorAll('[data-slot="cover.highlight"]')).map(
      (el) => el.textContent ?? '',
    ),
    html: headline.innerHTML,
  };
}

/** As pastilhas ACESAS, pelo texto que aparece nelas. */
function acesas(highlight: string, headline = HEADLINE): string[] {
  const selecionadas = selectedHighlightWords(highlight, headline);
  return headlineWords(headline)
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => selecionadas.has(highlightWordKey(w.normalized, w.occurrence)))
    .map(({ w, i }) => `${w.display}#${i}`);
}

// ── O caso do Rafael ──────────────────────────────────────────────────────

describe('marcar a SEGUNDA ocorrência marca só ela', () => {
  it('o RENDER pinta só o segundo FEED', () => {
    // NO ESTADO ERRADO este caso veria: o marcador na PRIMEIRA linha, porque
    // sem sufixo o render sempre pegava a primeira ocorrência. Por isso não
    // basta contar 1 marcação — as duas situações dão 1. O que separa é EM QUAL
    // LINHA ela caiu, e é isso que se mede.
    const { textos, html } = marcado(capa('FEED::2'));

    expect(textos).toEqual(['FEED']);
    const linhas = html.split('</div>');
    const linhaComMarca = linhas.findIndex((l) => l.includes('cover.highlight'));
    expect(linhaComMarca, 'a marca caiu na linha errada').toBe(1);
  });

  it('as PASTILHAS acendem só a segunda', () => {
    // No estado errado veria ['FEED#1', 'FEED#5'] — as duas acesas.
    expect(acesas('FEED::2')).toEqual(['FEED#6']);
  });

  it('marcar a primeira continua marcando a primeira, nas duas pontas', () => {
    expect(acesas('FEED')).toEqual(['FEED#1']);
    const { html } = marcado(capa('FEED'));
    expect(html.split('</div>').findIndex((l) => l.includes('cover.highlight'))).toBe(0);
  });

  it('as duas ocorrências juntas continuam podendo ser marcadas', () => {
    expect(acesas('FEED, FEED::2')).toEqual(['FEED#1', 'FEED#6']);
    expect(marcado(capa('FEED, FEED::2')).textos).toEqual(['FEED', 'FEED']);
  });

  it('clicar na segunda pastilha grava o sufixo; clicar de novo o remove', () => {
    const palavras = headlineWords(HEADLINE);
    const segundoFeed = palavras.filter((w) => w.normalized === 'feed')[1];
    expect(segundoFeed.occurrence).toBe(2);

    const ligado = toggleHighlightWord(HEADLINE, '', segundoFeed);
    expect(ligado).toBe('FEED::2');
    expect(toggleHighlightWord(HEADLINE, ligado, segundoFeed)).toBe('');
  });

  it('a primeira ocorrência é gravada SEM sufixo — o campo antigo não muda de forma', () => {
    // `::1` omitido de propósito: o valor de um deck que nunca usou a segunda
    // ocorrência continua byte a byte o que já era.
    const primeiroFeed = headlineWords(HEADLINE).find((w) => w.normalized === 'feed')!;
    expect(toggleHighlightWord(HEADLINE, '', primeiroFeed)).toBe('FEED');
  });

  it('no componente, clicar na segunda pastilha não acende a primeira', () => {
    const cliques: string[] = [];
    const { container } = render(
      <HighlightWordChips headline={HEADLINE} highlight="" onChange={(v) => cliques.push(v)} />,
    );
    const grupo = within(container).getByRole('group', { name: 'Palavras em destaque' });
    const botoes = within(grupo).getAllByRole('button').filter((b) => b.textContent === 'FEED');

    expect(botoes).toHaveLength(2);
    fireEvent.click(botoes[1]);

    expect(cliques).toEqual(['FEED::2']);
    expect(botoes[0].getAttribute('aria-pressed')).toBe('false');
  });
});

// ── Não-regressão: deck antigo e IA ───────────────────────────────────────

describe('NÃO-REGRESSÃO: sem sufixo, tudo é como era', () => {
  it('deck ANTIGO com vários termos abre igual', () => {
    // O valor exato que um deck salvo tem. No estado errado nada mudaria aqui —
    // este caso não distingue estados, e é de propósito: ele existe para
    // provar que a mudança NÃO mexeu no caminho de sempre.
    const antigo = 'O FEED MUDOU';
    expect(marcado(capa('O, MUDOU', antigo), ).textos).toEqual(['O', 'MUDOU']);
    expect(acesas('O, MUDOU', antigo)).toEqual(['O#0', 'MUDOU#2']);
  });

  it('a saída da IA (termo puro, sem sufixo) continua valendo', () => {
    // O addendum manda `extras.highlight` como trecho de texto puro e NÃO foi
    // tocado. Sem sufixo = primeira ocorrência.
    expect(template02HighlightTermsParsed('FEED')).toEqual([{ texto: 'FEED', ocorrencia: 1 }]);
    expect(marcado(capa('FEED')).textos).toEqual(['FEED']);
  });

  it('termo de VÁRIAS palavras continua casando como um só', () => {
    expect(marcado(capa('O FEED MUDOU')).textos).toEqual(['O FEED MUDOU']);
    expect(acesas('O FEED MUDOU')).toEqual(['O#0', 'FEED#1', 'MUDOU#2']);
  });

  it('a SEGUNDA ocorrência de um termo de várias palavras', () => {
    const h = 'O FEED MUDOU\nO FEED MUDOU';
    expect(acesas('O FEED::2', h)).toEqual(['O#3', 'FEED#4']);
  });

  it('termo de várias palavras acende as palavras nas posições certas', () => {
    // 🔴 O CASO QUE DERRUBOU A MINHA PRIMEIRA IMPLEMENTAÇÃO das pastilhas. Elas
    // somavam o índice pedido ao deslocamento dentro do termo, o que parece
    // certo e não é: "SEU FEED" ocorre uma vez só, mas o FEED dele é a 2ª
    // ocorrência de FEED na headline — 1 + 1 daria 2 por coincidência aqui, e
    // erraria em "O FEED MUDOU", onde MUDOU é a 1ª dele e não a 3ª.
    // O casamento passou a ser por SEQUÊNCIA de palavras, com cada uma
    // acendendo pela ocorrência que ELA tem.
    expect(acesas('SEU FEED')).toEqual(['SEU#5', 'FEED#6']);
    expect(acesas('O FEED MUDOU')).toEqual(['O#0', 'FEED#1', 'MUDOU#2']);
  });

  it('o campo vazio e o campo só com vírgulas continuam não marcando nada', () => {
    expect(template02HighlightTerms('')).toEqual([]);
    expect(template02HighlightTerms(' , , ')).toEqual([]);
    expect(marcado(capa('')).textos).toEqual([]);
  });
});

// ── O caso patológico do "::" ─────────────────────────────────────────────

describe('"::" escrito no TÍTULO não vira sufixo por acidente', () => {
  const COM_DOIS_PONTOS = 'LEIA O CAP::2 AGORA';

  it('o termo que existe literalmente no título é TEXTO, não índice', () => {
    // No estado errado (sem o desempate) isto seria lido como termo "CAP",
    // ocorrência 2 — que não existe — e NADA seria marcado.
    expect(template02HighlightTermsParsed('CAP::2', COM_DOIS_PONTOS)).toEqual([
      { texto: 'CAP::2', ocorrencia: 1 },
    ]);
    expect(marcado(capa('CAP::2', COM_DOIS_PONTOS)).textos).toEqual(['CAP::2']);
  });

  it('sem o título para desempatar, o sufixo vale — é o que o produto nunca faz', () => {
    // Documenta a fronteira da regra: quem não passa o texto não tem como
    // desambiguar. Todos os chamadores de dentro do produto passam.
    expect(template02HighlightTermsParsed('CAP::2')).toEqual([
      { texto: 'CAP', ocorrencia: 2 },
    ]);
  });

  it('"::" sem dígitos depois nunca é sufixo', () => {
    expect(template02HighlightTermsParsed('ANTES::DEPOIS')).toEqual([
      { texto: 'ANTES::DEPOIS', ocorrencia: 1 },
    ]);
  });

  it('"::0" não vira ocorrência zero', () => {
    // 1-based: um índice 0 marcaria "nenhuma" e o marcador sumiria calado.
    expect(template02HighlightTermsParsed('FEED::0')).toEqual([{ texto: 'FEED', ocorrencia: 1 }]);
  });
});

// ── Os três leitores concordam com o render ───────────────────────────────

describe('contador, missing terms e highlight line entendem o sufixo', () => {
  it('MissingHighlightTerms não acusa como faltando um termo com sufixo', () => {
    // No estado errado veria ['FEED::2'] — o termo "existe" no texto? Não, com
    // o sufixo colado ele não existe, e o aviso apareceria em cima de um
    // marcador que o render pinta. Aviso mentindo é pior que aviso nenhum.
    expect(template02MissingHighlightTerms(HEADLINE, 'FEED::2')).toEqual([]);
    // E continua acusando o que de fato falta.
    expect(template02MissingHighlightTerms(HEADLINE, 'SUMIU')).toEqual(['SUMIU']);
  });

  it('HighlightLine acha a linha do termo com sufixo', () => {
    // No estado errado: -1, "não há marcador em linha nenhuma".
    expect(template02HighlightLine(HEADLINE, 'FEED::2')).toBe(0);
    expect(template02HighlightLine(HEADLINE, 'INEXISTENTE::2')).toBe(-1);
  });

  it('o CONTADOR de limite mede o texto, e o sufixo não infla a contagem', () => {
    // O contador do slot lê o valor do campo. Se ele contasse "FEED::2" como 7
    // caracteres, o aviso de estouro dispararia cedo.
    const descritor = template02SlotsForModel(1).find((d) => d.slot === 'cover.highlight')!;
    const comSufixo = template02HighlightTerms('FEED::2', HEADLINE).join(', ');

    expect(comSufixo).toBe('FEED');
    expect(template02Measure(comSufixo, descritor).chars).toBe(4);
  });

  it('os três leitores e o render concordam sobre o MESMO valor', () => {
    // O invariante que fecha a tarefa: se um deles discordasse, a barra lateral
    // diria uma coisa e o slide mostraria outra.
    const valor = 'FEED::2';
    expect(template02MissingHighlightTerms(HEADLINE, valor)).toEqual([]);
    expect(template02HighlightLine(HEADLINE, valor)).toBeGreaterThanOrEqual(0);
    expect(marcado(capa(valor)).textos).toEqual(['FEED']);
    expect(acesas(valor)).toEqual(['FEED#6']);
  });
});

// ── A contagem é da headline inteira ──────────────────────────────────────

describe('a ocorrência conta a HEADLINE inteira, não a linha', () => {
  it('a 2ª ocorrência numa linha posterior é encontrada', () => {
    // Este é o caso que só passa com `linhasAntes`: o render trabalha linha a
    // linha, e sem o texto anterior ele contaria "a 2ª desta linha" — que não
    // existe. No estado errado: nenhuma marcação.
    const partes = template02HighlightParts('E O SEU FEED TAMBEM', ['FEED::2'], 'O FEED MUDOU');
    expect(partes.filter((p) => p.marked).map((p) => p.text)).toEqual(['FEED']);
  });

  it('a mesma linha, olhada isoladamente, não marca a 2ª que está antes dela', () => {
    // A prova do contrário: sem o texto anterior, a 2ª ocorrência não está aqui.
    const partes = template02HighlightParts('E O SEU FEED TAMBEM', ['FEED::2']);
    expect(partes.filter((p) => p.marked)).toHaveLength(0);
  });

  it('duas ocorrências na MESMA linha também funcionam', () => {
    const partes = template02HighlightParts('FEED E MAIS FEED', ['FEED::2']);
    const marcadas = partes.filter((p) => p.marked);
    expect(marcadas).toHaveLength(1);
    // A posição é o que distingue: tem de ser a segunda, então o texto antes
    // dela contém o primeiro FEED inteiro.
    const antes = partes.slice(0, partes.findIndex((p) => p.marked)).map((p) => p.text).join('');
    expect(antes).toBe('FEED E MAIS ');
  });

  it('o desempate por termo mais longo continua valendo', () => {
    const partes = template02HighlightParts('MAR MARCA FORTE', ['MAR', 'MARCA']);
    expect(partes.filter((p) => p.marked).map((p) => p.text)).toEqual(['MAR', 'MARCA']);
  });
});
