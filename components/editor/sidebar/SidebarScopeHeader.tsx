'use client';

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
}: {
  /** "CONTEÚDO", "ESTILO GLOBAL". Já vai em caixa alta pelo estilo. */
  label: string;
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
}) {
  return (
    <div className="flex items-baseline gap-2 px-4 pt-5 pb-2">
      <span className={scopeHeaderCls}>
        {label}
        {value && <span className="mx-1.5 opacity-50">—</span>}
      </span>
      {value && (
        // Destaque em cor: é o único dado do cabeçalho que muda enquanto o
        // usuário trabalha, então é o único que pode puxar o olho.
        <span className="text-[10px] font-bold tracking-[0.14em] text-blue-500 tabular-nums">
          {value}
        </span>
      )}
      {hint && <span className={cn(scopeHeaderCls, 'opacity-60 font-normal')}>{hint}</span>}
      {info && (
        <span title={info} className="ml-auto cursor-help text-gray-900/30 dark:text-white/25">
          <Info className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
}
