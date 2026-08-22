/**
 * localStorage / sessionStorage para os testes com ambiente jsdom.
 *
 * POR QUE ISTO EXISTE
 * O jsdom instalado (29.1.1) TEM webstorage: `new JSDOM('', { url: '...' })
 * .window.localStorage` é um objeto de verdade. Quem não expõe é o vitest 4 —
 * a lista de chaves que ele copia do window do jsdom para o global
 * (`LIVING_KEYS` / `OTHER_KEYS` em node_modules/vitest/dist/chunks/index.*.js)
 * traz 'Storage' e 'StorageEvent', os CONSTRUTORES, mas não traz
 * 'localStorage' nem 'sessionStorage'. E como no vitest o `window` é o próprio
 * global, `window.localStorage` falta pelo mesmo motivo.
 *
 * O sintoma eram duas falhas que a suíte carregou por semanas como "ambiente,
 * pré-existentes":
 *   tests/onboarding-form-session.test.tsx → Cannot read properties of
 *                                            undefined (reading 'clear')
 *   tests/onboarding-wizard.test.tsx       → ... (reading 'setItem')
 * Nenhuma delas era defeito do OnboardingForm: os dois arquivos já declaravam
 * `// @vitest-environment jsdom`, e o código do onboarding estava certo.
 *
 * 🔴 ISTO É ANDAIME, NÃO ARQUITETURA. O dia em que o vitest passar a copiar
 * essas chaves, o `if` abaixo desliga o polyfill sozinho — e aí o certo é
 * APAGAR este arquivo e a linha `setupFiles` do vitest.config.ts, não mantê-lo
 * por medo. Um polyfill que não polifila nada só engana quem lê depois.
 */

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  /** Chave ausente devolve `null`, como a Storage de verdade — nunca undefined. */
  getItem(key: string): string | null {
    const value = this.data.get(String(key));
    return value === undefined ? null : value;
  }

  /** A Storage guarda STRING: `setItem('n', 1)` volta como '1'. */
  setItem(key: string, value: string): void {
    this.data.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.data.delete(String(key));
  }

  clear(): void {
    this.data.clear();
  }

  /** Índice fora da faixa devolve `null`, não undefined. */
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
}

/**
 * Só entra em ambiente com DOM. Num teste `node` o localStorage NÃO deveria
 * existir mesmo — plantar um ali poderia empurrar código de SSR para o caminho
 * de browser, que é justamente o tipo de efeito colateral que este conserto
 * não pode ter.
 */
const temDom = typeof (globalThis as { window?: unknown }).window !== 'undefined';

const alvo = globalThis as Record<string, unknown>;

for (const nome of ['localStorage', 'sessionStorage'] as const) {
  if (!temDom) continue;

  /**
   * Olha o DESCRIPTOR, não `nome in globalThis` nem `globalThis[nome]`.
   *
   * Dois motivos, os dois medidos aqui:
   *  • `'localStorage' in globalThis` é `true` mesmo sem storage nenhuma — o
   *    Node 22 declara um acessor próprio que devolve `undefined`. Um guarda
   *    por `in` acharia que já tem e não instalaria nada.
   *  • LER esse acessor faz o Node imprimir "localStorage is not available
   *    because --localstorage-file was not provided" em CADA worker, sujando a
   *    saída da suíte inteira. O descriptor responde sem invocar o getter.
   *
   * Storage de verdade é respeitada: quando o vitest copiar a do jsdom, ela
   * chega como propriedade de VALOR (é assim que ele copia as LIVING_KEYS), o
   * `continue` abaixo pega, e aí este arquivo pode ser apagado.
   */
  const atual = Object.getOwnPropertyDescriptor(globalThis, nome);
  if (atual && !atual.get && atual.value) continue;

  // Instâncias SEPARADAS de propósito. Um Map compartilhado faria um teste que
  // limpa o localStorage apagar também o sessionStorage.
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, nome, {
    value: storage,
    configurable: true,
    writable: true,
  });

  // No vitest o `window` costuma SER o global; quando não for, a mesma
  // instância vai para os dois — quem escreve `window.localStorage` e quem
  // escreve `localStorage` têm de ver a mesma caixa.
  const janela = alvo.window as Record<string, unknown> | undefined;
  if (janela && janela !== alvo && !janela[nome]) {
    Object.defineProperty(janela, nome, { value: storage, configurable: true, writable: true });
  }
}
