import { createServerSupabaseClient } from '@/lib/supabase-server';
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

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();

  // Uma query só: o slide de capa (position 0) vem embutido via PostgREST,
  // em vez da segunda round-trip que buscava as capas depois.
  const carouselsQuery = Promise.resolve(
    supabase
      .from('carousels')
      .select('id, title, style, status, accent_color, theme, font_pair, corners, profile_badge, global_settings, created_at, updated_at, slides(count), coverSlide:slides(*)')
      .eq('coverSlide.position', 0)
      .order('updated_at', { ascending: false })
  );

  const result = await withTimeout(carouselsQuery, 4000, { data: [] } as unknown as Awaited<typeof carouselsQuery>);
  type CarouselRow = Omit<DashboardCarousel, 'coverSlide'> & { coverSlide: Record<string, unknown>[] | null };
  const carousels = Array.isArray((result as { data?: unknown[] })?.data)
    ? ((result as { data: unknown[] }).data as CarouselRow[])
    : [];

  const carouselsWithCover: DashboardCarousel[] = carousels.map((c) => ({
    ...c,
    coverSlide: c.coverSlide?.[0] ?? null,
  }));

  return <DashboardClient initialCarousels={carouselsWithCover} />;
}
