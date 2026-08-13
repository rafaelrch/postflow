// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ROTAS SEM `loading.tsx` + INDICADOR DE NAVEGAÇÃO PENDENTE.
 *
 * 🔴 LEIA ANTES DE CONFIAR NESTE ARQUIVO: teste em jsdom NÃO pega o defeito que
 * originou tudo isto. O boundary preso deixa a tela morta com o conteúdo
 * presente no DOM — e foi assim que ele atravessou 1150 testes verdes. O que dá
 * para travar aqui é o CONTRATO (não existe mais `loading.tsx` de rota; o
 * indicador aparece pendente e some resolvido). A verificação de verdade é em
 * navegador, em build de produção, medindo VISIBILIDADE — ver
 * `docs/bug-loading-fetch-next16.md`.
 */

const APP = join(process.cwd(), 'app');

/** Toda rota que tem `loading.tsx`, varrendo o app inteiro. */
function rotasComLoading(dir: string, achadas: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const caminho = join(dir, entry.name);
    if (existsSync(join(caminho, 'loading.tsx')) || existsSync(join(caminho, 'loading.js'))) {
      achadas.push(caminho.replace(process.cwd(), ''));
    }
    rotasComLoading(caminho, achadas);
  }
  return achadas;
}

describe('nenhuma rota volta a ter loading.tsx', () => {
  it('as três telas que morreram continuam sem loading.tsx', () => {
    for (const rota of ['dashboard', 'agenda', 'conta']) {
      const p = join(APP, '(app)', rota, 'loading.tsx');
      expect(existsSync(p), `${rota} não pode ter loading.tsx`).toBe(false);
    }
  });

  /**
   * Vale para o app INTEIRO, não só para as três: `loading.tsx` em qualquer
   * rota cujo Server Component busque dado reintroduz a tela morta. Se alguém
   * precisar de um, que quebre aqui e leia o docs antes.
   */
  it('nenhuma rota do app tem loading.tsx', () => {
    expect(rotasComLoading(APP)).toEqual([]);
  });
});

/** `useLinkStatus` só existe dentro de um `<Link>`; aqui ele é controlado. */
const mockLinkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useLinkStatus: () => mockLinkStatus,
}));

import NavPending from '@/components/ui/NavPending';

afterEach(cleanup);

/**
 * 🔴 ESTES TESTES JÁ PASSARAM COM A TELA ERRADA. A versão anterior afirmava o
 * estado do componente (`style.opacity === '0'`) e ficou verde enquanto os
 * cinco itens do menu pulsavam laranja sem navegação nenhuma: a regra da
 * animação estava solta na base do `.nav-pending`, e animação em execução ganha
 * do estilo inline. O que vale afirmar é o RESULTADO — quem decide a opacidade
 * e sob qual condição a animação existe.
 *
 * jsdom não carrega o `globals.css` nem computa animação, então a prova final é
 * no portal com `getComputedStyle`. Aqui trava-se o contrato do CSS.
 */
describe('indicador de navegação pendente', () => {
  const css = () => readFileSyncSafe(join(process.cwd(), 'app/globals.css'));

  /** O corpo de uma regra CSS pelo seletor exato. */
  const regra = (seletor: string): string => {
    const texto = css();
    const i = texto.indexOf(seletor + ' {');
    if (i < 0) throw new Error(`regra não encontrada: ${seletor}`);
    return texto.slice(i, texto.indexOf('}', i));
  };

  it('parado: a regra base esconde o ponto', () => {
    expect(regra('.nav-pending')).toMatch(/opacity:\s*0\s*;/);
  });

  /**
   * 🔴 Comentário quebrado no globals.css já derrubou regra DUAS vezes: quando
   * um bloco fecha cedo demais, o texto que sobra vira CSS inválido e o parser
   * descarta a regra seguinte EM SILÊNCIO — o arquivo continua "com a regra
   * escrita" e a tela não a tem. Grep de texto não pega; contar delimitadores
   * de abertura contra os de fechamento pega.
   */
  it('os comentários do globals.css estão balanceados', () => {
    const texto = css();
    const abre = (texto.match(/\/\*/g) ?? []).length;
    const fecha = (texto.match(/\*\//g) ?? []).length;
    expect({ abre, fecha }).toEqual({ abre, fecha: abre });
  });

  it('🔴 a animação NÃO pode viver na regra base — foi esse o defeito', () => {
    // Na base, animação rodando sobrepõe qualquer opacidade e o ponto fica
    // aceso para sempre.
    expect(regra('.nav-pending')).not.toMatch(/animation:/);
  });

  it('a animação só existe sob data-pendente=true, junto com a opacidade', () => {
    const pendente = regra(".nav-pending[data-pendente='true']");
    expect(pendente).toMatch(/animation:\s*nav-pending-pulso/);
    expect(pendente).toMatch(/opacity:\s*1\s*;/);
  });

  it('o componente NÃO escreve opacidade inline — uma fonte de verdade só', () => {
    mockLinkStatus.pending = false;
    const { container } = render(<NavPending />);
    const ponto = container.querySelector('.nav-pending') as HTMLElement;

    // Inline perderia para a animação; quem manda é o atributo.
    expect(ponto.style.opacity).toBe('');
    expect(ponto.dataset.pendente).toBe('false');
  });

  it('o atributo acompanha o estado da navegação', () => {
    mockLinkStatus.pending = true;
    const { container } = render(<NavPending />);
    expect((container.querySelector('.nav-pending') as HTMLElement).dataset.pendente).toBe('true');
  });

  it('está sempre no DOM, com tamanho fixo — aparecer não empurra o menu', () => {
    mockLinkStatus.pending = false;
    const { container } = render(<NavPending />);
    const ponto = container.querySelector('.nav-pending') as HTMLElement;

    // Some por opacidade, nunca por deixar de existir: é o que evita o
    // pulo de layout quando o estado muda.
    expect(ponto.className).toContain('w-3');
    expect(ponto.className).toContain('h-3');
    expect(ponto.className).toContain('shrink-0');
  });

  it('é decorativo para leitor de tela', () => {
    mockLinkStatus.pending = true;
    const { container } = render(<NavPending />);
    expect(container.querySelector('.nav-pending')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('o indicador respeita quem pediu menos movimento', () => {
  it('em prefers-reduced-motion a animação sai, mas o ponto continua', () => {
    const css = readFileSyncSafe(join(process.cwd(), 'app/globals.css'));
    const bloco = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

    // Sem animação…
    expect(bloco).toMatch(/animation:\s*none/);
    // …e sem `display:none`: quem pediu menos movimento não pediu menos
    // informação — o ponto tem de continuar visível quando pendente.
    expect(bloco).not.toMatch(/\.nav-pending[^{]*{[^}]*display:\s*none/);

    // 🔴 Tem de casar a especificidade da regra que LIGA a animação. Desligar
    // só em `.nav-pending` (0,1,0) não vence `.nav-pending[data-pendente…]`
    // (0,2,0), e quem pediu menos movimento continuaria vendo o pulso.
    expect(bloco).toMatch(/\.nav-pending\[data-pendente='true'\][^{]*{[^}]*animation:\s*none/);
  });
});

function readFileSyncSafe(p: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(p, 'utf8');
}
