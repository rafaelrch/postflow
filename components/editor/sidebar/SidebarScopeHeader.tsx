'use client';

import { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scopeHeaderCls } from './tokens';

/**
 * Cabeçalho que declara o ESCOPO de um grupo de painéis.
 *
 * É o que faltava na barra lateral antiga: tudo era uma lista plana e nada
 * dizia se um controle mexia neste slide ou no carrossel inteiro. O usuário
 * descobria mudando e vendo o que acontecia nos outros slides.
 */
export default function SidebarScopeHeader({
  label,
  hint,
  value,
  info,
  leading,
}: {
  /** "CONTEÚDO", "ESTILO GLOBAL". Já vai em caixa alta pelo estilo. */
  label?: string;
  /** Complemento em tom menor — "aplica a todos os slides". */
  hint?: string;
  /** Valor em destaque à direita do label — o número do slide. */
  value?: string;
  /**
   * Explicação de primeira-visita, em tooltip. É onde foi parar o parágrafo
   * do Template 1 que antes ocupava a primeira linha da barra: texto que se
   * lê uma vez não merece uma linha permanente na navegação.
   */
  info?: string;
  /** Bloco à esquerda da linha — a pílula "Voltar para Dashboard". */
  leading?: ReactNode;
}) {
  return (
    // px 20 (não 13 das linhas): no desenho a pílula e o rótulo recuam um pouco
    // mais que os cards do acordeão. O rótulo vai para a direita com `ml-auto`.
    // A linha inteira cabe em 285 de painel: pílula + "CONTEÚDO — SLIDE 01" é
    // apertado, então tudo aqui é `whitespace-nowrap`. Sem isso as duas metades
    // quebram em duas linhas cada e a linha do desenho vira um bloco de quatro.
    // Orçamento da linha em 285 de painel: pílula 120 + rótulo 77 + valor 46 +
    // recuos 20 = 263, contra 265 úteis. Foi por isso que o corpo caiu para 11
    // e o tracking ficou negativo — em 12px a conta dava 271 e o rótulo
    // aparecia como "CONTEÚ…". O `truncate` fica como rede, não como plano:
    // com o orçamento fechado ele nunca chega a aparecer.
    // px 13 alinha o cabeçalho com a borda esquerda das linhas do acordeão.
    <div className="flex items-center gap-1.5 px-[13px] pt-[30px] pb-[20px]">
      {leading}
      <span className={cn(scopeHeaderCls, 'ml-auto min-w-0 truncate')}>
        {label}
        {label && value && <span className="mx-0.5">—</span>}
      </span>
      {value && (
        <span className="shrink-0 text-[12px] font-bold uppercase tracking-[-0.01em] text-[var(--ink)] tabular-nums whitespace-nowrap">
          {value}
        </span>
      )}
      {hint && <span className={cn(scopeHeaderCls, 'font-normal opacity-70')}>{hint}</span>}
      {info && (
        <span title={info} className="ml-auto cursor-help text-[var(--ink-muted)]">
          <Info className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
}
