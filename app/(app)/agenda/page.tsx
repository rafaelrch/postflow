import { createServerSupabaseClient } from '@/lib/supabase-server';
import AgendaClient from './AgendaClient';

export type ScheduledPost = {
  id: string;
  scheduled_at: string;
  kind: 'carousel' | 'news' | 'note';
  title: string;
  note: string;
  carousel_id: string | null;
  status: 'planned' | 'ready' | 'published' | 'skipped';
  created_at: string;
  updated_at: string;
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

export default async function AgendaPage() {
  const supabase = await createServerSupabaseClient();

  const query = Promise.resolve(
    supabase
      .from('scheduled_posts')
      .select('id, scheduled_at, kind, title, note, carousel_id, status, created_at, updated_at')
      .order('scheduled_at', { ascending: true })
  );

  const result = await withTimeout(query, 4000, { data: [] } as unknown as Awaited<typeof query>);
  const posts = Array.isArray((result as { data?: unknown[] })?.data)
    ? ((result as { data: unknown[] }).data as ScheduledPost[])
    : [];

  return <AgendaClient initialPosts={posts} />;
}
