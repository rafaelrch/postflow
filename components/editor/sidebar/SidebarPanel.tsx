'use client';

import { ReactNode, useEffect, useState } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ChevronRightIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { panelLabelCls } from './tokens';

/**
 * Duração da abertura/fechamento. Precisa ser a MESMA no CSS e no JS: o CSS
 * anima, e o JS espera este tempo para desmontar o corpo no fechamento.
 */
const ABRE_MS = 200;

/**
 * Uma linha de painel da barra lateral: ícone, rótulo, chevron, em card.
 *
 * Substitui o `Section` antigo, que era só um título e um triângulo. As
 * diferenças que importam:
 *
 * - **ícone obrigatório** — o usuário passa a achar o painel pela forma antes
 *   de ler o rótulo, que é como ele acha no MyPostFlow;
 * - **`disabled` exige `disabledReason`** — o botão de restaurar ficava cinza
 *   sem dizer por quê, e o usuário não tinha como saber que "cinza" queria
 *   dizer "este slide ainda segue o template";
 * - **estado aberto/fechado continua local**, então quem renderiza PRECISA
 *   passar `key` estável (o id do painel, nunca o índice): sem isso, ao trocar
 *   a composição do grupo o React reaproveita o componente pela posição e o
 *   aberto/fechado migra de um painel para outro.
 */
export default function SidebarPanel({
  id,
  icon: Icon,
  label,
  badge,
  defaultOpen = false,
  disabled = false,
  disabledReason,
  children,
}: {
  /** Identidade do painel. Use o mesmo valor no `key` do elemento. */
  id: string;
  icon: IconSvgElement;
  label: string;
  /** Sinal curto à direita do rótulo — "3 alterações". */
  badge?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  /** Obrigatório quando `disabled`: vira o tooltip que explica o cinza. */
  disabledReason?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = open && !disabled;

  /**
   * Duas fases para a animação, e é isto que separa "existir" de "estar aberto":
   *
   * - `montado` — o corpo está no DOM. Continua FALSO quando fechado. Fechar
   *   só desmonta depois que a animação termina, para haver o que animar.
   * - `expandido` — a linha do grid está em 1fr. Vira `true` no quadro
   *   SEGUINTE ao da montagem: saindo de 0fr no mesmo quadro, o navegador não
   *   vê dois valores e não há transição nenhuma.
   *
   * 🔴 Manter o corpo fechado fora do DOM não é detalhe de implementação: é o
   * que garante que ele não recebe foco por Tab nem é lido por leitor de tela.
   * A alternativa (deixar sempre montado e marcar `inert`) depende de o atributo
   * estar certo em todo caminho; aqui não existe estado errado possível.
   */
  const [montado, setMontado] = useState(isOpen);
  const [expandido, setExpandido] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setMontado(true);
      // 🔴 DOIS quadros, não um. Com um só, o React ainda processa a mudança
      // para 1fr antes da pintura daquele quadro: o navegador nunca chega a
      // PINTAR o 0fr, fica sem valor inicial e o painel abre seco (medido — a
      // altura já vinha cheia na primeira amostra, 25ms depois do clique).
      // O primeiro quadro garante o 0fr pintado; o segundo inicia a transição.
      let segundo = 0;
      const primeiro = requestAnimationFrame(() => {
        segundo = requestAnimationFrame(() => setExpandido(true));
      });
      return () => {
        cancelAnimationFrame(primeiro);
        cancelAnimationFrame(segundo);
      };
    }
    setExpandido(false);
    const timer = setTimeout(() => setMontado(false), ABRE_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  return (
    <div
      data-panel={id}
      className={cn(
        // 🔴 A linha NÃO é branca: é `--studio-row` sobre `--studio-panel`, 8
        // pontos de diferença. Quem separa a linha do painel é a BORDA. Branco
        // aqui erra a cara da página inteira.
        // 🔴 Largura FIXA, não derivada do espaço que sobra. A geometria vem do
        // desenho: painel 285 com inset 13 dos dois lados ⇒ linha em x=13,
        // 259 de largura, borda direita em 272 — a mesma do rodapé.
        //
        // Já errou para os dois lados por depender da barra de rolagem: com
        // margem à direita a linha ficava 13 mais estreita que o rodapé; sem
        // margem, ela passou a depender da canaleta e encostava na borda do
        // painel onde a barra é sobreposta (a canaleta some e a linha vai a
        // 272). Com largura fixa a borda bate com o rodapé nos dois estados e
        // nos dois tipos de barra; os 13 que sobram à direita são o vão onde a
        // barra vive, sem empurrar nada.
        'ml-[13px] w-[259px] mb-[5px] rounded-[11px] border bg-[var(--studio-row)] transition-colors',
        isOpen
          ? 'border-[var(--ink)]'
          : 'border-[var(--studio-line)] hover:border-[var(--studio-line-strong)]',
        disabled && 'opacity-40'
      )}
    >
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-expanded={isOpen}
        className={cn(
          // Altura fixa de 52 e recuos do desenho: ícone a 18 da borda da linha,
          // rótulo a 12 do ícone, chevron a 16 da direita.
          'w-full h-[52px] flex items-center gap-[12px] pl-[18px] pr-[16px] text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-select)]',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        {/* O quadrado cinza do desenho é PLACEHOLDER de ícone — o ícone real do
            PANEL_REGISTRY ocupa a mesma pegada de 24×24. */}
        <span className="shrink-0 w-6 h-6 grid place-items-center">
          <HugeiconsIcon icon={Icon} className="w-[18px] h-[18px] text-[var(--ink)]" aria-hidden />
        </span>
        <span className={cn(panelLabelCls, 'flex-1 truncate')}>{label}</span>
        {badge && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-semibold tabular-nums text-[var(--paper)] bg-[var(--accent)]">
            {badge}
          </span>
        )}
        <HugeiconsIcon
          icon={ChevronRightIcon}
          size={16}
          strokeWidth={1.75}
          className={cn(
            'w-4 h-4 shrink-0 text-[var(--studio-ink-secondary)] transition-transform duration-200 ease-out',
            isOpen && 'rotate-90'
          )}
          aria-hidden
        />
      </button>

      {montado && (
        /**
         * Altura automática que TRANSICIONA, sem medir nada em JS: o corpo é uma
         * linha de grid que vai de `0fr` a `1fr`. O `1fr` é a altura do conteúdo,
         * qualquer que seja ela — por isso "Cantos" (curto) e "Estilo do texto"
         * (sliders, selects, color picker) animam com o mesmo código, e o painel
         * que muda de tamanho enquanto está aberto acompanha sozinho, sem
         * remedição. `height: auto` não transiciona; altura fixa chutada
         * cortaria o conteúdo alto.
         */
        <div
          className={cn(
            'studio-panel-body grid transition-[grid-template-rows] duration-200 ease-out',
            expandido ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}
        >
          {/* O `overflow-hidden` é o que dá o corte: sem ele o conteúdo vaza
              para fora da linha de 0fr e não há colapso nenhum. */}
          <div
            className={cn(
              'studio-panel-body overflow-hidden transition-opacity duration-200 ease-out',
              expandido ? 'opacity-100' : 'opacity-0'
            )}
          >
            <div className="px-[18px] pb-4 pt-0.5 flex flex-col gap-3">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
