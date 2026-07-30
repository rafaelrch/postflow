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
 * Este teste varre a copy de verdade e falha se ela afirmar um custo que o
 * CREDIT_COSTS não tem, se cobrar por notícia, ou se voltar a citar "refinar".
 */

const COPY_FILES = [
  'app/(app)/conta/page.tsx',
  'app/(marketing)/page.tsx',
  'app/(marketing)/precos/page.tsx',
  'components/ui/CreditsExhaustedModal.tsx',
  'components/ui/UpgradeModal.tsx',
  'components/ui/AppSidebar.tsx',
];

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/** Custos que o código realmente cobra. Hoje: {5}. */
const REAL_COSTS = new Set<number>(Object.values(CREDIT_COSTS));

describe('copy de créditos x CREDIT_COSTS', () => {
  it.each(COPY_FILES)('%s não afirma nenhum custo ausente de CREDIT_COSTS', (file) => {
    const claimed = [...read(file).matchAll(/cust(?:a|am)\s+(\d+)/gi)].map((m) => Number(m[1]));
    const invalid = claimed.filter((n) => !REAL_COSTS.has(n));
    expect(invalid, `custos afirmados na copy que não existem em CREDIT_COSTS (${[...REAL_COSTS]})`).toEqual([]);
  });

  it.each(COPY_FILES)('%s não cobra créditos por notícia — notícia tem teto, não custo', (file) => {
    // Notícias nascem no cliente e nenhuma rota debita crédito por elas; o que
    // existe é FREE_NEWS_DAILY_LIMIT, e só no plano Grátis.
    expect(read(file)).not.toMatch(/not[ií]cias?[^.]{0,60}cust(?:a|am)/i);
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
});
