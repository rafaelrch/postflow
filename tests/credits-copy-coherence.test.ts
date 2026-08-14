import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDIT_COSTS } from '../lib/credits';

/**
 * Trava a copy de créditos contra o código.
 *
 * A /conta anunciava "Notícias e Threads custam 3 · ... Refinar slide é grátis":
 * um custo que não existe em CREDIT_COSTS, um item que não é item (Thread é
 * ESTILO de carrossel) e uma funcionalidade que não existe. Nada quebrava, e a
 * landing dizia o contrário na mesma hora — o site se contradizendo para quem
 * paga.
 *
 * PRIMEIRA VERSÃO DESTE TESTE TINHA O MESMO VÍCIO QUE PERSEGUIA: dependia do
 * literal "custa/custam", então travava a FRASE de ontem, não a FAMÍLIA. O
 * Reviewer trocou a linha por "Notícias: 3 créditos cada." — a mesma mentira sem
 * o verbo — e os 20 casos passaram. Um teste que só pega a redação exata
 * anterior impede a repetição literal, que é justamente a menos provável.
 *
 * Agora a detecção NÃO depende de verbo. São dois detectores independentes:
 *
 *  A) Custo afirmado: qualquer número adjacente à palavra "crédito" (nas DUAS
 *     ordens) ou logo depois de um verbo de preço. Cada um é classificado como
 *     MESADA (se a janela fala de mês/renovação) ou CUSTO, e validado contra o
 *     valor real correspondente. Mesada não é ignorada — é conferida contra o
 *     SQL, senão "mês" viraria porta dos fundos.
 *
 *  B) Notícia cobrada: qualquer número perto de "notícia" (nas duas direções,
 *     dentro da mesma frase) quando a frase também fala de crédito.
 *
 *     A âncora aqui é "crédito", e não uma lista de marcadores de teto
 *     ("por dia", "hoje", "3 estilos"...). Textos de TETO são verdadeiros e
 *     precisam continuar passando — "Até 4 notícias por dia" na /precos, "Você
 *     criou 4 notícias hoje" no UpgradeModal, "notícias manuais, nos 3 estilos".
 *     Distinguir por lista de marcadores exigiria adivinhar a redação futura e a
 *     lista cresceria a cada texto novo — o mesmo erro de travar a frase. Teto
 *     nunca fala em crédito; cobrança sempre fala. Por isso a âncora é essa.
 */

const COPY_FILES = [
  'app/(app)/conta/page.tsx',
  'app/(marketing)/page.tsx',
  'app/(marketing)/precos/page.tsx',
  'components/ui/CreditsExhaustedModal.tsx',
  // components/ui/UpgradeModal.tsx saiu junto com o plano gratuito: era o
  // upsell do free, e sem free não há para onde subir. Se um modal de upgrade
  // voltar a existir, ele volta para esta lista.
  'components/ui/AppSidebar.tsx',
];

/**
 * Espaços colapsados: a copy quebra em várias linhas no fonte, e regex ancorada
 * numa linha só passa verde sem ter olhado a frase inteira.
 */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');

/** Custos que o código realmente cobra. Hoje: {5}. */
const REAL_COSTS = new Set<number>(Object.values(CREDIT_COSTS));

/** Mesada mensal, direto do SQL (200 mensal / 300 anual). */
const REAL_ALLOWANCES = new Set<number>(
  [...readFileSync(new URL('../supabase/credits-and-flow.sql', import.meta.url), 'utf8')
    .matchAll(/then\s+(\d+)\s+else\s+(\d+)\s+end/gi)]
    .flatMap((m) => [Number(m[1]), Number(m[2])]),
);

/** Marca de mesada/renovação — distingue "200 créditos todo mês" de "custa 5". */
const ALLOWANCE = /todo m[êe]s|por m[êe]s|mensa(?:l|is)|anual|renova|recarga/i;

type Claim = { value: number; window: string };

/** Todo número afirmado como preço, sem depender de verbo. */
function creditClaims(text: string): Claim[] {
  const patterns = [
    /(\d+)\s*cr[ée]ditos?/gi, // "3 créditos", "5 créditos cada"
    /cr[ée]ditos?\s*:?\s*(\d+)/gi, // "créditos: 3"
    /cust(?:a|am|o)\s+(?:de\s+)?(\d+)/gi, // "custam 3", "custo de 3"
    /cobra(?:m)?\s+(?:de\s+)?(\d+)/gi, // "cobra 3"
  ];
  const claims: Claim[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      claims.push({
        value: Number(m[1]),
        // Janela CURTA e colada na afirmação. Com janela larga, um "recarregam
        // todo mês" na frase seguinte classificaria "Notícias: 3 créditos" como
        // mesada — a acusação sairia pela asserção errada, e "200 créditos por
        // notícia" perto de "mês" passaria nas duas.
        window: text.slice(Math.max(0, at - 12), at + m[0].length + 18),
      });
    }
  }
  return claims;
}

/** Frases que citam notícia e um número, nas duas direções, sem cruzar ponto. */
function newsNumberSentences(text: string): string[] {
  const spans = [
    ...text.matchAll(/not[ií]cias?[^.]{0,60}/gi),
    ...text.matchAll(/[^.]{0,60}not[ií]cias?/gi),
  ].map((m) => m[0]);
  return spans.filter((s) => /\d/.test(s));
}

describe('copy de créditos x CREDIT_COSTS', () => {
  it.each(COPY_FILES)('%s não afirma custo fora de CREDIT_COSTS (sem depender de verbo)', (file) => {
    const invalid = creditClaims(read(file))
      .filter((c) => !ALLOWANCE.test(c.window))
      .filter((c) => !REAL_COSTS.has(c.value));
    expect(
      invalid.map((c) => `${c.value} em "${c.window.trim()}"`),
      `custo afirmado que não existe em CREDIT_COSTS (${[...REAL_COSTS]})`,
    ).toEqual([]);
  });

  it.each(COPY_FILES)('%s não afirma mesada fora do SQL', (file) => {
    // Sem isto, "mês" na janela seria porta dos fundos para qualquer número.
    const invalid = creditClaims(read(file))
      .filter((c) => ALLOWANCE.test(c.window))
      .filter((c) => !REAL_ALLOWANCES.has(c.value) && !REAL_COSTS.has(c.value))
      .map((c) => `${c.value} em "${c.window.trim()}"`);
    expect(invalid, `mesada afirmada fora de credits-and-flow.sql (${[...REAL_ALLOWANCES]})`).toEqual([]);
  });

  it.each(COPY_FILES)('%s não cobra créditos por notícia — notícia tem teto, não custo', (file) => {
    // Notícias nascem no cliente e nenhuma rota debita crédito por elas; o que
    // existia era FREE_NEWS_DAILY_LIMIT, que saiu com o plano gratuito. Uma
    // frase de teto não fala em crédito e continua passando.
    const cobrando = newsNumberSentences(read(file)).filter((s) => /cr[ée]dito/i.test(s));
    expect(cobrando, 'frase liga notícia a número e a crédito').toEqual([]);
  });

  it.each(COPY_FILES)('%s não cita "refinar", funcionalidade que não existe', (file) => {
    expect(read(file)).not.toMatch(/refin(?:ar|a|amento)/i);
  });

  it('a /conta interpola CREDIT_COSTS em vez de digitar os números', () => {
    const conta = read('app/(app)/conta/page.tsx');
    expect(conta).toContain('CREDIT_COSTS.carousel');
    expect(conta).toContain('CREDIT_COSTS.image');
  });

  it('o comentário de lib/credits.ts não usa exemplo inexistente', () => {
    expect(read('lib/credits.ts')).not.toMatch(/\(ex\.: refinar slide\)/i);
  });

  it('a mesada real foi lida do SQL (senão a checagem acima seria vácua)', () => {
    expect([...REAL_ALLOWANCES].sort((a, b) => a - b)).toEqual([200, 300]);
  });
});
