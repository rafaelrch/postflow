'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Quote } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase';
// IMPORTADO, não copiado: até a Fase 17 havia um `const PASSWORD_MIN = 6` aqui
// "espelhando a rota". Espelho de regra é como um fluxo passa a aceitar o que o
// outro recusa. O servidor continua recusando de novo, por último.
import { PASSWORD_MIN } from '@/lib/password-rules';

type AuthMode = 'login' | 'signup';

/**
 * Esperas entre as tentativas automáticas enquanto o pagamento está sendo
 * confirmado. /cadastro é a PRIMEIRA tela depois do checkout, então chegar aqui
 * antes do webhook do Asaas é o caso comum, não o raro — e mandar a pessoa
 * clicar num botão para descobrir isso seria empurrar o nosso problema para ela.
 *
 * Crescente e cobrindo ~92s no total (0s, 4s, 12s, 27s, 52s, 92s): um cartão
 * pode levar bem mais que os ~12s da primeira versão. Curto no começo, porque
 * quase sempre resolve em segundos; espaçado no fim, para não martelar o
 * servidor durante a espera longa.
 *
 * O ORÇAMENTO que sustenta isso mudou de lugar: o resolve tem balde próprio
 * (consume_rate_window, 15/min por ip+token), separado do commit, que continua
 * em 5/min. Antes os dois dividiam o mesmo, e alongar a espera aqui daria 429
 * justamente em quem esperou direitinho. Ver supabase/migrations/
 * 20260813_resolve_rate_limit.sql.
 */
const RETRY_DELAYS_MS = [4_000, 8_000, 15_000, 25_000, 40_000];

/** O que o passo de resolve conclui: ou o e-mail da conta, ou um impedimento. */
type ResolveOutcome =
  | { ok: true; email: string }
  | { ok: false; code?: string; message: string };

async function resolvePaidEmail(token: string): Promise<ResolveOutcome> {
  try {
    const res = await fetch('/api/asaas/signup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      email?: string;
      error?: string;
      code?: string;
    };
    if (res.ok && res.status !== 202 && data.ok && data.email) {
      return { ok: true, email: data.email };
    }
    return { ok: false, code: data.code, message: signupIntentMessage(data.code, data.error) };
  } catch {
    return { ok: false, message: 'Não foi possível confirmar o pagamento. Tente de novo em instantes.' };
  }
}

/**
 * Os estados do pagamento, em português. O `code` é o contrato com
 * app/api/asaas/signup-intent/route.ts; o texto mora aqui.
 *
 * Só `payment_pending` manda esperar — nos outros dois esperar não resolve, e
 * dizer "estamos confirmando" era mandar recarregar a página para sempre.
 */
function signupIntentMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case 'payment_pending':
      return 'Ainda estamos confirmando seu pagamento. Tente de novo em instantes.';
    case 'account_exists':
      return 'Este pagamento já tem uma conta. Faça login para entrar.';
    case 'no_payment_found':
      return 'Não encontramos um pagamento para este link de cadastro. Se você já pagou, use o link que abriu ao concluir o pagamento — ou fale com o suporte.';
    case 'weak_password':
      return `Escolha uma senha de pelo menos ${PASSWORD_MIN} caracteres.`;
    default:
      return fallback || 'Não foi possível confirmar o pagamento.';
  }
}

/** Depoimentos de decoração da coluna direita (estilo 21dev). Texto e avatares
 *  são placeholders coerentes com a marca — não bloqueiam o fluxo de auth. */
const TESTIMONIALS = [
  {
    name: 'Bia Criativa',
    handle: '@bia.criativa',
    avatar: '/clientes/cliente-01.webp',
    quote: 'Em uma tarde montei 12 carrosséis pro cliente. Antes levava a semana.',
  },
  {
    name: 'Studio Marques',
    handle: '@studio.marques',
    avatar: '/clientes/cliente-04.webp',
    quote: 'O Creatools virou meu braço direito nas entregas mensais de conteúdo.',
  },
] as const;

export default function AuthForm({
  mode,
  lockedEmail,
  planLabel,
  signupToken,
}: {
  mode: AuthMode;
  /** E-mail pago no checkout — quando presente, fica travado no form. */
  lockedEmail?: string;
  /** Rótulo do plano assinado (Mensal/Anual) exibido acima do form. */
  planLabel?: string;
  /** Prova one-shot validada no servidor e consumida atomicamente pelo trigger. */
  /** Token assinado da volta do checkout (ver lib/signup-token.ts). */
  signupToken?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';
  const isSignup = mode === 'signup';

  const [email, setEmail] = useState(lockedEmail ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  /** Só no cadastro: descobrindo de quem é a conta antes de mostrar o form. */
  const [resolving, setResolving] = useState(isSignup && !!signupToken && !lockedEmail);
  /** Motivo pelo qual não há formulário a mostrar (pagamento pendente etc.). */
  const [blocked, setBlocked] = useState<{ message: string; code?: string } | null>(null);
  /** Qual tentativa de resolve está valendo. 0 = a inicial. */
  const [attempt, setAttempt] = useState(0);
  /**
   * A PROMESSA de cada tentativa, não um "já comecei". A diferença é o bug que
   * travava a tela: com um booleano, a segunda montagem do StrictMode saía pelo
   * guard sem se pendurar em nada, e o resultado do fetch da primeira era
   * descartado pelo `active` já falso — ninguém mais chamava setResolving(false)
   * e o spinner ficava para sempre, com o servidor tendo respondido 200.
   *
   * Guardando a promessa, o fetch continua acontecendo UMA vez por tentativa
   * (a cota de consume_passwordless_rate é o motivo do guard) e toda montagem
   * viva se pendura no mesmo resultado, tenha ele chegado antes ou depois.
   * Mesmo padrão do verificationRef em app/(auth)/definir-senha/page.tsx.
   */
  const attemptsRef = useRef(new Map<number, Promise<ResolveOutcome>>());

  const title = isSignup ? 'Criar conta' : 'Entrar';

  /**
   * O e-mail da conta é o DE QUEM PAGOU, decidido pelo Asaas — não o que a
   * pessoa digitaria aqui. Um campo editável seria mentira: ela digita um e o
   * sistema usa outro (foi assim que o teste real confundiu dois endereços
   * parecidos). Então perguntamos ao servidor de quem é a conta e exibimos
   * travado. Este passo não cria nada nem envia e-mail.
   */
  useEffect(() => {
    if (!isSignup || !signupToken || lockedEmail) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempts = attemptsRef.current;
    let pending = attempts.get(attempt);
    if (!pending) {
      pending = resolvePaidEmail(signupToken);
      attempts.set(attempt, pending);
    }

    void pending.then((outcome) => {
      if (!active) return;

      if (outcome.ok) {
        setEmail(outcome.email);
        setResolving(false);
        return;
      }

      // Webhook ainda não chegou. Esperar RESOLVE — então esperamos nós, em vez
      // de devolver um botão para a pessoa clicar.
      if (outcome.code === 'payment_pending' && attempt < RETRY_DELAYS_MS.length) {
        timer = setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAYS_MS[attempt]);
        return;
      }

      setBlocked({ message: outcome.message, code: outcome.code });
      setResolving(false);
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [isSignup, signupToken, lockedEmail, attempt]);

  /** Botão manual, só depois de as automáticas se esgotarem. */
  const retryResolve = () => {
    setBlocked(null);
    setResolving(true);
    setAttempt((a) => a + 1);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const supabase = createClient();

      if (isSignup) {
        // Sem prova de pagamento não deixa cadastrar. A prova é o token
        // assinado que veio na successUrl do checkout do Asaas (HMAC do id do
        // lead, ver lib/signup-token.ts) — quem valida é o servidor. Não
        // confia no e-mail exibido no form, que é client-side.
        const token = signupToken;
        if (!token) {
          toast.error('Não encontramos o pagamento desta assinatura. Assine um plano antes de criar a conta.');
          return;
        }

        // Barrado no cliente para não gastar cota do rate limit com erro de
        // digitação. O servidor recusa de novo (code weak_password).
        if (password.length < PASSWORD_MIN) {
          toast.error(`Escolha uma senha de pelo menos ${PASSWORD_MIN} caracteres.`);
          return;
        }
        if (password !== passwordConfirm) {
          toast.error('As senhas não conferem.');
          return;
        }

        if (confirmationSent) return;
        setLoading(true);
        const verifyRes = await fetch('/api/asaas/signup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        });
        if (!verifyRes.ok || verifyRes.status === 202) {
          const verifyData = (await verifyRes.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          };
          // Cada estado tem a SUA mensagem: antes os três caíam em "ainda
          // estamos confirmando seu pagamento" — falso em dois deles, e a
          // pessoa recarregava a página achando que a lentidão era nossa.
          const message = signupIntentMessage(verifyData.code, verifyData.error);
          if (verifyData.code === 'payment_pending' || verifyData.code === 'account_exists') {
            toast(message);
          } else {
            toast.error(message);
          }
          return;
        }

        setConfirmationSent(true);
        window.history.replaceState(null, '', '/cadastro');
        toast.success('Conta criada. Confirme seu e-mail para entrar.');
        return;
      }

      setLoading(true);

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

  return (
    // Split-screen 50/50 (padrão 21dev): esquerda = form, direita = hero +
    // testimonials. A coluna direita é puramente decorativa e some no mobile.
    <main className="flex flex-col md:flex-row min-h-[100dvh]" style={{ background: 'var(--paper)' }}>
      {/* ESQUERDA — formulário */}
      <section className="flex-1 flex items-center justify-center px-5 py-10 sm:px-8 md:p-12">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="flex items-center mb-8 fade-in" style={{ animationDelay: '80ms' }} aria-label="Creatools">
            <Image
              src="/LOGO_SEMFUNDO.png"
              alt="Creatools"
              width={268}
              height={80}
              priority
              className="h-12 w-auto object-contain dark:invert"
            />
          </Link>

          <div className="mb-7 fade-in" style={{ animationDelay: '160ms' }}>
            <h1 className="section-title" style={{ fontSize: 38 }}>{title}</h1>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-dim)' }}>
              {isSignup
                ? 'Crie sua conta e comece a produzir.'
                : 'Bem-vindo de volta. Entre para continuar.'}
            </p>
            {isSignup && planLabel && (
              <p className="mt-3 text-[13px] inline-flex items-center gap-2" style={{ color: 'var(--ink-dim)' }}>
                <span className="chip soft">Plano</span>
                <strong style={{ color: 'var(--accent)' }}>{planLabel}</strong> ativado
              </p>
            )}
          </div>

          {confirmationSent ? (
            <div className="brand-card flex flex-col gap-5" style={{ padding: 24 }}>
              <div>
                <CheckCircle2 className="w-8 h-8 mb-3" style={{ color: 'var(--success)' }} />
                <h2 className="font-display text-[26px] leading-none mb-2">Confirme seu e-mail</h2>
                <p className="text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>
                  Enviamos um e-mail de confirmação
                  {email ? <> para <strong style={{ color: 'var(--ink)' }}>{email}</strong></> : null}.
                  Clique no link para confirmar e entrar.
                </p>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>Sua senha já está definida — depois de confirmar, é só entrar.</p>
            </div>
          ) : resolving ? (
            <div className="brand-card flex flex-col gap-2" style={{ padding: 24 }} data-testid="signup-resolving">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--ink-dim)' }} />
                <p className="text-[14px]" style={{ color: 'var(--ink-dim)' }}>Confirmando seu pagamento…</p>
              </div>
              {attempt > 0 && (
                <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                  A confirmação da operadora costuma levar alguns segundos, e às vezes até um minuto. Estamos verificando sozinhos — não precisa fazer nada nem recarregar a página.
                </p>
              )}
            </div>
          ) : blocked ? (
            <div className="brand-card flex flex-col gap-4" style={{ padding: 24 }}>
              <p className="text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>{blocked.message}</p>
              {/* A saída depende do estado: quem já tem conta vai para o login;
                  quem está esperando o webhook só precisa tentar de novo. */}
              {blocked.code === 'account_exists' ? (
                <Link href="/login" className="brand-btn accent w-full justify-center">Ir para o login</Link>
              ) : blocked.code === 'payment_pending' ? (
                // Só aparece depois das automáticas. Cada clique gasta mais uma
                // cota do rate limit, por isso não é a primeira coisa oferecida.
                <Button type="button" className="w-full" onClick={retryResolve}>
                  Tentar de novo
                </Button>
              ) : (
                <Link href="/precos" className="brand-btn w-full justify-center">Ver planos</Link>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="brand-card flex flex-col gap-4 fade-in" style={{ padding: 22, animationDelay: '240ms' }}>
              {isSignup ? (
                // Texto fixo, não input: o e-mail vem do pagamento e não é
                // editável. Um campo editável aqui seria mentira — a conta
                // nasceria no endereço do pagamento, não no digitado.
                <div>
                  <label className="section-kicker block mb-2">Conta para o e-mail do pagamento</label>
                  <div
                    className="brand-input flex items-center gap-2"
                    style={{ color: 'var(--ink)', cursor: 'default' }}
                    aria-readonly="true"
                    data-testid="signup-paid-email"
                  >
                    <Mail className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-dim)' }} />
                    <span className="truncate">{email}</span>
                  </div>
                  <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                    A conta é criada neste endereço, o mesmo do pagamento.
                  </p>
                </div>
              ) : (
                <Field icon={Mail} label="E-mail" value={email} onChange={setEmail} placeholder="voce@email.com" type="email" autoComplete="email" required readOnly={!!lockedEmail} />
              )}

              <div>
                <label className="section-kicker block mb-2">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--ink-dim)' }} />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    minLength={PASSWORD_MIN}
                    required
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    placeholder={`mínimo ${PASSWORD_MIN} caracteres`}
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
              </div>

              {isSignup && (
                <div>
                  <label className="section-kicker block mb-2">Confirmar senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--ink-dim)' }} />
                    <input
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      type={showPassword ? 'text' : 'password'}
                      minLength={PASSWORD_MIN}
                      required
                      autoComplete="new-password"
                      placeholder="repita a senha"
                      className="brand-input"
                      style={{ paddingLeft: 40 }}
                    />
                  </div>
                </div>
              )}

              {/* Só no login: no cadastro a conta ainda não existe, e oferecer
                  "esqueci minha senha" ali seria oferecer recuperar o que não
                  há. Fica logo abaixo do campo de senha, que é onde a pessoa
                  descobre que não lembra. */}
              {!isSignup && (
                <div className="-mt-1">
                  <Link
                    href="/recuperar-senha"
                    data-testid="esqueci-minha-senha"
                    className="text-[12.5px] underline underline-offset-4"
                    style={{ color: 'var(--ink-dim)' }}
                  >
                    Esqueci minha senha
                  </Link>
                </div>
              )}

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

          <p className="mt-6 text-center text-[13px] fade-in" style={{ color: 'var(--ink-dim)', animationDelay: '320ms' }}>
            {isSignup ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
            <Link className="font-semibold underline underline-offset-4" style={{ color: 'var(--ink)' }} href={isSignup ? `/login?next=${encodeURIComponent(next)}` : `/cadastro?next=${encodeURIComponent(next)}`}>
              {isSignup ? 'Entrar' : 'Criar conta'}
            </Link>
          </p>
        </div>
      </section>

      {/* DIREITA — imagem clara (cantos arredondados + margem) + título + testimonials (decoração, some no mobile) */}
      <aside
        className="hidden md:block flex-1 relative overflow-hidden"
        aria-hidden
        style={{ background: 'var(--paper)' }}
      >
        {/* Imagem de apoio, com margem nas bordas e cantos levemente arredondados */}
        <div
          className="absolute inset-3 md:inset-4 bg-cover bg-center rounded-[var(--radius-lg)]"
          style={{ backgroundImage: 'url(/hero/login-hero.webp)' }}
        />

        {/* Título de prova social + testimonials, sobre a imagem */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-4 w-[88%] max-w-[560px]">
            {TESTIMONIALS.map((t, i) => (
              <figure
                key={t.handle}
                className="flex-1 min-w-[220px] rounded-[var(--radius-lg)] p-4 flex flex-col gap-2 fade-in"
                style={{
                  background: 'color-mix(in srgb, var(--paper) 82%, white)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  animationDelay: `${320 + i * 120}ms`,
                  boxShadow: '0 10px 30px -16px rgba(0,0,0,0.18)',
                }}
              >
                <div className="flex items-center gap-3">
                  <Image
                    src={t.avatar}
                    alt=""
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                    style={{ border: '1.5px solid var(--line)' }}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{t.name}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--ink-dim)' }}>{t.handle}</p>
                  </div>
                  <Quote className="w-4 h-4 ml-auto shrink-0" style={{ color: 'var(--accent)' }} />
                </div>
                <blockquote className="text-[13px] leading-5" style={{ color: 'var(--ink-dim)' }}>
                  {t.quote}
                </blockquote>
              </figure>
            ))}
        </div>
      </aside>
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
