'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';

// Mesma política mínima do fluxo pago (minLength 6). Não inventamos política nova.
const PASSWORD_MIN = 6;

/**
 * Cadastro GRÁTIS (sem pagamento). Coleta e-mail + senha e chama a rota
 * service-role /api/auth/free-signup, que cria a conta free (não confirmada) já
 * com a senha e envia a confirmação. É um componente SEPARADO do AuthForm
 * (fluxo pago) de propósito: não mexe na superfície pago/B1-B2. Após confirmar
 * o e-mail, o usuário entra pelo /login com a senha que escolheu aqui — o fluxo
 * free NÃO passa por /definir-senha.
 */
export default function FreeSignupForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sent) return;
    if (password.length < PASSWORD_MIN) {
      toast.error(`A senha precisa ter ao menos ${PASSWORD_MIN} caracteres.`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/free-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.status === 429) {
        toast.error('Muitas tentativas. Aguarde um minuto e tente de novo.');
        return;
      }
      if (!res.ok) {
        toast.error('Verifique os dados informados e tente novamente.');
        return;
      }
      // Resposta genérica por design (anti-enumeração): sempre mostramos a tela
      // de "confirme seu e-mail", exista ou não a conta.
      setSent(true);
      toast.success('Link enviado. Confira sua caixa de entrada.');
    } catch {
      toast.error('Não foi possível concluir o cadastro.');
    } finally {
      setLoading(false);
    }
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
            <h1 className="section-title" style={{ fontSize: 40 }}>Criar conta grátis</h1>
            <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
              Editor e templates manuais completos, sem cartão. A IA é dos planos pagos.
            </p>
          </div>

          {sent ? (
            <div className="brand-card flex flex-col gap-5" style={{ padding: 24 }}>
              <div>
                <CheckCircle2 className="w-8 h-8 mb-3" style={{ color: 'var(--success)' }} />
                <h2 className="font-display text-[26px] leading-none mb-2">Confirme seu e-mail</h2>
                <p className="text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>
                  Se este e-mail ainda não tem conta, enviamos um link de confirmação
                  {email ? <> para <strong style={{ color: 'var(--ink)' }}>{email}</strong></> : null}.
                  Clique nele para confirmar sua conta.
                </p>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>Depois de confirmar, entre com o e-mail e a senha que você escolheu.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="brand-card flex flex-col gap-4" style={{ padding: 20 }}>
              <div>
                <label className="section-kicker block mb-2">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--ink-dim)' }} />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="voce@email.com"
                    className="brand-input"
                    style={{ paddingLeft: 40 }}
                  />
                </div>
              </div>

              <div>
                <label className="section-kicker block mb-2">Senha</label>
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    minLength={PASSWORD_MIN}
                    required
                    autoComplete="new-password"
                    placeholder="mínimo 6 caracteres"
                    className="brand-input"
                    style={{ paddingLeft: 12, paddingRight: 44 }}
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
                Criar conta grátis
              </Button>

              <p className="text-center text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                Ao criar sua conta, você concorda com os{' '}
                <Link href="/termos" className="underline underline-offset-4">Termos de Uso</Link>{' '}
                e a{' '}
                <Link href="/privacidade" className="underline underline-offset-4">Política de Privacidade</Link>.
              </p>
            </form>
          )}

          <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--ink-dim)' }}>
            Já tem conta?{' '}
            <Link className="font-semibold underline underline-offset-4" style={{ color: 'var(--ink)' }} href={`/login?next=${encodeURIComponent(next)}`}>
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
