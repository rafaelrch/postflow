import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * FASE C / C1 — o core do ffmpeg.wasm não pode mais vir de CDN externo.
 *
 * NOTA DE HONESTIDADE: estes testes provam que o CÓDIGO só pede o core do nosso
 * domínio e que nada mais aponta pra unpkg. Eles NÃO exercitam um export de
 * vídeo real (jsdom não tem WebAssembly/canvas do ffmpeg.wasm nem os 31MB de
 * wasm carregados). A prova de que o nosso domínio realmente ENTREGA os
 * arquivos foi feita fora do vitest, com `next start` + curl — ver relato.
 */

const source = readFileSync(new URL('../lib/reels-export.ts', import.meta.url), 'utf8');

describe('C1 — core do ffmpeg servido pelo próprio domínio', () => {
  it('FFMPEG_CORE_BASE é caminho local, não URL externa', async () => {
    const { FFMPEG_CORE_BASE } = await import('../lib/reels-export');
    expect(FFMPEG_CORE_BASE).toBe('/ffmpeg/0.12.10');
    expect(FFMPEG_CORE_BASE.startsWith('/')).toBe(true);
    expect(FFMPEG_CORE_BASE).not.toMatch(/^https?:/i);
  });

  it('o caminho é VERSIONADO (pré-requisito do Cache-Control immutable)', async () => {
    const { FFMPEG_CORE_BASE, FFMPEG_CORE_VERSION } = await import('../lib/reels-export');
    // Sem versão na URL, `immutable` prenderia o browser num core velho por 1 ano.
    expect(FFMPEG_CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(FFMPEG_CORE_BASE).toBe(`/ffmpeg/${FFMPEG_CORE_VERSION}`);
    expect(FFMPEG_CORE_BASE).not.toBe('/ffmpeg');
  });

  it('immutable só vale com URL versionada: o header e o caminho andam juntos', () => {
    const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
    const hasImmutable = /immutable/.test(config);
    const base = source.match(/FFMPEG_CORE_BASE = `([^`]+)`/)?.[1] ?? '';
    if (hasImmutable) {
      expect(base).toContain('${FFMPEG_CORE_VERSION}');
    }
  });

  it('nenhuma referência a CDN de terceiro sobrou no módulo de export', () => {
    expect(source).not.toMatch(/unpkg\.com/i);
    expect(source).not.toMatch(/jsdelivr/i);
    expect(source).not.toMatch(/cdn\./i);
  });

  describe('getFFmpeg só busca o core de URLs same-origin', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
    });

    it('pede exatamente /ffmpeg/ffmpeg-core.js e /ffmpeg/ffmpeg-core.wasm', async () => {
      const requested: string[] = [];

      vi.doMock('@ffmpeg/util', () => ({
        toBlobURL: vi.fn(async (url: string) => {
          requested.push(url);
          return `blob:${url}`;
        }),
      }));
      const load = vi.fn(async () => undefined);
      vi.doMock('@ffmpeg/ffmpeg', () => ({
        FFmpeg: class {
          on = vi.fn();
          load = load;
        },
      }));

      // Qualquer saída de rede real durante a carga reprova o teste: se o código
      // ainda dependesse de CDN, cairia aqui.
      const fetchSpy = vi.fn(() => {
        throw new Error('rede externa não pode ser tocada ao carregar o core');
      });
      vi.stubGlobal('fetch', fetchSpy);

      const { getFFmpeg } = await import('../lib/reels-export');
      await getFFmpeg();

      expect(requested).toEqual([
        '/ffmpeg/0.12.10/ffmpeg-core.js',
        '/ffmpeg/0.12.10/ffmpeg-core.wasm',
      ]);
      // Nenhuma URL absoluta / host externo.
      for (const url of requested) {
        expect(url).toMatch(/^\/ffmpeg\//);
        expect(url).not.toMatch(/^https?:|^\/\//i);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });
  });

  it('mantém o timeout e a mensagem de erro como defesa em profundidade', async () => {
    const { FFMPEG_LOAD_TIMEOUT_MS, FFMPEG_LOAD_ERROR } = await import('../lib/reels-export');
    expect(FFMPEG_LOAD_TIMEOUT_MS).toBe(60_000);
    expect(FFMPEG_LOAD_ERROR).toMatch(/motor de vídeo/i);
    // A carga do core continua envolvida pelo withTimeout.
    expect(source).toMatch(/await withTimeout\(/);
  });
});

describe('C1 — o core é entregue pelo build, não versionado', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  it('@ffmpeg/core é dependência com versão EXATA (sem range)', () => {
    const v = pkg.dependencies['@ffmpeg/core'];
    expect(v).toBe('0.12.10');
    expect(v).not.toMatch(/^[\^~]/);
  });

  // ── O teste de divergência ────────────────────────────────────────────────
  // Se o caminho que o prebuild GRAVA e o que o runtime PEDE saírem de sync, o
  // deploy serve 404 e o export morre calado. As duas pontas saem da mesma
  // constante; aqui garantimos que ela bate com o pin do package.json e com o
  // pacote instalado. Bumpar @ffmpeg/core sem mexer no código quebra aqui.
  it('runtime, package.json e node_modules apontam para a MESMA versão', async () => {
    const { FFMPEG_CORE_VERSION } = await import('../lib/reels-export');
    const installed = JSON.parse(
      readFileSync(new URL('../node_modules/@ffmpeg/core/package.json', import.meta.url), 'utf8'),
    ).version;

    expect(FFMPEG_CORE_VERSION).toBe(pkg.dependencies['@ffmpeg/core']);
    expect(FFMPEG_CORE_VERSION).toBe(installed);
  });

  it('o prebuild deriva o destino da constante do runtime, não de string solta', () => {
    const script = readFileSync(new URL('../scripts/copy-ffmpeg-core.mjs', import.meta.url), 'utf8');
    // Lê a versão do próprio módulo de runtime…
    expect(script).toMatch(/FFMPEG_CORE_VERSION = '\(\[\^'\]\+\)'/);
    // …grava num diretório versionado…
    expect(script).toMatch(/join\(root, 'public', 'ffmpeg', runtimeVersion\)/);
    // …e aborta se package.json ou node_modules discordarem.
    expect(script).toMatch(/pinned !== runtimeVersion/);
    expect(script).toMatch(/installed !== runtimeVersion/);
    // Nenhuma versão hardcoded como VALOR no script (seria a 2ª fonte de
    // verdade). Menção em comentário é ok; string literal de versão não é.
    const code = script
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/['"`]\d+\.\d+\.\d+['"`]/);
  });

  it('o prebuild copia o core para public/ antes de todo build', () => {
    expect(pkg.scripts.prebuild).toBe('node scripts/copy-ffmpeg-core.mjs');
  });

  it('public/ffmpeg/ é gitignorado (não commitar ~31MB)', () => {
    const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
    expect(ignore).toMatch(/^\/public\/ffmpeg\/$/m);
  });

  // O worker do @ffmpeg/ffmpeg é `type: "module"`, que só consegue importar o
  // build ESM (o UMD não tem `export default` → "failed to import"). Verificado
  // em browser real: UMD falhou, ESM carregou e transcodificou. Se alguém voltar
  // pra UMD "porque a doc oficial usa", este teste quebra.
  it('o script copia a variante ESM (não UMD) e falha ruidosamente se a origem sumir', () => {
    const script = readFileSync(new URL('../scripts/copy-ffmpeg-core.mjs', import.meta.url), 'utf8');
    expect(script).toMatch(/'dist',\s*'esm'/);
    expect(script).not.toMatch(/'dist',\s*'umd'/);
    expect(script).toMatch(/ffmpeg-core\.js/);
    expect(script).toMatch(/ffmpeg-core\.wasm/);
    expect(script).toMatch(/process\.exit\(1\)/);
  });
});
