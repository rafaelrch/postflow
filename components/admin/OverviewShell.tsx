'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, CalendarDays } from 'lucide-react';
import { PERIOD_PRESETS, type ResolvedPeriod } from '@/lib/admin-period';
import OverviewSkeleton from './OverviewSkeleton';

/**
 * Filtro global de período + esqueleto de carregamento.
 *
 * ── POR QUE OS DOIS NO MESMO COMPONENTE ─────────────────────────────────────
 * Porque o esqueleto NÃO PODE vir de `loading.tsx` nem de um <Suspense> em
 * volta de Server Component que lê o banco. Este projeto já se queimou com
 * isso: ver docs/bug-loading-fetch-next16.md — no Next 16 o boundary criado
 * por `loading.tsx` nunca resolve quando o Server Component faz fetch, e a
 * tela fica no esqueleto PARA SEMPRE, com o conteúdo real escondido no DOM.
 * Três telas do produto morreram assim e existe um teste (tests/
 * loading-rotas.test.tsx) que impede o arquivo de voltar.
 *
 * O contorno é este: os números chegam prontos do servidor como `children`, e
 * o esqueleto aparece durante a TRANSIÇÃO do cliente — que é estado de React
 * comum, não boundary de Suspense. Quem sabe que a navegação está em curso é
 * o `useTransition` daqui, então o filtro e o esqueleto precisam do mesmo
 * estado, logo do mesmo componente.
 *
 * ── POR QUE A URL É A FONTE DA VERDADE ──────────────────────────────────────
 * O recorte fica em `?periodo=&de=&ate=`, e não em estado local: o Rafael pode
 * favoritar "/admin?periodo=90d", recarregar e continuar vendo o mesmo. E
 * `replace` em vez de `push` para cinco cliques no filtro não virarem cinco
 * entradas no histórico.
 */

export default function OverviewShell({
  period,
  children,
}: {
  period: ResolvedPeriod;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [de, setDe] = useState(period.fromDate);
  const [ate, setAte] = useState(period.toDate);
  const [showCustom, setShowCustom] = useState(period.key === 'custom');

  // O servidor pode corrigir o intervalo (data inválida cai em 30 dias).
  // Reespelha, para os inputs não mostrarem um recorte que não está na tela.
  useEffect(() => {
    setDe(period.fromDate);
    setAte(period.toDate);
  }, [period.fromDate, period.toDate]);

  function navigate(query: string) {
    startTransition(() => router.replace(`${pathname}?${query}`, { scroll: false }));
  }

  function selectPreset(key: string) {
    navigate(new URLSearchParams({ periodo: key }).toString());
  }

  function applyCustom() {
    if (!de || !ate || de > ate) return;
    navigate(new URLSearchParams({ periodo: 'custom', de, ate }).toString());
  }

  const invalidRange = Boolean(de && ate && de > ate);

  return (
    <div className="admin-overview-shell">
      <section
        aria-label="Filtro de período"
        data-pending={pending ? 'true' : 'false'}
        className="admin-topbar"
      >
        <div className="admin-section-title">
          <span className="admin-section-icon"><BarChart3 size={16} strokeWidth={1.8} /></span>
          <div>
            <h1>Visão geral</h1>
            <p>Valores em BRL · fuso de São Paulo</p>
          </div>
        </div>

        <div className="admin-period-wrap">
          <div className="admin-segmented" aria-label="Período da aquisição">
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => selectPreset(preset.key)}
                aria-label={preset.label}
                aria-pressed={period.key === preset.key}
                data-testid={`periodo-${preset.key}`}
              >
                {preset.key === 'hoje' ? 'Hoje' : preset.key.replace('d', ' dias')}
              </button>
            ))}
            <button
              type="button"
              aria-label="Período personalizado"
              aria-pressed={period.key === 'custom'}
              onClick={() => setShowCustom((value) => !value)}
            >
              <CalendarDays size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {showCustom && (
          <div className="admin-custom-period">
            <label htmlFor="periodo-de">De</label>
            <input id="periodo-de" type="date" value={de} max={ate || undefined} onChange={(event) => setDe(event.target.value)} />
            <label htmlFor="periodo-ate">Até</label>
            <input id="periodo-ate" type="date" value={ate} min={de || undefined} onChange={(event) => setAte(event.target.value)} />
            <button type="button" onClick={applyCustom} disabled={invalidRange} data-testid="periodo-custom-aplicar">Aplicar</button>
          </div>
        )}

        {invalidRange && <p className="admin-filter-message admin-filter-message--danger">A data inicial precisa ser anterior à final.</p>}
        {period.customInvalid && <p className="admin-filter-message">O intervalo pedido era inválido. Mostrando os últimos 30 dias.</p>}
      </section>

      {pending ? <OverviewSkeleton /> : children}
    </div>
  );
}
