import { createBrowserClient } from '@supabase/ssr';

// The project does not use generated Supabase DB types yet, so we keep the
// browser client loosely typed to avoid breaking existing queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: any = null;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return browserClient;
}
