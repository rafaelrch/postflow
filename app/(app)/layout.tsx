'use client';

import { Toaster } from 'react-hot-toast';
import ThemeProvider from '@/components/ThemeProvider';
import AppSidebar from '@/components/ui/AppSidebar';
import AuthProvider from '@/components/AuthProvider';
import CreditsExhaustedModal from '@/components/ui/CreditsExhaustedModal';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <div className="flex h-screen overflow-hidden bg-[var(--background)]">
          <AppSidebar />
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
