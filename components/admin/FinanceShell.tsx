'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, WalletCards } from 'lucide-react';
import { PERIOD_PRESETS, type ResolvedPeriod } from '@/lib/admin-period';
import FinanceSkeleton from './FinanceSkeleton';

export default function FinanceShell({ period, children }: { period: ResolvedPeriod; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [de, setDe] = useState(period.fromDate);
  const [ate, setAte] = useState(period.toDate);
  const [showCustom, setShowCustom] = useState(period.key === 'custom');

  useEffect(() => { setDe(period.fromDate); setAte(period.toDate); }, [period.fromDate, period.toDate]);
  const navigate = (query: string) => startTransition(() => router.replace(`${pathname}?${query}`, { scroll: false }));
  const invalidRange = Boolean(de && ate && de > ate);

  return (
    <div className="admin-overview-shell">
      <section aria-label="Filtro de período" data-pending={pending ? 'true' : 'false'} className="admin-topbar">
        <div className="admin-section-title">
          <span className="admin-section-icon"><WalletCards size={16} strokeWidth={1.8} /></span>
          <div><h1>Financeiro</h1><p>Receita bruta · BRL · fuso de São Paulo</p></div>
        </div>
        <div className="admin-period-wrap">
          <div className="admin-segmented" aria-label="Período financeiro">
            {PERIOD_PRESETS.map((preset) => (
              <button key={preset.key} type="button" aria-pressed={period.key === preset.key} onClick={() => navigate(new URLSearchParams({ periodo: preset.key }).toString())}>
                {preset.key === 'hoje' ? 'Hoje' : preset.key.replace('d', ' dias')}
              </button>
            ))}
            <button type="button" aria-label="Período personalizado" aria-pressed={period.key === 'custom'} onClick={() => setShowCustom((value) => !value)}>
              <CalendarDays size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>
        {showCustom && (
          <div className="admin-custom-period">
            <label htmlFor="financeiro-de">De</label><input id="financeiro-de" type="date" value={de} max={ate || undefined} onChange={(event) => setDe(event.target.value)} />
            <label htmlFor="financeiro-ate">Até</label><input id="financeiro-ate" type="date" value={ate} min={de || undefined} onChange={(event) => setAte(event.target.value)} />
            <button type="button" disabled={invalidRange} onClick={() => navigate(new URLSearchParams({ periodo: 'custom', de, ate }).toString())}>Aplicar</button>
          </div>
        )}
        {invalidRange && <p className="admin-filter-message admin-filter-message--danger">A data inicial precisa ser anterior à final.</p>}
      </section>
      {pending ? <FinanceSkeleton /> : children}
    </div>
  );
}
