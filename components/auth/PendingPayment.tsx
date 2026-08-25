'use client';

import { useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon } from '@hugeicons/core-free-icons';

/**
 * Mostrado quando o checkout foi pago mas o webhook ainda não gravou a
 * assinatura (race de poucos segundos). Recarrega sozinho até a sub aparecer.
 */
export default function PendingPayment() {
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="brand-card flex flex-col items-center text-center" style={{ padding: 28 }}>
      <HugeiconsIcon icon={Loading03Icon} size={32} strokeWidth={1.75} aria-hidden className="mb-4 animate-spin motion-reduce:animate-none" style={{ color: 'var(--accent)' }} />
      <h2 className="font-display text-[24px] leading-none mb-2">Confirmando seu pagamento…</h2>
      <p className="text-[13.5px] leading-6" style={{ color: 'var(--ink-dim)' }}>
        Isso leva só alguns segundos. A página atualiza automaticamente.
      </p>
    </div>
  );
}
