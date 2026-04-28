'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Phone, User } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase';

type AuthMode = 'login' | 'signup';

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';
  const isSignup = mode === 'signup';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const title = isSignup ? 'Criar conta' : 'Entrar';
  const subtitle = isSignup
    ? 'Crie seu acesso. Depois disso vamos completar o branding da marca antes de liberar o studio.'
    : 'Entre para acessar seu studio e manter todos os conteúdos vinculados ao seu usuário.';

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent('/onboarding')}`;
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();

      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              name: name.trim(),
              phone: phone.trim(),
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          await supabase.from('profiles').upsert({
            id: data.user?.id,
            name: name.trim(),
            phone: phone.trim(),
          });
          toast.success('Conta criada. Vamos configurar sua marca.');
          router.replace('/onboarding');
          router.refresh();
          return;
        }

        setConfirmationSent(true);
        toast.success('Se a confirmação por e-mail estiver ativa no Supabase, confira sua caixa de entrada.');
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível autenticar.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-[minmax(0,1fr)_520px]" style={{ background: 'var(--paper)' }}>
      <section className="hidden lg:flex relative overflow-hidden border-r" style={{ borderColor: 'var(--line)' }}>
        <div className="absolute inset-0 grid-bg opacity-70" />
        <div className="relative z-10 flex flex-col justify-between w-full p-10">
          <Link href="/" className="flex items-center gap-3 self-start">
            <span className="brand-mark sm">
              <Image src="/LOGO_SEMFUNDO.png" alt="Creatools" width={26} height={26} priority />
            </span>
            <div className="flex flex-col leading-none">
              <span className="font-semibold tracking-tight text-[15px]" style={{ color: 'var(--ink)' }}>creatools</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] mt-0.5" style={{ color: 'var(--ink-dim)' }}>
                Studio SaaS
              </span>
            </div>
          </Link>

          <div className="max-w-[640px]">
            <p className="section-kicker flex items-center gap-2 mb-5">
              <span className="dot-live" />
              Workspace privado
            </p>
            <h1 className="section-title" style={{ fontSize: 'clamp(52px, 7vw, 92px)' }}>
              Seu conteúdo com{' '}
              <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>dono certo.</span>
            </h1>
            <p className="mt-6 max-w-[520px] text-[15px] leading-7" style={{ color: 'var(--ink-dim)' }}>
              Cada projeto, carrossel, notícia, tweet, template e agendamento fica salvo no Supabase e relacionado ao usuário autenticado.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-[620px]">
            {['Projetos', 'Templates', 'Agenda'].map((item) => (
              <div key={item} className="brand-card" style={{ padding: 16, boxShadow: 'var(--sh-1)' }}>
                <CheckCircle2 className="w-4 h-4 mb-3" style={{ color: 'var(--accent)' }} />
                <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-dim)' }}>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <Image src="/LOGO_SEMFUNDO.png" alt="Creatools" width={28} height={28} priority />
            <span className="font-semibold tracking-tight">creatools</span>
          </div>

          <div className="mb-8">
            <p className="section-kicker mb-3">{isSignup ? 'Novo workspace' : 'Acesso ao studio'}</p>
            <h1 className="section-title" style={{ fontSize: 46 }}>{title}</h1>
            <p className="mt-4 text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>{subtitle}</p>
          </div>

          {confirmationSent ? (
            <div className="brand-card" style={{ padding: 24 }}>
              <CheckCircle2 className="w-8 h-8 mb-4" style={{ color: 'var(--success)' }} />
              <h2 className="font-display text-[30px] leading-none mb-3">Confirme seu e-mail</h2>
              <p className="text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>
                Se a confirmação por e-mail estiver ativa no Supabase, o link foi enviado para <strong style={{ color: 'var(--ink)' }}>{email}</strong>.
                Se nada chegar, confira Auth → Providers → Email e SMTP no painel do Supabase.
              </p>
              <Button className="mt-6 w-full" onClick={() => router.push(`/login?next=${encodeURIComponent(next)}`)}>
                Ir para login
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="brand-card flex flex-col gap-4" style={{ padding: 20 }}>
              {isSignup && (
                <>
                  <Field icon={User} label="Nome" value={name} onChange={setName} placeholder="Rafael Rocha" autoComplete="name" required />
                  <Field icon={Phone} label="Telefone" value={phone} onChange={setPhone} placeholder="+55 71 99999-9999" autoComplete="tel" required />
                </>
              )}

              <Field icon={Mail} label="E-mail" value={email} onChange={setEmail} placeholder="voce@email.com" type="email" autoComplete="email" required />

              <div>
                <label className="section-kicker block mb-2">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ink-dim)' }} />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    minLength={6}
                    required
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    placeholder="mínimo 6 caracteres"
                    className="brand-input pl-10 pr-11"
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
              </div>

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {isSignup ? 'Criar conta' : 'Entrar'}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--ink-dim)' }}>
            {isSignup ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
            <Link className="font-semibold underline underline-offset-4" style={{ color: 'var(--ink)' }} href={isSignup ? `/login?next=${encodeURIComponent(next)}` : `/cadastro?next=${encodeURIComponent(next)}`}>
              {isSignup ? 'Entrar' : 'Criar conta'}
            </Link>
          </p>
        </div>
      </section>
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
        {Icon ? <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ink-dim)' }} /> : null}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={Icon ? 'brand-input pl-10' : 'brand-input'}
          {...props}
        />
      </div>
    </div>
  );
}
