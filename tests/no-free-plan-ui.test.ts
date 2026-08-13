import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O plano gratuito NÃO existe mais: o backend dele saiu (migration 20260812
 * dropou user_entitlements e os limites; /api/auth/free-signup foi apagada).
 * Qualquer CTA remanescente promete uma conta que o produto não entrega — foi
 * exatamente isso que aconteceu: "Começar grátis" levava a uma página dizendo
 * que era preciso assinar.
 *
 * Este teste lê o FONTE das páginas de marketing (não o DOM) porque o que
 * precisa ser barrado é o link voltar ao código, não um render específico.
 */

const ROOT = join(__dirname, '..');
const PAGES = [
  'app/(marketing)/precos/page.tsx',
  'app/(marketing)/page.tsx',
];

describe('nenhuma porta de entrada para o plano gratuito', () => {
  for (const page of PAGES) {
    const src = readFileSync(join(ROOT, page), 'utf8');

    it(`${page} não linka /cadastro?plan=free`, () => {
      expect(src).not.toContain('plan=free');
    });

    it(`${page} não oferece "Começar grátis"`, () => {
      expect(src).not.toMatch(/Começar grátis/);
    });

    it(`${page} não promete "Tudo do plano Grátis incluído"`, () => {
      expect(src).not.toMatch(/plano Grátis incluído/);
    });

    // A grade dos planos: com 2 cards ela precisa ser de 2 colunas, senão
    // sobra uma coluna vazia onde ficava o card grátis. Escopado ao className
    // que contém a grade dos planos (o arquivo tem outras grades de 3 colunas
    // que nada têm a ver com preços).
    it(`${page} monta a grade dos planos em 2 colunas`, () => {
      const grid = src.match(/className="[^"]*grid md:grid-cols-\d[^"]*max-w-3xl[^"]*"/);
      expect(grid, 'grade dos planos não encontrada').not.toBeNull();
      expect(grid![0]).toContain('md:grid-cols-2');
    });
  }
});

describe('dev server acessível pelo túnel de teste do Asaas', () => {
  // Sem allowedDevOrigins o `next dev` bloqueia /_next/* vindo de outra origem,
  // o cliente do Next nunca termina de hidratar e NENHUM onClick da página
  // dispara — sem erro no console. Foi essa a causa de "Assinar mensal não faz
  // nada" quando testado pelo túnel. Guarda dev-only: produção não tem o bloqueio.
  it('next.config declara allowedDevOrigins para o túnel', () => {
    const cfg = readFileSync(join(ROOT, 'next.config.ts'), 'utf8');
    expect(cfg).toContain('allowedDevOrigins');
    expect(cfg).toMatch(/trycloudflare\.com/);
  });
});
