'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInAnonymously().catch((err) => {
          console.error('[auth] anonymous sign-in failed:', err);
        });
      }
    });
  }, []);

  return <>{children}</>;
}
