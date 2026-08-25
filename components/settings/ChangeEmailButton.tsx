'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { AtIcon, Cancel01Icon, CheckmarkCircle01Icon, Clock01Icon, Loading03Icon, Mail01Icon } from '@hugeicons/core-free-icons';

/**
 * Trocar o e-mail da conta — botão que abre um diálogo, na mesma gramática do
 * ChangePasswordButton ao lado.
 *
 * ── O QUE ESTA TELA PROMETE, E CUMPRE ───────────────────────────────────────
 * Ela NÃO troca o e-mail. Ela PEDE a troca. Quem troca é a confirmação por
 * e-mail: até o link ser aberto, o endereço atual continua sendo o da conta —
 * é com ele que se entra e se recupera a senha. A tela diz isso com todas as
 * letras, porque a alternativa (mostrar o endereço novo como se já valesse)
 * faria a pessoa perder o acesso achando que ganhou.
 *
 * ── POR QUE NÃO HÁ BOTÃO "CANCELAR PEDIDO" ──────────────────────────────────
 * Não existe API de sessão para descartar um pedido pendente: o Supabase só o
 * apaga quando outro pedido o substitui ou quando o link expira. Apagá-lo pelo
 * servidor exigiria escrever em `auth.users` com service_role — exatamente o
 * write privilegiado que este fluxo existe para não fazer. Então a tela explica
 * o que de fato acontece (nada muda sem confirmação; pedir outro endereço
 * substitui o pendente) em vez de oferecer um botão que mentiria.
 *
 * `pendingEmail` vem do SERVIDOR (`user.new_email`), não de estado local: se a
 * pessoa recarregar a página ou abrir noutro dispositivo, o pendente continua
 * visível.
 */
export default function ChangeEmailButton({
  currentEmail,
  pendingEmail,
}: {
  currentEmail: string;
  pendingEmail: string | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Endereço aceito nesta sessão de tela — some do estado local no refresh,
   *  mas o servidor devolve o mesmo valor em `pendingEmail`. */
  const [aceito, setAceito] = useState<string | null>(null);

  const pendente = aceito ?? pendingEmail;

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setNovo('');
    setErro(null);
  }

  async function pedir(email: string) {
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch('/api/conta/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setErro(dados?.error ?? 'Não foi possível iniciar a troca agora. Tente de novo.');
        return false;
      }

      setAceito(dados?.pendingEmail ?? email);
      // O servidor é quem sabe o pendente de verdade: revalida a página para a
      // aba refletir `user.new_email` mesmo se a pessoa recarregar depois.
      router.refresh();
      return true;
    } catch {
      setErro('Não foi possível iniciar a troca agora. Tente de novo.');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    if (await pedir(novo)) {
      setAberto(false);
      setNovo('');
    }
  }

  return (
    <>
      {pendente ? (
        <div
          data-testid="email-pendente"
          className="mb-3 w-full rounded-[10px] p-3 flex items-start gap-2.5"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
        >
          <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.75} aria-hidden className="shrink-0 mt-0.5" style={{ color: 'var(--ink-dim)' }} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
              Aguardando confirmação em <span data-testid="email-pendente-endereco">{pendente}</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
              Enviamos um link de confirmação. Até você abri-lo, o e-mail da conta continua
              sendo <strong>{currentEmail}</strong> — é com ele que você entra e recupera a
              senha. O pedido expira sozinho, e pedir outro endereço substitui este.
            </p>
            <button
              type="button"
              data-testid="reenviar-troca-email"
              className="brand-btn ghost sm mt-2"
              disabled={enviando}
              onClick={() => pedir(pendente)}
            >
              {enviando ? <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={1.75} aria-hidden className="animate-spin motion-reduce:animate-none" /> : <HugeiconsIcon icon={Mail01Icon} size={16} strokeWidth={1.75} aria-hidden />}
              {enviando ? 'Reenviando…' : 'Reenviar confirmação'}
            </button>
            {erro && !aberto && (
              <p role="alert" data-testid="erro-trocar-email" className="mt-2 text-[13px]" style={{ color: 'var(--danger)' }}>
                {erro}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="abrir-trocar-email"
        onClick={() => setAberto(true)}
        className="brand-btn sm"
      >
        <HugeiconsIcon icon={AtIcon} size={16} strokeWidth={1.75} aria-hidden />
        Trocar e-mail
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={fechar}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="trocar-email-titulo"
            className="relative w-full max-w-[460px] rounded-[18px] p-7"
            style={{ background: 'var(--paper)', border: '1.5px solid var(--line-strong)', boxShadow: 'var(--sh-2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-testid="fechar-trocar-email"
              onClick={fechar}
              disabled={enviando}
              aria-label="Fechar"
              className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ color: 'var(--ink-dim)' }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} aria-hidden />
            </button>

            <h2
              id="trocar-email-titulo"
              className="font-display text-[26px] leading-tight mb-1"
              style={{ color: 'var(--ink)' }}
            >
              Trocar e-mail
            </h2>

            <form onSubmit={submit} className="mt-4 flex flex-col gap-3.5" data-testid="form-trocar-email">
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
                Hoje sua conta usa <strong style={{ color: 'var(--ink)' }}>{currentEmail}</strong>.
                Enviaremos um link de confirmação para o endereço novo — e um aviso para o
                atual. <strong style={{ color: 'var(--ink)' }}>O e-mail só muda depois que você
                confirmar</strong>; até lá, nada na sua conta se altera.
              </p>

              <div>
                <label className="section-kicker block mb-1.5" htmlFor="novo-email">Novo e-mail</label>
                <div className="relative">
                  <HugeiconsIcon
                    icon={AtIcon}
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--ink-dim)' }}
                  />
                  <input
                    id="novo-email"
                    data-testid="novo-email"
                    type="email"
                    className="brand-input"
                    style={{ paddingLeft: 40 }}
                    value={novo}
                    onChange={(e) => setNovo(e.target.value)}
                    autoComplete="email"
                    placeholder="seu@novoendereco.com"
                    required
                  />
                </div>
              </div>

              {erro && (
                <p
                  data-testid="erro-trocar-email-dialogo"
                  role="alert"
                  className="text-[13px] leading-relaxed rounded-[10px] p-3"
                  style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}
                >
                  {erro}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  data-testid="cancelar-trocar-email"
                  onClick={fechar}
                  disabled={enviando}
                  className="brand-btn ghost"
                  style={{ padding: '10px 14px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  data-testid="enviar-troca-email"
                  disabled={enviando}
                  className="brand-btn primary flex-1 justify-center"
                  style={{ padding: '10px 14px' }}
                >
                  {enviando ? <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={1.75} aria-hidden className="animate-spin motion-reduce:animate-none" /> : <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={1.75} aria-hidden />}
                  {enviando ? 'Enviando…' : 'Enviar confirmação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
