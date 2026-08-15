'use client';

import { Toaster } from 'react-hot-toast';
import ThemeProvider from '@/components/ThemeProvider';
import AppSidebar from '@/components/ui/AppSidebar';
import AuthProvider from '@/components/AuthProvider';
import CreditsExhaustedModal from '@/components/ui/CreditsExhaustedModal';

/**
 * Cromo do produto — o que antes era o corpo de `app/(app)/layout.tsx`.
 *
 * O layout virou Server Component para poder decidir NO SERVIDOR se a sessão é
 * de admin (ver `isCurrentUserAdmin`). Providers e sidebar continuam client,
 * então a fronteira 'use client' desceu para cá: o layout calcula, este arquivo
 * renderiza.
 *
 * `isAdmin` é um BOOLEANO e só. `ADMIN_EMAILS` não atravessa esta fronteira —
 * nem a lista, nem o e-mail que casou com ela.
 */
export default function AppShell({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <div className="flex h-screen overflow-hidden bg-[var(--background)]">
          <AppSidebar isAdmin={isAdmin} />
          <main className="flex-1 flex flex-col overflow-hidden">
            {children}
          </main>
        </div>
        <CreditsExhaustedModal />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface-elevated)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            },
          }}
        />
      </ThemeProvider>
    </AuthProvider>
  );
}
