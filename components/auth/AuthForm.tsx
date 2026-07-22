'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase';

type AuthMode = 'login' | 'signup';

export default function AuthForm({
  mode,
  lockedEmail,
  planLabel,
  checkoutRef,
}: {
  mode: AuthMode;
  /** E-mail pago no checkout — quando presente, fica travado no form. */
  lockedEmail?: string;
  /** Rótulo do plano assinado (Mensal/Anual) exibido acima do form. */
  planLabel?: string;
  /** Prova one-shot validada no servidor e consumida atomicamente pelo trigger. */
  checkoutRef?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';
  const isSignup = mode === 'signup';

  const [email, setEmail] = useState(lockedEmail ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const title = isSignup ? 'Criar conta' : 'Entrar';

  const redirectTo = useMemo(() => {
    // Mesma fonte de verdade de lib/app-url.ts#appUrl: NEXT_PUBLIC_APP_URL
    // (inlinada no build). window.location.origin fica só como fallback de dev.
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    const base = envUrl
      ? envUrl.replace(/\/$/, '')
      : typeof window !== 'undefined'
        ? window.location.origin
        : undefined;
    if (!base) return undefined;
    return `${base}/auth/callback?next=${encodeURIComponent('/onboarding')}`;
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();

      if (isSignup) {
        // B2: sem prova de pagamento (ref da AbacatePay — UUID gerado por nós,
        // presente só na URL de retorno de quem completou o checkout) não deixa
        // cadastrar. Não confia no e-mail travado no form, que é client-side.
        const ref = checkoutRef;
        if (!ref) {
          toast.error('Não encontramos o pagamento desta assinatura. Assine um plano antes de criar a conta.');
          return;
        }

        if (confirmationSent && !claimed) {
          const verified = await supabase.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: 'email' });
          if (verified.error) throw verified.error;
          setClaimed(true);
          toast.success('E-mail confirmado. Defina sua senha para continuar.');
          return;
        }
        if (claimed) {
          if (password.length < 6) throw new Error('password_required');
          const updated = await supabase.auth.updateUser({ password });
          if (updated.error) throw updated.error;
          router.replace('/onboarding');
          router.refresh();
          return;
        }
        const verifyRes = await fetch('/api/abacatepay/passwordless/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkout_ref: ref }),
        });
        if (!verifyRes.ok) {
          const verifyData = await verifyRes.json().catch(() => ({}));
          toast.error(verifyData.error || 'Não foi possível confirmar o pagamento para este e-mail.');
          return;
        }

        setConfirmationSent(true);
        window.history.replaceState(null, '', '/cadastro');
        toast.success('Código enviado. Confira sua caixa de entrada.');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      toast.success('Login realizado.');
      router.replace(next);
      router.refresh();
    } catch {
      toast.error(isSignup ? 'Não foi possível concluir o cadastro.' : 'Não foi possível autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!checkoutRef || resendCooldown > 0) return;
    // Casa com o "Minimum interval per user" (60s) do Custom SMTP do Supabase;
    // reenviar antes disso devolve 403.
    setResendCooldown(60);
    const res = await fetch('/api/abacatepay/passwordless/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkout_ref: checkoutRef }) });
    if (!res.ok) toast.error('Não foi possível reenviar o código.');
    else toast.success('Se elegível, um novo código foi enviado.');
    const timer = window.setInterval(() => setResendCooldown((v) => { if (v <= 1) { window.clearInterval(timer); return 0; } return v - 1; }), 1000);
  };

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
        <div className="w-full max-w-[420px]">
          <div className="mb-6 text-center">
            <h1 className="section-title" style={{ fontSize: 40 }}>{title}</h1>
            {isSignup && planLabel && (
              <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
                Plano <strong style={{ color: 'var(--accent)' }}>{planLabel}</strong> ativado — crie sua conta para acessar.
              </p>
            )}
          </div>

          {confirmationSent ? (
            <div className="brand-card flex flex-col gap-5" style={{ padding: 24 }}>
              <div>
                <CheckCircle2 className="w-8 h-8 mb-3" style={{ color: 'var(--success)' }} />
                <h2 className="font-display text-[26px] leading-none mb-2">Confirme seu e-mail</h2>
                <p className="text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>
                  {claimed ? (
                    'E-mail confirmado. Defina uma senha para concluir o acesso.'
                  ) : (
                    <>
                      Enviamos um código
                      {email ? (
                        <> para <strong style={{ color: 'var(--ink)' }}>{email}</strong></>
                      ) : null}
                      . Digite-o abaixo para confirmar a posse do e-mail.
                    </>
                  )}
                </p>
              </div>

              {!claimed ? (
                <div className="flex flex-col gap-3">
                  <Field
                    icon={Mail}
                    label="Código OTP"
                    value={otp}
                    onChange={setOtp}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    placeholder="00000000"
                    required
                  />
                  <div className="flex items-center justify-between text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                    <span>Não recebeu o código?</span>
                    <button
                      type="button"
                      onClick={() => { void resendOtp(); }}
                      disabled={resendCooldown > 0}
                      className="font-semibold underline underline-offset-4 disabled:no-underline disabled:cursor-not-allowed"
                      style={{ color: resendCooldown > 0 ? 'var(--ink-muted)' : 'var(--ink)' }}
                    >
                      {resendCooldown ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
                    </button>
                  </div>
                </div>
              ) : (
                <Field icon={Lock} label="Nova senha" value={password} onChange={setPassword} type="password" minLength={6} placeholder="mínimo 6 caracteres" required />
              )}

              <Button className="w-full" onClick={() => { void handleSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>); }}>
                {claimed ? 'Definir senha' : 'Confirmar código'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="brand-card flex flex-col gap-4" style={{ padding: 20 }}>
              <Field icon={Mail} label="E-mail" value={email} onChange={setEmail} placeholder="voce@email.com" type="email" autoComplete="email" required readOnly={!!lockedEmail} />

              {(!isSignup || claimed) && <div>
                <label className="section-kicker block mb-2">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--ink-dim)' }} />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    minLength={6}
                    required
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    placeholder="mínimo 6 caracteres"
                    className="brand-input"
                    style={{ paddingLeft: 40, paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-[6px]"
                    style={{ color: 'var(--ink-dim)' }}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>}

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {isSignup ? 'Criar conta' : 'Entrar'}
              </Button>

              {isSignup && (
                <p className="text-center text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                  Ao criar sua conta, você concorda com os{' '}
                  <Link href="/termos" className="underline underline-offset-4">
                    Termos de Uso
                  </Link>{' '}
                  e a{' '}
                  <Link href="/privacidade" className="underline underline-offset-4">
                    Política de Privacidade
                  </Link>
                  .
                </p>
              )}
            </form>
          )}

          <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--ink-dim)' }}>
            {isSignup ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
            <Link className="font-semibold underline underline-offset-4" style={{ color: 'var(--ink)' }} href={isSignup ? `/login?next=${encodeURIComponent(next)}` : `/cadastro?next=${encodeURIComponent(next)}`}>
              {isSignup ? 'Entrar' : 'Criar conta'}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  ...props
}: {
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div>
      <label className="section-kicker block mb-2">{label}</label>
      <div className="relative">
        {Icon ? (
          <Icon
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--ink-dim)' }}
          />
        ) : null}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="brand-input"
          style={Icon ? { paddingLeft: 40 } : undefined}
          {...props}
        />
      </div>
    </div>
  );
}
