import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * IDENTIDADE VISUAL DA BARRA LATERAL — uma só, e a do produto.
 *
 * A barra usava a paleta genérica do Tailwind (`gray-900`, `blue-500`,
 * `rounded-xl`) enquanto o resto do produto usa os tokens do design system
 * (`--ink`, `--paper`, `--accent`, `--radius`). O resultado era uma barra que
 * parecia de outro app — e, como cada painel de template repetia as classes na
 * mão, elas divergiam entre si.
 *
 * Este teste é o trinco: cor literal na barra volta a divergir com o tempo,
 * então ela é proibida por construção em vez de por revisão.
 */

const SIDEBAR_DIR = join(process.cwd(), 'components/editor/sidebar');
const OUTROS = [
  'components/editor/EditorSidebar.tsx',
  'components/editor/Template01Slots.tsx',
  'components/editor/Template02Slots.tsx',
  'components/editor/Slider.tsx',
];

/** Paleta genérica que não pode voltar. `red-500` fica de fora: erro é estado
 *  semântico e ainda não tem token próprio no design system. */
const PROIBIDO = /\b(?:text|bg|border|ring|from|to)-(?:gray|blue|slate|zinc|neutral|indigo|sky)-\d{2,3}\b/;

function arquivosDaBarra(): string[] {
  const daPasta = readdirSync(SIDEBAR_DIR)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => join('components/editor/sidebar', f));
  return [...daPasta, ...OUTROS];
}

describe('barra lateral do editor — identidade única', () => {
  it('nenhum arquivo da barra usa a paleta genérica do Tailwind', () => {
    const infratores: string[] = [];

    for (const rel of arquivosDaBarra()) {
      const conteudo = readFileSync(join(process.cwd(), rel), 'utf8');
      conteudo.split('\n').forEach((linha, i) => {
        const m = linha.match(PROIBIDO);
        if (m) infratores.push(`${rel}:${i + 1} → ${m[0]}`);
      });
    }

    expect(infratores, `use os tokens do globals.css:\n${infratores.join('\n')}`).toEqual([]);
  });

  it('os tokens compartilhados falam a língua do design system', () => {
    const tokens = readFileSync(join(SIDEBAR_DIR, 'tokens.ts'), 'utf8');
    for (const token of ['--ink', '--paper', '--line-strong', '--radius-sm']) {
      expect(tokens, `tokens.ts deveria usar ${token}`).toContain(token);
    }
  });

  it('a barra não encosta no topo', () => {
    const shell = readFileSync(join(process.cwd(), 'components/editor/EditorSidebar.tsx'), 'utf8');
    const header = readFileSync(join(SIDEBAR_DIR, 'SidebarScopeHeader.tsx'), 'utf8');

    // O respiro deixou de ser um `pt` na lista rolável: com o redesenho, o
    // primeiro grupo SEMPRE abre uma linha de cabeçalho, porque é ela que
    // carrega a pílula "Voltar para Dashboard". Continua valendo o que o teste
    // protegia — o primeiro painel nunca nasce colado na borda de cima, mesmo
    // no Profile, cujo primeiro grupo não tem rótulo.
    expect(shell).toMatch(/leading=\{i === 0/);
    expect(header).toMatch(/pt-\[\d+px\]/);
  });

  it('a pele do estúdio vem de token, não de hex no componente', () => {
    // Os cinzas neutros do editor moram em globals.css. Hex literal em
    // componente é o começo da divergência que este arquivo existe para evitar.
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    for (const token of ['--studio-panel', '--studio-row', '--studio-line', '--studio-select']) {
      expect(css, `globals.css deveria declarar ${token}`).toContain(token);
    }

    // Só os arquivos de PELE. Os hex que sobram na barra são cor de CONTEÚDO —
    // padrão de fundo de slide, amostra de paleta, cor de marca de template —
    // que é dado do carrossel, não estilo da página.
    const PELE = [
      'components/editor/SlideCanvas.tsx',
      'components/editor/FormatDropdown.tsx',
      'components/editor/sidebar/SidebarPanel.tsx',
      'components/editor/sidebar/SidebarScopeHeader.tsx',
      'components/editor/sidebar/SidebarGroup.tsx',
      'components/editor/sidebar/tokens.ts',
    ];

    const HEX = /#[0-9a-fA-F]{3,8}\b/;
    const infratores: string[] = [];
    for (const rel of PELE) {
      readFileSync(join(process.cwd(), rel), 'utf8').split('\n').forEach((linha, i) => {
        const m = linha.match(HEX);
        if (m) infratores.push(`${rel}:${i + 1} → ${m[0]}`);
      });
    }
    expect(infratores, `use um token do globals.css:\n${infratores.join('\n')}`).toEqual([]);
  });
});
