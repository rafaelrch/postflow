import { createServerSupabaseClient } from '@/lib/supabase-server';
import DashboardClient from './DashboardClient';

export type DashboardCarousel = {
  id: string;
  title: string;
  style: string;
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

  const carouselsQuery = Promise.resolve(
    supabase
      .from('carousels')
      .select('id, title, style, accent_color, theme, font_pair, corners, profile_badge, created_at, updated_at, slides(count)')
      .order('updated_at', { ascending: false })
  );

  const result = await withTimeout(carouselsQuery, 4000, { data: [] } as unknown as Awaited<typeof carouselsQuery>);
  const carousels = Array.isArray((result as { data?: unknown[] })?.data)
    ? ((result as { data: unknown[] }).data as Omit<DashboardCarousel, 'coverSlide'>[])
    : [];

  // Fetch cover slide (position 0) for each carousel
  let coverSlides: Record<string, unknown>[] = [];
  if (carousels.length > 0) {
    const ids = carousels.map((c) => c.id);
    const { data } = await supabase
      .from('slides')
      .select('*')
      .in('carousel_id', ids)
      .eq('position', 0);
    coverSlides = (data as Record<string, unknown>[]) || [];
  }

  const carouselsWithCover: DashboardCarousel[] = carousels.map((c) => ({
    ...c,
    coverSlide: coverSlides.find((s) => s.carousel_id === c.id) ?? null,
  }));

  return <DashboardClient initialCarousels={carouselsWithCover} />;
}
