'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Box, CalendarDays } from 'lucide-react';
import { PERIOD_PRESETS, type ResolvedPeriod } from '@/lib/admin-period';

export default function ProductShell({ period, children }: { period: ResolvedPeriod; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [de, setDe] = useState(period.fromDate);
  const [ate, setAte] = useState(period.toDate);
  const [custom, setCustom] = useState(period.key === 'custom');
  useEffect(() => { setDe(period.fromDate); setAte(period.toDate); }, [period.fromDate, period.toDate]);
  const navigate = (query: string) => startTransition(() => router.replace(`${pathname}?${query}`, { scroll: false }));
  const invalid = Boolean(de && ate && de > ate);

  return <div className="admin-overview-shell">
    <section aria-label="Filtro de período" data-pending={pending ? 'true' : 'false'} className="admin-topbar">
      <div className="admin-section-title"><span className="admin-section-icon"><Box size={16} /></span><div><h1>Produto</h1><p>Uso real · eventos sem conteúdo privado</p></div></div>
      <div className="admin-period-wrap"><div className="admin-segmented" aria-label="Período de produto">
        {PERIOD_PRESETS.map((preset) => <button key={preset.key} type="button" aria-pressed={period.key === preset.key} onClick={() => navigate(new URLSearchParams({ periodo: preset.key }).toString())}>{preset.key === 'hoje' ? 'Hoje' : preset.key.replace('d', ' dias')}</button>)}
        <button type="button" aria-label="Período personalizado" aria-pressed={period.key === 'custom'} onClick={() => setCustom((value) => !value)}><CalendarDays size={14} /></button>
      </div></div>
      {custom && <div className="admin-custom-period"><label htmlFor="produto-de">De</label><input id="produto-de" type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} /><label htmlFor="produto-ate">Até</label><input id="produto-ate" type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} /><button type="button" disabled={invalid} onClick={() => navigate(new URLSearchParams({ periodo: 'custom', de, ate }).toString())}>Aplicar</button></div>}
      {invalid && <p className="admin-filter-message admin-filter-message--danger">A data inicial precisa ser anterior à final.</p>}
    </section>
    {pending ? <div className="admin-product-loading" role="status">Atualizando métricas…</div> : children}
  </div>;
}
