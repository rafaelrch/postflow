import { createServerSupabaseClient } from '@/lib/supabase-server';
import DashboardClient from './DashboardClient';

type DashboardCarousel = {
  id: string;
  title: string;
  style: string;
  accent_color: string;
  created_at: string;
  updated_at: string;
  slides: { count: number }[];
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

  const query = Promise.resolve(
    supabase
      .from('carousels')
      .select('*, slides(count)')
      .order('updated_at', { ascending: false })
  );

  const result = await withTimeout(query, 4000, { data: [] } as unknown as Awaited<typeof query>);
  const carousels = Array.isArray((result as { data?: unknown[] })?.data)
    ? ((result as { data: unknown[] }).data as DashboardCarousel[])
    : [];

  return <DashboardClient initialCarousels={carousels} />;
}
