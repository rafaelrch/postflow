import { Toaster } from 'react-hot-toast';
import ThemeProvider from '@/components/ThemeProvider';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
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
  );
}
