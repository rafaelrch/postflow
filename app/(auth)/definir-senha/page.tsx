'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { isPaidPasswordlessSession } from '@/lib/paid-password-session';
import {
  establishPaidSignupSession,
  type PaidSignupClient,
  type PaidSignupSessionResult,
} from '@/lib/paid-signup-callback';

export default function DefinirSenhaPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const passwordClientRef = useRef<PaidSignupClient | null>(null);
  const verificationRef = useRef<Promise<PaidSignupSessionResult | null> | null>(null);

  useEffect(() => {
    let active = true;
    if (!verificationRef.current) {
      verificationRef.current = establishPaidSignupSession(window.location.hash, {
        clearHash: () => {
          window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}${window.location.search}`,
          );
        },
      });
    }

    void verificationRef.current.then((result) => {
      if (!active) return;
      const eligible = Boolean(result && isPaidPasswordlessSession({ user: result.user }));
      passwordClientRef.current = eligible && result ? result.client : null;
      setConfirmed(eligible);
      setChecking(false);
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      const client = passwordClientRef.current;
      if (!confirmed || !client || password.length < 6) throw new Error('password_required');
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Senha definida.');
      router.replace('/onboarding');
      router.refresh();
    } catch {
      toast.error('Não foi possível definir sua senha. Abra novamente o link de confirmação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-5" style={{ background: 'var(--paper)' }}>
      <form onSubmit={submit} className="brand-card w-full max-w-[420px] flex flex-col gap-4" style={{ padding: 24 }}>
        <h1 className="section-title" style={{ fontSize: 36 }}>Criar senha</h1>
        {checking ? <p style={{ color: 'var(--ink-dim)' }}>Validando sua confirmação…</p> : confirmed ? (
          <>
            <p style={{ color: 'var(--ink-dim)' }}>E-mail confirmado. Escolha uma senha para acessar o Creatools.</p>
            <label className="section-kicker" htmlFor="password">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ink-dim)' }} />
              <input id="password" className="brand-input" style={{ paddingLeft: 40 }} type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="mínimo 6 caracteres" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Definir senha</Button>
          </>
        ) : <p style={{ color: 'var(--ink-dim)' }}>Confirme seu e-mail pelo link recebido para continuar.</p>}
      </form>
    </main>
  );
}
