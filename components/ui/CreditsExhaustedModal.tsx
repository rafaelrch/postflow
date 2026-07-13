'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';
import { useCreditsStore } from '@/hooks/useCreditsStore';

/**
 * Popup global de créditos de IA esgotados. Abre quando uma rota de IA devolve
 * 402 insufficient_credits (via handleInsufficientCredits) e, uma vez por
 * sessão, ao entrar no app já com o saldo zerado.
 */
export default function CreditsExhaustedModal() {
  const open = useCreditsStore((s) => s.exhaustedOpen);
  const balance = useCreditsStore((s) => s.balance);
  const periodEnd = useCreditsStore((s) => s.periodEnd);
  const loaded = useCreditsStore((s) => s.loaded);
  const show = useCreditsStore((s) => s.showExhausted);
  const close = useCreditsStore((s) => s.closeExhausted);

  useEffect(() => {
    if (!loaded || balance !== 0) return;
    // Se o ciclo já virou, a recarga acontece na próxima geração — não avisa.
    if (periodEnd && new Date(periodEnd).getTime() <= Date.now()) return;
    try {
      if (sessionStorage.getItem('credits_exhausted_shown') === '1') return;
      sessionStorage.setItem('credits_exhausted_shown', '1');
    } catch { /* sessionStorage indisponível */ }
    show();
  }, [loaded, balance, periodEnd, show]);

  if (!open) return null;

  const rechargeDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-exhausted-title"
        className="relative w-full max-w-[520px] rounded-[18px] p-7"
        style={{ background: 'var(--paper)', border: '1.5px solid var(--line-strong)', boxShadow: 'var(--sh-2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          aria-label="Fechar"
          className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          style={{ color: 'var(--ink-dim)' }}
        >
          <X className="w-4 h-4" />
        </button>

        <span
          className="grid place-items-center w-11 h-11 rounded-[12px] mb-4"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          aria-hidden
        >
          <Sparkles className="w-5 h-5" />
        </span>

        <h2
          id="credits-exhausted-title"
          className="font-display text-[26px] leading-tight mb-2"
          style={{ color: 'var(--ink)' }}
        >
          Seus créditos de IA acabaram
        </h2>

        <p className="text-[14px] leading-relaxed mb-1" style={{ color: 'var(--ink-dim)' }}>
          {rechargeDate
            ? <>Eles voltam em <strong style={{ color: 'var(--ink)' }}>{rechargeDate}</strong>, na recarga do seu plano.</>
            : 'Eles voltam na próxima recarga mensal do seu plano.'}
        </p>
        <p className="text-[14px] leading-relaxed mb-6" style={{ color: 'var(--ink-dim)' }}>
          Enquanto isso, você pode continuar usando o Creatools normalmente. Só as
          ferramentas de IA ficam indisponíveis até lá.
        </p>

        <div className="flex items-center gap-2">
          <button onClick={close} className="brand-btn primary flex-1 justify-center" style={{ padding: '10px 14px' }}>
            Entendi
          </button>
          <Link href="/conta" onClick={close} className="brand-btn outline flex-1 justify-center" style={{ padding: '10px 14px' }}>
            Ver assinatura
          </Link>
        </div>
      </div>
    </div>
  );
}
