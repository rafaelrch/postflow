'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase';
import { isPaidPasswordlessSession } from '@/lib/paid-password-session';

export default function DefinirSenhaPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }: { data: { user: { email_confirmed_at?: string | null; app_metadata?: { origin?: unknown } | null } | null } }) => {
      if (!active) return;
      setConfirmed(isPaidPasswordlessSession({ user: data.user }));
      setChecking(false);
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (!confirmed || password.length < 6) throw new Error('password_required');
      const { error } = await createClient().auth.updateUser({ password });
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
