/**
 * Carga de UM carrossel no editor — os desfechos, separados.
 *
 * A versão anterior colapsava tudo numa frase só:
 *
 *     const { data: carousel, error } = await supabase…single();
 *     if (error || !carousel) setLoadError('Carrossel não encontrado.');
 *
 * "Não encontrado" é uma AFIRMAÇÃO sobre os dados do usuário, e só pode ser
 * feita quando a query de fato respondeu que não há nada. Ali ela era dita
 * também quando a query falhou, quando a rede caiu e quando o pedido demorou
 * demais — desfechos em que o carrossel existe e está inteiro. O usuário via
 * "não encontrado" para um carrossel que ele tinha acabado de abrir, e a única
 * saída oferecida era voltar ao Dashboard.
 *
 * É a mesma família do defeito do dashboard (ver `lib/dashboard-data.ts`), e a
 * regra é a mesma: falha não vira ausência.
 *
 * 🔴 `.single()` trata "zero linhas" como ERRO (PGRST116), que é justamente o
 * que embaralha ausência com falha. Quem chama passa `maybeSingle()`: ausência
 * chega como `data: null, error: null` e fica distinguível de um erro real.
 */

/** Por que não deu para carregar AGORA — nenhum deles significa "não existe". */
export type CarouselLoadFailure = 'timeout' | 'query';

export type CarouselLoadOutcome<T> =
  /** A query respondeu e trouxe o carrossel. */
  | { kind: 'loaded'; carousel: T }
  /** A query respondeu que não há nada — não existe, ou não é deste usuário. */
  | { kind: 'absent' }
  /** A query não respondeu. O carrossel pode estar lá; tentar de novo faz sentido. */
  | { kind: 'unavailable'; reason: CarouselLoadFailure };

/** Teto de espera. Estourar não é "não encontrado", é `timeout`. */
export const CAROUSEL_LOAD_TIMEOUT_MS = 8000;

/**
 * Roda a query e classifica o desfecho. Nunca lança: quem chama está dentro de
 * um efeito de render, e uma exceção ali vira tela branca.
 */
export async function loadCarouselById<T>(
  query: PromiseLike<{ data: T | null; error: unknown }>,
  {
    timeoutMs = CAROUSEL_LOAD_TIMEOUT_MS,
    onError,
  }: {
    timeoutMs?: number;
    onError?: (kind: CarouselLoadFailure, detail: unknown) => void;
  } = {},
): Promise<CarouselLoadOutcome<T>> {
  const TIMEOUT = Symbol('timeout');

  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });

  try {
    const resultado = await Promise.race([
      // Rejeição (rede fora, DNS, CORS) entra como erro de query, não como
      // exceção — senão o `catch` lá embaixo perderia a distinção.
      Promise.resolve(query).then((r) => r, (e) => ({ data: null, error: e })),
      prazo,
    ]);

    if (resultado === TIMEOUT) {
      onError?.('timeout', `generator: carrossel passou de ${timeoutMs}ms`);
      return { kind: 'unavailable', reason: 'timeout' };
    }

    const { data, error } = resultado as { data: T | null; error: unknown };

    if (error) {
      onError?.('query', error);
      return { kind: 'unavailable', reason: 'query' };
    }

    // Só AQUI se pode dizer que não existe: a query respondeu, sem erro, sem linha.
    if (!data) return { kind: 'absent' };

    return { kind: 'loaded', carousel: data };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
