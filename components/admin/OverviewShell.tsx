'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
    <div className="flex flex-col gap-6">
      <section
        aria-label="Filtro de período"
        data-pending={pending ? 'true' : 'false'}
        className="flex flex-col gap-3"
      >
        {/* Dois grupos, não uma fila só: no celular a linha quebra ENTRE os
            presets e o intervalo custom, em vez de deixar "Últimos 90 dias"
            grudado no campo "De". */}
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => selectPreset(preset.key)}
              aria-pressed={period.key === preset.key}
              data-testid={`periodo-${preset.key}`}
              className={`brand-btn sm ${period.key === preset.key ? 'primary' : 'outline'}`}
            >
              {preset.label}
            </button>
          ))}

        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="section-kicker" htmlFor="periodo-de">
            De
          </label>
          <input
            id="periodo-de"
            type="date"
            value={de}
            max={ate || undefined}
            onChange={(event) => setDe(event.target.value)}
            // width inline e não classe: `.brand-input` declara width:100% fora
            // de @layer, e CSS sem camada vence as utilities do Tailwind (que
            // ficam em layer) — a data esticava na linha inteira.
            style={{ width: '9.5rem' }}
            className="brand-input font-mono py-1.5 text-[12px]"
          />
          <label className="section-kicker" htmlFor="periodo-ate">
            Até
          </label>
          <input
            id="periodo-ate"
            type="date"
            value={ate}
            min={de || undefined}
            onChange={(event) => setAte(event.target.value)}
            style={{ width: '9.5rem' }}
            className="brand-input font-mono py-1.5 text-[12px]"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={invalidRange}
            data-testid="periodo-custom-aplicar"
            className={`brand-btn sm ${period.key === 'custom' ? 'primary' : 'outline'}`}
          >
            Aplicar
          </button>
        </div>

        {invalidRange && (
          <p className="text-[11px] text-[var(--danger)]">
            A data inicial precisa ser anterior à final.
          </p>
        )}
        {period.customInvalid && (
          <p className="text-[11px] text-[var(--warn)]">
            O intervalo pedido na URL era inválido. Mostrando os últimos 30 dias.
          </p>
        )}
      </section>

      <hr className="hairline soft" />

      {pending ? <OverviewSkeleton /> : children}
    </div>
  );
}
