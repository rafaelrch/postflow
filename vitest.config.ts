import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Só resolve o alias "@/" do tsconfig. Os testes de rota escapavam disso
 * porque mockam todo módulo "@/..." que importam; testar um módulo de lib/
 * diretamente (ex.: lib/asaas-webhook.ts) carrega o de verdade, então o alias
 * precisa resolver.
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
  test: {
    /**
     * Repõe localStorage/sessionStorage, que o vitest 4 não copia do jsdom para
     * o global. Só isso — o arquivo explica a causa e diz quando apagá-lo.
     */
    setupFiles: ['./tests/setup/webstorage.ts'],
    /**
     * Os defaults do vitest REPOSTOS à mão, porque declarar `exclude`
     * sobrescreve a lista inteira em vez de somar. O item que interessa é o
     * último: sem ele a suíte varre .claude/worktrees/ e roda os testes de
     * outras branches, devolvendo centenas de falhas que não são desta aqui.
     */
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/.claude/**',
    ],
  },
});
