import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Só resolve o alias "@/" do tsconfig. Os testes de rota escapavam disso
 * porque mockam todo módulo "@/..." que importam; testar lib/abacatepay-sync.ts
 * diretamente carrega o módulo de verdade, então o alias precisa resolver.
 *
 * O ambiente segue node por padrão — quem precisar de DOM declara
 * `// @vitest-environment jsdom` no topo do arquivo.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
