'use client';

import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

// A checagem de onboarding roda uma vez por carregamento do app — o proxy
// (middleware) já protege as rotas a cada navegação, então repetir
// getSession + select em profiles a cada troca de pathname só somava
// round-trips ao Supabase em todo clique do sidebar.
let onboardingChecked = false;

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const { session } = data;
      const pathname = window.location.pathname;
      if (!session) {
        const next = encodeURIComponent(pathname || '/dashboard');
        router.replace(`/login?next=${next}`);
        return;
      }

      if (!onboardingChecked && pathname !== '/onboarding' && pathname !== '/setup') {
        onboardingChecked = true;
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
        const next = encodeURIComponent(window.location.pathname || '/dashboard');
        router.replace(`/login?next=${next}`);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  return <>{children}</>;
}
