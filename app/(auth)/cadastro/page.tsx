import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AuthForm from '@/components/auth/AuthForm';
import PendingPayment from '@/components/auth/PendingPayment';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { syncSubscriptionFromSession } from '@/lib/stripe-sync';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type PlanInterval = 'month' | 'year';

/**
 * Cadastro "pagamento primeiro": só é possível criar conta com um checkout
 * pago. Lê o session_id do Stripe, recupera o e-mail pago e confirma que a
 * assinatura já foi gravada (webhook) antes de liberar o formulário.
 */
export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) return <Shell><NoSubscription /></Shell>;

  let session: Stripe.Checkout.Session;
  let email: string | null = null;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
    email = session.customer_details?.email ?? session.customer_email ?? null;
  } catch {
    return <Shell><NoSubscription /></Shell>;
  }
  if (!email) return <Shell><NoSubscription /></Shell>;

  // A assinatura já chegou pelo webhook?
  const admin = createAdminSupabaseClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan_interval, status')
    // Escapa curingas do ilike — e-mail vem da Stripe, mas % e _ são válidos em e-mails.
    .ilike('email', email.replace(/([%_\\])/g, '\\$1'))
    .in('status', ['active', 'trialing'])
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  let planInterval = sub?.plan_interval as PlanInterval | undefined;

  if (!sub) {
    // Webhook ainda não chegou (dev sem `stripe listen`, ou atraso de entrega):
    // sincroniza a assinatura direto da Stripe em vez de esperar para sempre.
    const synced = await syncSubscriptionFromSession(session);
    if (synced && (synced.status === 'active' || synced.status === 'trialing')) {
      planInterval = synced.interval as PlanInterval;
    }
  }

  if (!planInterval) return <Shell><PendingPayment /></Shell>;

  const planLabel = planInterval === 'year' ? 'Anual' : 'Mensal';

  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" lockedEmail={email} planLabel={planLabel} />
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
