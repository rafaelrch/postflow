'use client';

import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const { session } = data;
      if (!session) {
        const next = encodeURIComponent(pathname || '/dashboard');
        router.replace(`/login?next=${next}`);
        return;
      }

      if (pathname !== '/onboarding' && pathname !== '/setup') {
        supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile }: { data: { onboarding_completed: boolean } | null }) => {
            if (!profile?.onboarding_completed) {
              router.replace('/onboarding');
            }
          });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (!session) {
        const next = encodeURIComponent(pathname || '/dashboard');
        router.replace(`/login?next=${next}`);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [pathname, router]);

  return <>{children}</>;
}
