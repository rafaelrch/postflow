'use client';

import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

// A checagem de onboarding roda uma vez por usuário — o proxy (middleware) já
// protege as rotas a cada navegação, então repetir getSession + select em
// profiles a cada troca de pathname só somava round-trips ao Supabase em todo
// clique do sidebar.
//
// Guarda QUAL usuário já foi checado, não apenas "se já checou". Como flag
// booleana, o estado sobrevivia à troca de conta na mesma aba: depois de
// logout + login com outro usuário, a checagem não rodava de novo e quem
// ainda não tinha completado o onboarding entrava direto no dashboard.
let onboardingCheckedFor: string | null = null;

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

      if (onboardingCheckedFor !== session.user.id && pathname !== '/onboarding' && pathname !== '/setup') {
        onboardingCheckedFor = session.user.id;
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
        // Logout limpa o usuário checado: a próxima conta a logar nesta aba
        // precisa passar pela checagem de onboarding por conta própria.
        onboardingCheckedFor = null;
        const next = encodeURIComponent(window.location.pathname || '/dashboard');
        router.replace(`/login?next=${next}`);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  return <>{children}</>;
}
