/**
 * Copia o core do ffmpeg.wasm de node_modules para public/ffmpeg/.
 *
 * POR QUE: até a FASE C o core vinha de https://unpkg.com a CADA sessão de
 * export (lib/reels-export.ts). Se o unpkg caísse ou fosse bloqueado, o
 * download do Reel simplesmente não funcionava — inclusive para cliente
 * pagante. Servindo do nosso próprio domínio, o export deixa de depender de
 * terceiro.
 *
 * POR QUE NÃO COMMITAR: o ffmpeg-core.wasm tem ~31MB. Versionar isso incha o
 * clone de todo mundo pra sempre (git guarda todas as revisões) e o arquivo já
 * é reproduzível a partir do package-lock (versão exata, sem range). Então
 * public/ffmpeg/ é gitignorado e regenerado aqui.
 *
 * QUANDO RODA: no `prebuild` (npm roda automaticamente antes do `build`) e
 * pode ser chamado à mão com `npm run copy:ffmpeg-core` para o `next dev`.
 * Escolhi prebuild em vez de postinstall porque postinstall não roda com
 * --ignore-scripts nem quando o CI restaura node_modules de cache — e aí o
 * build sairia sem o core, quebrando o export em produção sem avisar.
 *
 * Idempotente: sobrescreve o destino. FALHA RUIDOSAMENTE se a origem não
 * existir — melhor quebrar o build que publicar um app sem motor de vídeo.
 *
 * Uso: node scripts/copy-ffmpeg-core.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const die = (msg) => {
  console.error(`[copy-ffmpeg-core] ERRO: ${msg}`);
  process.exit(1);
};

// ── Fonte de verdade única do caminho ────────────────────────────────────────
// O destino do build e a URL que o runtime pede TÊM que ser o mesmo caminho: se
// divergirem, o deploy serve 404 e o export morre calado (exatamente o tipo de
// falha que esta tarefa existe pra matar). Então a versão sai de UM lugar —
// FFMPEG_CORE_VERSION em lib/reels-export.ts, que é quem monta a URL em runtime
// — e aqui conferimos que ela bate com o pin do package.json e com o que está
// realmente instalado. Qualquer desalinhamento aborta o build.
const runtimeSrc = readFileSync(join(root, 'lib', 'reels-export.ts'), 'utf8');
const runtimeVersion = runtimeSrc.match(
  /export const FFMPEG_CORE_VERSION = '([^']+)'/,
)?.[1];
if (!runtimeVersion) {
  die('não achei FFMPEG_CORE_VERSION em lib/reels-export.ts — o runtime mudou de forma?');
}

const pinned = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  .dependencies?.['@ffmpeg/core'];
if (pinned !== runtimeVersion) {
  die(
    `versão divergente: lib/reels-export.ts diz "${runtimeVersion}" mas o package.json ` +
      `fixa "${pinned}".\n  Alinhe os dois — senão o build grava num caminho e o ` +
      'browser pede outro (404 = export quebrado).',
  );
}

let installed;
try {
  installed = JSON.parse(
    readFileSync(join(root, 'node_modules', '@ffmpeg', 'core', 'package.json'), 'utf8'),
  ).version;
} catch {
  die('@ffmpeg/core não está instalado. Rode `npm install`.');
}
if (installed !== runtimeVersion) {
  die(
    `node_modules tem @ffmpeg/core ${installed}, mas o código espera ${runtimeVersion}.\n` +
      '  Rode `npm install` para sincronizar.',
  );
}

// Variante ESM single-thread — NÃO a UMD.
//
// @ffmpeg/ffmpeg 0.12.15 sobe o worker SEMPRE com `{ type: "module" }`
// (dist/esm/classes.js). Em module worker `importScripts` não existe, então o
// worker cai no fallback e faz `import(coreURL)` esperando `.default`. O build
// UMD declara `var createFFmpegCore` (module-local, sem export) → `.default` é
// undefined → "failed to import ffmpeg-core.js". O build ESM termina com
// `export default createFFmpegCore` e é o único que carrega.
// Verificado em browser real: UMD falhou, ESM carregou e transcodificou.
//
// Single-thread de propósito: a multi-thread exige COOP/COEP (cross-origin
// isolation) no site inteiro — mudança de escopo que esta tarefa não autoriza.
const SRC_DIR = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');

// Caminho VERSIONADO: os arquivos vão com Cache-Control immutable de 1 ano
// (next.config.ts). Num caminho fixo, subir a versão do core deixaria o browser
// de quem já exportou preso no core antigo por até um ano — e core incompatível
// com o @ffmpeg/ffmpeg quebra o export inteiro. Versão na URL = core novo é URL
// nova, sem chance de cache velho.
const DEST_DIR = join(root, 'public', 'ffmpeg', runtimeVersion);
const FILES = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

mkdirSync(DEST_DIR, { recursive: true });

for (const file of FILES) {
  const src = join(SRC_DIR, file);
  let bytes;
  try {
    bytes = statSync(src).size;
  } catch {
    die(`não achei ${src}\n  O pacote @ffmpeg/core está instalado? Rode \`npm install\`.`);
  }
  copyFileSync(src, join(DEST_DIR, file));
  console.log(
    `[copy-ffmpeg-core] ${file} -> public/ffmpeg/${runtimeVersion}/ ` +
      `(${(bytes / 1024 / 1024).toFixed(1)} MB)`,
  );
}
