import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Só resolve o alias "@/" do tsconfig. Os testes de rota escapavam disso
 * porque mockam todo módulo "@/..." que importam; o teste do AuthProvider
 * renderiza o componente de verdade, então o alias precisa resolver.
 *
 * O ambiente segue node por padrão — quem precisa de DOM declara
 * `// @vitest-environment jsdom` no topo do arquivo.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
