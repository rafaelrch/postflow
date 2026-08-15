'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RotateCcw } from 'lucide-react';

/** Recarrega todas as leituras, mas aparece somente dentro do card que falhou. */
export default function MetricRetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="admin-metric-retry"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RotateCcw size={12} strokeWidth={1.8} aria-hidden />
      {pending ? 'Tentando…' : 'Tentar de novo'}
    </button>
  );
}
