/**
 * Carga do dashboard — os TRÊS desfechos, separados.
 *
 * A versão anterior colapsava tudo numa lista vazia:
 *
 *   const result = await withTimeout(query, 4000, { data: [] });
 *
 * Erro de query e estouro de tempo caíam no mesmo `{ data: [] }` de "usuário
 * não tem carrossel" — sem log, sem aviso, sem repetir. Medido no dev server:
 * a rota fria gasta 4,2 s de application-code contra o teto de 4 s, então o
 * fallback disparava e o dashboard aparecia VAZIO. Um F5 caía em 1,3 s e
 * "consertava", que é exatamente o que o Rafael descreveu.
 *
 * O defeito não é o tempo: é o fallback MENTIR sobre o resultado. Lista vazia é
 * uma afirmação sobre os dados do usuário, e só pode ser feita quando a query
 * de fato respondeu que não há nada.
 */

/** Colunas da capa que o `mapDbSlideToSlide` realmente lê. */
export const DASHBOARD_COVER_COLUMNS = [
  'id', 'position', 'title', 'description', 'subtitle', 'highlight_word', 'highlights',
  'background_image_url', 'grid_image_url', 'image_type', 'image_position',
  'content_image_url', 'content_image_position', 'background_image_opacity',
  'shadow_style', 'shadow_opacity', 'shadow_color', 'shadow_size', 'shadow_distance',
  'background_color', 'text_position', 'text_offset', 'text_alignment', 'font_size',
  'line_height', 'cta_button', 'title_color', 'description_color', 'subtitle_color',
  'title_font', 'description_font', 'subtitle_font', 'title_underline',
  'description_underline', 'subtitle_underline', 'title_letter_spacing',
  'title_description_gap', 'text_padding', 'content_layout', 'template_slots',
  'template_model', 'template_overrides', 'template_slot_styles',
  'editorial_title_offset_y', 'editorial_desc_offset_y', 'editorial_image_offset_y',
].join(', ');

export const DASHBOARD_SELECT =
  'id, title, style, status, accent_color, theme, font_pair, corners, profile_badge, ' +
  `global_settings, created_at, updated_at, slides(count), coverSlide:slides(${DASHBOARD_COVER_COLUMNS})`;

/** Teto de espera da query. Estourar não é mais "lista vazia", é `timeout`. */
export const DASHBOARD_TIMEOUT_MS = 8000;

export type DashboardLoadError = 'timeout' | 'query';

export interface DashboardLoadResult<T> {
  carousels: T[];
  /** `null` quando a query respondeu — inclusive respondendo que não há nada. */
  error: DashboardLoadError | null;
  /**
   * Total de carrosséis do usuário (o `count: 'exact'` da mesma query), não o
   * tamanho desta página. `null` quando a query não respondeu — aí não se sabe
   * quantos existem, e zero seria a mesma mentira que a lista vazia.
   */
  total: number | null;
}

/* ── Paginação ──────────────────────────────────────────────────────────────
   Recorte no BANCO, com `.range()`. Buscar tudo para mostrar 10 seria andar
   para trás exatamente onde já apanhamos: a query desta rota custava 4,2s,
   estourava o teto e o dashboard aparecia VAZIO. Menos linha é menos tempo. */

/** Quantos carrosséis por página. Número do Rafael. */
export const DASHBOARD_PAGE_SIZE = 10;

/**
 * Página pedida no URL → inteiro ≥ 1.
 *
 * Lixo (texto, 0, negativo, array, ausente) vira 1: é o único palpite que não
 * mente para o usuário. Passar do fim é caso à parte — quem sabe o total é a
 * query, então quem trata é a página (ver `dashboard/page.tsx`).
 */
export function parsePageParam(raw: string | string[] | undefined): number {
  const bruto = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(bruto);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Intervalo fechado que o `.range()` do PostgREST espera: página 2 → 10..19. */
export function rangeForPage(page: number, size: number = DASHBOARD_PAGE_SIZE) {
  const from = (page - 1) * size;
  return { from, to: from + size - 1 };
}

/** Quantas páginas existem. Zero item continua sendo UMA página (a vazia). */
export function totalPagesFor(total: number, size: number = DASHBOARD_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * O QUARTO caso: a página pedida está além do fim.
 *
 * Não é nenhum dos três desfechos da carga — a query responde bem, o usuário é
 * que pediu um endereço que não existe (URL chutada, ou o último item da última
 * página foi apagado). Devolve para onde mandar, ou `null` quando a página
 * pedida serve.
 *
 * `total` desconhecido (carga falhada) devolve `null` de propósito: sem saber
 * quantos existem, redirecionar esconderia o erro atrás de uma navegação.
 */
export function pageRedirectTarget(
  pedida: number,
  total: number | null,
  size: number = DASHBOARD_PAGE_SIZE,
): number | null {
  if (total === null || total <= 0) return null;
  const paginas = totalPagesFor(total, size);
  return pedida > paginas ? paginas : null;
}

/* ── Busca ──────────────────────────────────────────────────────────────────
   🔴 A busca consulta o BANCO, não a página já carregada.

   A primeira versão filtrava `carousels` no cliente — e como o cliente só tem
   os 10 da página aberta, digitar o título de um carrossel da página 2 dava
   "não achei" sobre um item que EXISTE. Filtro de cliente sobre lista paginada
   não é busca: é busca dentro da janela.

   O recorte por `.range()` e a contagem continuam iguais; a busca só acrescenta
   um `ilike` às DUAS queries (a de contagem e a de linhas), para que o total, o
   número de páginas e o intervalo falem do resultado da busca, não do acervo. */

/** Termo do `?q` → texto limpo. Só espaço em branco é o mesmo que não buscar. */
export function parseSearchParam(raw: string | string[] | undefined): string {
  const bruto = Array.isArray(raw) ? raw[0] : raw;
  return typeof bruto === 'string' ? bruto.trim() : '';
}

/**
 * Termo do usuário → padrão do `ilike`.
 *
 * `%` e `_` são coringas do LIKE: sem escapar, quem digita "50%" pediria "50
 * seguido de qualquer coisa" e receberia carrossel que nada tem a ver. `\` vem
 * primeiro no grupo porque escapar o escape depois desfaria os outros dois.
 */
export function ilikePatternFor(termo: string): string {
  return `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Endereço da lista. Página e busca vivem no URL — as duas juntas, senão
 * paginar um resultado de busca perderia o termo, e limpar a busca deixaria o
 * usuário na página 7 de uma lista que agora tem 2.
 */
export function dashboardHref(page: number, termo: string = ''): string {
  const params = new URLSearchParams();
  if (termo) params.set('q', termo);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : '/dashboard';
}

/* Tipos estruturais: o mínimo do builder do PostgREST que estas duas queries
   usam. Existem para o teste poder passar um banco de mentira e provar que a
   busca de fato consulta o banco — com um client real embutido não haveria como
   afirmar isso sem rede. */
export type DashboardBuilder = {
  eq(column: string, value: unknown): DashboardBuilder;
  ilike(column: string, pattern: string): DashboardBuilder;
  order(column: string, opts: { ascending: boolean }): DashboardBuilder;
  range(from: number, to: number): DashboardBuilder;
};

export type DashboardSupabase = {
  from(table: string): {
    select(sel: string, opts?: { count?: 'exact'; head?: boolean }): DashboardBuilder;
  };
};

/**
 * Contagem — só o cabeçalho (`head: true`), zero linha. Com termo, conta o
 * RESULTADO da busca: é ele que decide quantas páginas existem.
 */
export function dashboardCountQuery(supabase: DashboardSupabase, termo: string = ''): DashboardBuilder {
  const q = supabase.from('carousels').select('id', { count: 'exact', head: true });
  return termo ? q.ilike('title', ilikePatternFor(termo)) : q;
}

/** As linhas desta página — mesma query de sempre, mais o `ilike` da busca. */
export function dashboardCarouselsQuery(
  supabase: DashboardSupabase,
  { from, to, termo = '' }: { from: number; to: number; termo?: string },
): DashboardBuilder {
  const base = supabase
    .from('carousels')
    .select(DASHBOARD_SELECT, { count: 'exact' })
    .eq('coverSlide.position', 0);
  const comBusca = termo ? base.ilike('title', ilikePatternFor(termo)) : base;
  return comBusca.order('updated_at', { ascending: false }).range(from, to);
}

/** O mínimo que este módulo precisa saber de um client Supabase. */
export interface DashboardQuery<T> {
  then: Promise<{ data: T[] | null; error: unknown }>['then'];
}

/**
 * Roda a query e classifica o desfecho. Nunca lança: quem chama é um Server
 * Component, e derrubar a página seria trocar um defeito por outro.
 */
export async function loadDashboardCarousels<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>,
  {
    timeoutMs = DASHBOARD_TIMEOUT_MS,
    onError,
  }: { timeoutMs?: number; onError?: (kind: DashboardLoadError, detail: unknown) => void } = {},
): Promise<DashboardLoadResult<T>> {
  const TIMEOUT = Symbol('timeout');

  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });

  try {
    const resultado = await Promise.race([
      Promise.resolve(query).then((r) => r, (e) => ({ data: null, error: e })),
      prazo,
    ]);

    if (resultado === TIMEOUT) {
      onError?.('timeout', `dashboard: query passou de ${timeoutMs}ms`);
      // `total: null` pelo mesmo motivo da lista vazia: não se sabe.
      return { carousels: [], error: 'timeout', total: null };
    }

    const { data, error, count } = resultado as {
      data: T[] | null; error: unknown; count?: number | null;
    };
    if (error) {
      onError?.('query', error);
      return { carousels: [], error: 'query', total: null };
    }

    // Só AQUI a lista vazia é uma afirmação sobre os dados do usuário.
    const carousels = Array.isArray(data) ? data : [];
    return {
      carousels,
      error: null,
      // Sem `count: 'exact'` na query o PostgREST não manda contagem; aí o
      // total é o que veio (uma página só).
      total: typeof count === 'number' ? count : carousels.length,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
