'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

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
      <Loader2 className="w-8 h-8 mb-4 animate-spin" style={{ color: 'var(--accent)' }} />
      <h2 className="font-display text-[24px] leading-none mb-2">Confirmando seu pagamento…</h2>
      <p className="text-[13.5px] leading-6" style={{ color: 'var(--ink-dim)' }}>
        Isso leva só alguns segundos. A página atualiza automaticamente.
      </p>
    </div>
  );
}
