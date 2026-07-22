import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AuthForm from '@/components/auth/AuthForm';

export const dynamic = 'force-dynamic';
export const metadata = { referrer: 'no-referrer' as const };

/**
 * Cadastro "pagamento primeiro" (AbacatePay): só é possível criar conta com um
 * checkout pago. O checkout devolve `?ref=<uuid>` — um id nosso, gerado na
 * criação e presente só na URL de retorno de quem pagou. Resolvemos ref → linha
 * em subscriptions → id do checkout, confirmamos PAID relendo a API (fonte de
 * verdade, não o timing do webhook) e recuperamos o e-mail pago antes de
 * liberar o formulário.
 */
export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  if (!ref || !/^[A-Za-z0-9_-]{8,160}$/.test(ref)) return <Shell><NoSubscription /></Shell>;

  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" checkoutRef={ref} />
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10" style={{ background: 'var(--paper)' }}>
      <Link href="/" className="flex items-center" aria-label="Creatools">
        <Image
          src="/LOGO_SEMFUNDO.png"
          alt="Creatools"
          width={268}
          height={80}
          priority
          className="h-16 w-auto object-contain dark:invert"
        />
      </Link>
      <div className="flex-1 w-full flex items-center justify-center">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}

function NoSubscription() {
  return (
    <div className="brand-card text-center" style={{ padding: 28 }}>
      <h2 className="font-display text-[26px] leading-none mb-3">Assine para criar sua conta</h2>
      <p className="text-[13.5px] leading-6 mb-6" style={{ color: 'var(--ink-dim)' }}>
        O acesso ao Creatools começa pela assinatura. Escolha um plano e em seguida você cria sua conta.
      </p>
      <Link href="/precos" className="brand-btn accent w-full justify-center">
        Ver planos
      </Link>
      <p className="mt-5 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
        Já tem conta?{' '}
        <Link className="font-semibold underline underline-offset-4" style={{ color: 'var(--ink)' }} href="/login">
          Entrar
        </Link>
      </p>
    </div>
  );
}
