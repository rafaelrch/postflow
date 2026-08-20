// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * EXPORTAÇÃO SAINDO SEM A IMAGEM — achado do Rafael no portal.
 *
 * O que está travado aqui é o MECANISMO provado, não um palpite:
 *
 * O html-to-image guarda num cache de módulo o resultado de cada URL de
 * imagem — e guarda também o FRACASSO. Quando um download falha, ele grava
 * string vazia para aquela URL (`lib/dataurl.js`, `resourceToDataURL`) e
 * devolve essa string em toda chamada seguinte. A camada vira
 * `background-image: url("")`, o PNG sai sem imagem, e não há UM aviso no
 * console, porque o `console.warn` da lib só roda na primeira tentativa.
 * Da falha em diante, toda exportação daquela aba sai quebrada até um reload —
 * e um `fetch` manual da mesma URL responde 200 alegremente, porque a rede
 * nunca mais é consultada.
 *
 * O cache é chaveado pela URL SEM a query, então `cacheBust` não escapa do
 * fracasso gravado: ele só aumenta a chance de cair nele, porque força baixar
 * tudo de novo da rede a cada exportação.
 *
 * Estes testes rodam sem browser. Eles NÃO provam que o PNG final tem a
 * imagem — isso só a tela responde. Provam o que dá para provar aqui: as
 * opções que mandamos para a lib, e o comportamento do cache que motivou a
 * mudança.
 */

class FakeSVGImageElement {}
vi.stubGlobal('SVGImageElement', FakeSVGImageElement);

import { EXPORT_IMAGE_OPTIONS } from '@/hooks/useExport';

/**
 * URL NOVA a cada caso, de propósito: o cache do html-to-image é chaveado por
 * URL e vive no módulo. Reaproveitar a mesma URL faz um teste enxergar o
 * resultado do anterior — que é exatamente o mecanismo em julgamento aqui.
 */
let seq = 0;
const novaUrl = () =>
  `https://abc.supabase.co/storage/v1/object/public/postflow-assets/uid/carousel-images/s${++seq}-1738000000000.png`;

/** 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const redeOk = (registro?: string[]) =>
  vi.stubGlobal('fetch', async (u: string) => {
    registro?.push(u);
    return {
      status: 200,
      url: u,
      headers: { get: () => 'image/png' },
      blob: async () => new Blob([PNG], { type: 'image/png' }),
    };
  });

/** Roda o embed do html-to-image numa camada igual à dos slides. */
async function embedir(url: string, options: Record<string, unknown>) {
  const { embedImages } = await import('html-to-image/lib/embed-images');
  const el = document.createElement('div');
  el.setAttribute('style', `background-image: url("${url}"); background-size: cover;`);
  document.body.appendChild(el);
  await embedImages(el as never, options as never);
  return el.getAttribute('style') ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('as opções que mandamos para o html-to-image', () => {
  it('NÃO pedem cacheBust', () => {
    // Ver o comentário em `useExport.ts`: aqui URL de imagem nunca muda de
    // conteúdo (todo upload e toda geração escrevem num caminho novo, com
    // `upsert: false`), então `cacheBust` não evita imagem velha nenhuma — só
    // força rebaixar tudo a cada exportação e alarga a janela de falha.
    expect(EXPORT_IMAGE_OPTIONS).not.toHaveProperty('cacheBust');
  });

  it('mantêm o pixelRatio 2 — a exportação não pode perder resolução', () => {
    expect(EXPORT_IMAGE_OPTIONS.pixelRatio).toBe(2);
  });

  it('com elas, a imagem é embutida como data URL, pedindo a URL limpa', async () => {
    const pedidos: string[] = [];
    const url = novaUrl();
    redeOk(pedidos);

    const style = await embedir(url, { ...EXPORT_IMAGE_OPTIONS });

    expect(style).toContain('url("data:image/png;base64,');
    // Sem cacheBust a URL vai limpa: o browser pode reusar o que o preview já
    // baixou, em vez de puxar tudo de novo da rede.
    expect(pedidos).toEqual([url]);
    expect(pedidos[0]).not.toMatch(/\?/);
  });
});

describe('o cache do html-to-image guarda o fracasso — é o que trava a exportação', () => {
  it('uma falha e a URL fica vazia para sempre, mesmo com a rede de volta', async () => {
    // É esta a assinatura do bug: PNG sem imagem e console limpo.
    const url = novaUrl();
    const camada = () => embedir(url, { ...EXPORT_IMAGE_OPTIONS });

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await camada()).toContain('background-image: url("")');

    redeOk();
    // A rede voltou — e não adianta: quem responde agora é o cache do módulo.
    expect(await camada()).toContain('background-image: url("")');
  });

  it('cacheBust não escapa do fracasso gravado — a chave ignora a query', async () => {
    // Se escapasse, ligar `cacheBust` seria uma saída. Não é: `getCacheKey`
    // corta a query, e a query do cacheBust só é acrescentada DEPOIS da
    // consulta ao cache.
    const url = novaUrl();
    const camada = (options: Record<string, unknown>) => embedir(url, options);

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await camada({ pixelRatio: 2 });

    redeOk();
    expect(await camada({ pixelRatio: 2, cacheBust: true })).toContain('background-image: url("")');
    expect(await camada({ pixelRatio: 2, cacheBust: true, includeQueryParams: true })).toContain('background-image: url("")');
  });

  it('a falha gruda na URL, não na sessão inteira', async () => {
    // Uma imagem que falhou some para sempre; as OUTRAS continuam saindo. É por
    // isso que o bug consegue parecer intermitente e parcial para quem testa —
    // e é o motivo de o conserto de verdade depender de saber por que a
    // primeira tentativa falhou.
    const quebrada = novaUrl();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await embedir(quebrada, { ...EXPORT_IMAGE_OPTIONS })).toContain('background-image: url("")');

    redeOk();
    expect(await embedir(quebrada, { ...EXPORT_IMAGE_OPTIONS })).toContain('background-image: url("")');
    expect(await embedir(novaUrl(), { ...EXPORT_IMAGE_OPTIONS })).toContain('base64');
  });
});
