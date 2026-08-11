import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  DASHBOARD_PAGE_SIZE,
  dashboardCarouselsQuery,
  dashboardCountQuery,
  dashboardHref,
  loadDashboardCarousels,
  pageRedirectTarget,
  parsePageParam,
  parseSearchParam,
  rangeForPage,
  totalPagesFor,
  type DashboardSupabase,
} from '@/lib/dashboard-data';
import DashboardClient from './DashboardClient';

export type DashboardCarousel = {
  id: string;
  title: string;
  style: string;
  status: string;
  accent_color: string;
  theme: string;
  font_pair: string;
  corners: Record<string, unknown> | null;
  profile_badge: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  slides: { count: number }[];
  coverSlide: Record<string, unknown> | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  // Nesta versão do Next `searchParams` é uma PROMISE e precisa de await —
  // conferido em node_modules/next/dist/docs/01-app/03-api-reference/
  // 03-file-conventions/page.md, que é a fonte da verdade por AGENTS.md.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabaseClient();
  const sp = await searchParams;
  const pedida = parsePageParam(sp.page);

  // 🔴 A BUSCA É DO BANCO. Filtrar no cliente só varria os 10 da página aberta,
  // e um título que existe na página 2 aparecia como "não encontrado". O termo
  // entra nas DUAS queries abaixo, para o total e o número de páginas falarem
  // do resultado da busca, e não do acervo inteiro.
  const termo = parseSearchParam(sp.q);
  const db = supabase as unknown as DashboardSupabase;

  // 🔴 Contagem ANTES do recorte, com `head: true` (traz só o cabeçalho, zero
  // linha). Não é luxo: pedir um `.range()` além do fim faz o PostgREST
  // responder ERRO, e sem isto uma URL como `?page=99` caía no desfecho
  // "falhou ao carregar" — o QUARTO caso disfarçado de um dos três, que é
  // justamente o que a carga desta tela existe para impedir.
  const { count: totalBruto } = await (dashboardCountQuery(db, termo) as unknown as PromiseLike<{
    count: number | null;
  }>);
  const totalConhecido = typeof totalBruto === 'number' ? totalBruto : null;

  // Passou do fim (URL chutada, ou o último item da última página foi apagado):
  // manda para a última página REAL, para o endereço combinar com a tela. O
  // termo vai junto: perder a busca no caminho jogaria o usuário no acervo.
  const destino = pageRedirectTarget(pedida, totalConhecido, DASHBOARD_PAGE_SIZE);
  if (destino !== null) redirect(dashboardHref(destino, termo));

  const pagina = pedida;
  const { from, to } = rangeForPage(pagina);

  // Uma query só: o slide de capa (position 0) vem embutido via PostgREST, e
  // com as COLUNAS NOMEADAS — o `slides(*)` de antes trazia `carousel_id`,
  // `metadata`, `created_at` e `updated_at` que o `mapDbSlideToSlide` nunca lê.
  //
  // 🔴 O recorte é do BANCO (`.range()`), não do cliente: são 10 linhas por
  // página em vez de todas. `count: 'exact'` traz o total na MESMA query, sem
  // uma segunda ida ao banco só para contar.
  const carouselsQuery = dashboardCarouselsQuery(db, { from, to, termo });

  type CarouselRow = Omit<DashboardCarousel, 'coverSlide'> & { coverSlide: Record<string, unknown>[] | null };

  const { carousels, error, total } = await loadDashboardCarousels<CarouselRow>(
    carouselsQuery as unknown as PromiseLike<{
      data: CarouselRow[] | null; error: unknown; count?: number | null;
    }>,
    {
      // Falha silenciosa é o que criou o bug; daqui em diante ela aparece no
      // log do servidor.
      onError: (kind, detail) => console.error(`[dashboard] carga falhou (${kind}):`, detail),
    },
  );

  // O total confiável é o da contagem; o da query recortada serve de reserva.
  const totalFinal = totalConhecido ?? total;
  const totalPaginas = totalPagesFor(totalFinal ?? 0, DASHBOARD_PAGE_SIZE);

  const carouselsWithCover: DashboardCarousel[] = carousels.map((c) => ({
    ...c,
    coverSlide: c.coverSlide?.[0] ?? null,
  }));

  return (
    <DashboardClient
      initialCarousels={carouselsWithCover}
      loadError={error}
      page={pagina}
      totalPages={totalPaginas}
      totalCarousels={totalFinal}
      searchTerm={termo}
    />
  );
}
