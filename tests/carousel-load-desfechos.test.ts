import { describe, it, expect, vi } from 'vitest';
import { loadCarouselById, CAROUSEL_LOAD_TIMEOUT_MS } from '@/lib/carousel-load';

/**
 * CARGA DO CARROSSEL NO EDITOR — os desfechos não podem se misturar.
 *
 * O defeito que estes testes trancam: `if (error || !carousel)` dizia
 * "Carrossel não encontrado" para QUALQUER coisa que não fosse sucesso. Falha
 * de rede, erro de query e timeout viravam a afirmação de que o carrossel não
 * existe — e a única saída oferecida era voltar ao Dashboard, num caso em que
 * o carrossel está inteiro e bastava tentar de novo.
 *
 * Mesma família do defeito do dashboard (ver `lib/dashboard-data.ts`): falha
 * não vira ausência.
 */

/** Query que responde na hora com o que o teste mandar. */
const respondendo = <T>(r: { data: T | null; error: unknown }) => Promise.resolve(r);

describe('os três desfechos, separados', () => {
  it('CARREGOU: query respondeu com o carrossel', async () => {
    const carousel = { id: 'c1', title: 'Meu deck' };
    const out = await loadCarouselById(respondendo({ data: carousel, error: null }));

    expect(out.kind).toBe('loaded');
    expect(out.kind === 'loaded' && out.carousel).toEqual(carousel);
  });

  it('NÃO EXISTE MESMO: query respondeu, sem erro e sem linha', async () => {
    const out = await loadCarouselById(respondendo({ data: null, error: null }));

    // Só aqui se pode afirmar ausência: a query respondeu que não há nada.
    expect(out.kind).toBe('absent');
  });

  it('NÃO DEU PARA CARREGAR: erro de query NÃO vira "não existe"', async () => {
    const out = await loadCarouselById(
      respondendo({ data: null, error: { message: 'permission denied' } }),
    );

    expect(out.kind).toBe('unavailable');
    expect(out.kind === 'unavailable' && out.reason).toBe('query');
  });

  it('NÃO DEU PARA CARREGAR: rede fora (promise rejeitada) também não é ausência', async () => {
    const out = await loadCarouselById(Promise.reject(new Error('Failed to fetch')));

    expect(out.kind).toBe('unavailable');
    expect(out.kind === 'unavailable' && out.reason).toBe('query');
  });

  it('NÃO DEU PARA CARREGAR: timeout não vira "não existe"', async () => {
    vi.useFakeTimers();
    try {
      // Query que nunca responde — é o caso que antes travava em "Carregando"
      // ou caía como "não encontrado".
      const pendente = new Promise<{ data: null; error: unknown }>(() => {});
      const p = loadCarouselById(pendente, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(60);
      const out = await p;

      expect(out.kind).toBe('unavailable');
      expect(out.kind === 'unavailable' && out.reason).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('contrato de quem chama', () => {
  it('avisa o erro para o log, com a classificação', async () => {
    const onError = vi.fn();
    await loadCarouselById(respondendo({ data: null, error: { code: '42501' } }), { onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe('query');
  });

  it('NÃO avisa erro quando a resposta é "não existe" — ausência não é falha', async () => {
    const onError = vi.fn();
    await loadCarouselById(respondendo({ data: null, error: null }), { onError });

    expect(onError).not.toHaveBeenCalled();
  });

  it('nunca lança: quem chama está dentro de um efeito de render', async () => {
    await expect(
      loadCarouselById(Promise.reject(new Error('boom'))),
    ).resolves.toBeTruthy();
  });

  it('o teto de espera tem valor declarado', () => {
    expect(CAROUSEL_LOAD_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
