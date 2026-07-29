'use client';

import Link from 'next/link';
import { X, Sparkles, FolderLock, Clapperboard, Newspaper } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUpgradeStore, type UpgradeReason } from '@/hooks/useUpgradeStore';

type ModalContent = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
  dismiss: string;
};

// Mensagens específicas e honestas por motivo. Reels/News deixam claro o que a
// trava é de verdade: acervo de 1 (reel) vs. limite que RENOVA (news).
const CONTENT: Record<UpgradeReason, ModalContent> = {
  plan_required: {
    icon: Sparkles,
    title: 'Isso é um recurso de IA',
    body: (
      <>
        Gerar carrosséis e imagens com IA é exclusivo dos planos pagos. No plano
        Grátis você continua com o editor completo e todos os templates manuais —
        a IA entra com o upgrade.
      </>
    ),
    dismiss: 'Continuar no Grátis',
  },
  project_limit: {
    icon: FolderLock,
    title: 'Você chegou ao limite do plano Grátis',
    body: (
      <>
        O plano Grátis salva até <strong style={{ color: 'var(--ink)' }}>5 carrosséis</strong>.
        Nada foi apagado — seus carrosséis continuam salvos. Para criar mais, faça
        upgrade ou apague um carrossel existente.
      </>
    ),
    dismiss: 'Entendi',
  },
  reel_limit: {
    icon: Clapperboard,
    title: 'O plano Grátis guarda 1 Reel',
    body: (
      <>
        No plano Grátis você mantém <strong style={{ color: 'var(--ink)' }}>1 Reel</strong> salvo.
        Nada foi apagado — seu Reel continua salvo. Para criar outro, apague o
        atual ou faça upgrade para ter Reels sem limite.
      </>
    ),
    dismiss: 'Entendi',
  },
  news_daily_limit: {
    icon: Newspaper,
    title: 'Você criou 4 notícias hoje',
    body: (
      <>
        O plano Grátis cria até <strong style={{ color: 'var(--ink)' }}>4 notícias por dia</strong>.
        Isso <strong style={{ color: 'var(--ink)' }}>renova em 24h</strong> — não é um teto
        permanente e nada foi apagado. É só esperar a renovação, ou fazer upgrade
        para criar sem limite.
      </>
    ),
    dismiss: 'Entendi',
  },
};

/**
 * Modal global de upgrade do plano Grátis. Abre nos motivos de useUpgradeStore
 * (IA exigida, teto de projetos/reel, limite diário de news). É conveniência da
 * UI — o enforcement real é do servidor (guard de API) e dos triggers no banco.
 */
export default function UpgradeModal() {
  const reason = useUpgradeStore((s) => s.reason);
  const close = useUpgradeStore((s) => s.close);

  if (!reason) return null;

  const { icon: Icon, title, body, dismiss } = CONTENT[reason];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
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
          <Icon className="w-5 h-5" />
        </span>

        <h2
          id="upgrade-modal-title"
          className="font-display text-[26px] leading-tight mb-2"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </h2>

        <p className="text-[14px] leading-relaxed mb-6" style={{ color: 'var(--ink-dim)' }}>
          {body}
        </p>

        <div className="flex items-center gap-2">
          <Link href="/precos" onClick={close} className="brand-btn primary flex-1 justify-center" style={{ padding: '10px 14px' }}>
            Ver planos
          </Link>
          <button onClick={close} className="brand-btn outline flex-1 justify-center" style={{ padding: '10px 14px' }}>
            {dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
