'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import GlobalOnboardingModal from '@/components/onboarding/GlobalOnboardingModal';

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
let onboardingRequiredForCheckedUser: boolean | null = null;

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const checkingUserRef = useRef<string | null>(null);

  const checkOnboarding = useCallback(async (session: Session) => {
    checkingUserRef.current = session.user.id;
    setCheckingOnboarding(true);
    const supabase = createClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', session.user.id)
      .single();
    // Ignora a resposta atrasada de uma conta que acabou de sair desta aba.
    if (checkingUserRef.current !== session.user.id) return;
    const required = !profile?.onboarding_completed;
    onboardingRequiredForCheckedUser = required;
    setOnboardingRequired(required);
    setCheckingOnboarding(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const { session } = data;
      const pathname = window.location.pathname;
      if (!session) {
        checkingUserRef.current = null;
        setCheckingOnboarding(false);
        const next = encodeURIComponent(pathname || '/dashboard');
        router.replace(`/login?next=${next}`);
        return;
      }

      if (onboardingCheckedFor !== session.user.id) {
        onboardingCheckedFor = session.user.id;
        void checkOnboarding(session);
      } else {
        setOnboardingRequired(Boolean(onboardingRequiredForCheckedUser));
        setCheckingOnboarding(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (!session) {
        // Logout limpa o usuário checado: a próxima conta a logar nesta aba
        // precisa passar pela checagem de onboarding por conta própria.
        onboardingCheckedFor = null;
        onboardingRequiredForCheckedUser = null;
        setOnboardingRequired(false);
        setCheckingOnboarding(false);
        checkingUserRef.current = null;
        const next = encodeURIComponent(window.location.pathname || '/dashboard');
        router.replace(`/login?next=${next}`);
      } else if (onboardingCheckedFor !== session.user.id) {
        onboardingCheckedFor = session.user.id;
        void checkOnboarding(session);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [checkOnboarding, router]);

  const blocked = checkingOnboarding || onboardingRequired;
  return <><div inert={blocked} aria-hidden={blocked}>{children}</div>{checkingOnboarding && <div data-testid="onboarding-loading" role="dialog" aria-modal="true" aria-label="Verificando onboarding" className="fixed inset-0 z-[10000] grid place-items-center bg-black/55"><div className="rounded-xl px-5 py-4 text-sm" style={{ background: 'var(--paper)' }}>Preparando seu studio…</div></div>}{onboardingRequired && <GlobalOnboardingModal onComplete={() => { onboardingCheckedFor = null; onboardingRequiredForCheckedUser = null; setOnboardingRequired(false); setCheckingOnboarding(false); router.refresh(); }} />}</>;
}
