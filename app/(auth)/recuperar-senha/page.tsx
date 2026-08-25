'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, Loading03Icon, Mail01Icon, MailCheckIcon } from '@hugeicons/core-free-icons';

/**
 * "Esqueci minha senha": pede o e-mail e dispara o link de redefinição.
 *
 * A TELA NUNCA DIZ SE A CONTA EXISTE. O texto de sucesso é condicional de
 * propósito ("se existir uma conta com esse e-mail"), e é o mesmo nos dois
 * casos — quem digita o endereço de outra pessoa não descobre por aqui se ela
 * é cliente. A rota (app/api/auth/recuperar-senha) devolve a mesma coisa pelo
 * mesmo motivo; esta tela só não pode estragar isso.
 */
export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch('/api/auth/recuperar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        // 429 é o único erro que a rota distingue, e ele não fala de conta
        // nenhuma — é sobre quantas vezes ESTE navegador pediu.
        setErro(body?.message ?? 'Não foi possível enviar agora. Tente mais tarde.');
        return;
      }
      setEnviado(true);
    } catch {
      setErro('Não foi possível enviar agora. Tente mais tarde.');
    } finally {
      setEnviando(false);
    }
  }

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
            <h1 className="section-title" style={{ fontSize: 40 }}>Recuperar senha</h1>
          </div>

          {enviado ? (
            <div className="brand-card flex flex-col gap-4" style={{ padding: 24 }} data-testid="recuperar-enviado">
              <div>
                <HugeiconsIcon icon={MailCheckIcon} size={32} strokeWidth={1.75} aria-hidden className="mb-3" style={{ color: 'var(--success)' }} />
                <h2 className="font-display text-[26px] leading-none mb-2">Confira seu e-mail</h2>
                <p className="text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>
                  Se existir uma conta com esse e-mail, enviamos o link para redefinir a
                  senha. O link vale por tempo limitado — se não chegar em alguns minutos,
                  procure no spam.
                </p>
              </div>
              <Link href="/login" className="brand-btn w-full justify-center">Voltar ao login</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="brand-card flex flex-col gap-4" style={{ padding: 20 }}>
              <p className="text-[13px] leading-6" style={{ color: 'var(--ink-dim)' }}>
                Digite o e-mail da sua conta — o mesmo que você usou no pagamento. Mandamos
                um link para você criar uma senha nova.
              </p>

              <div>
                <label className="section-kicker block mb-2" htmlFor="email">E-mail</label>
                <div className="relative">
                  <HugeiconsIcon
                    icon={Mail01Icon}
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--ink-dim)' }}
                  />
                  <input
                    id="email"
                    data-testid="recuperar-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="voce@email.com"
                    className="brand-input"
                    style={{ paddingLeft: 40 }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {erro && (
                <p
                  data-testid="recuperar-erro"
                  role="alert"
                  className="text-[13px] leading-relaxed rounded-[10px] p-3"
                  style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}
                >
                  {erro}
                </p>
              )}

              <button
                type="submit"
                data-testid="recuperar-enviar"
                disabled={enviando}
                className="brand-btn primary w-full justify-center mt-1"
              >
                {enviando ? <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={1.75} aria-hidden className="animate-spin motion-reduce:animate-none" /> : <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.75} aria-hidden />}
                {enviando ? 'Enviando…' : 'Enviar link'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--ink-dim)' }}>
            Lembrou a senha?{' '}
            <Link className="font-semibold underline underline-offset-4" style={{ color: 'var(--ink)' }} href="/login">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
