'use client';

import { useEffect, useRef } from 'react';

/**
 * A CASCA de diálogo do roadmap — o comportamento, não a aparência.
 *
 * Existe porque agora há DOIS popups no quadro público (criar task e detalhe do
 * card) e mais um no /admin, e a regra de foco de um diálogo modal não é uma
 * linha: é ESC que fecha, Tab que não escapa, foco que ENTRA ao abrir e VOLTA
 * para o gatilho ao fechar, e clique fora que fecha. Três cópias disso divergem
 * no primeiro ajuste — e o jeito que elas divergem é sempre o mesmo: uma delas
 * para de devolver o foco e quem navega por teclado é cuspido no topo da página.
 *
 * ⚠️ A APARÊNCIA FICA DE FORA de propósito. O quadro público é Tailwind sobre os
 * tokens do produto; o /admin é `admin.css` sobre os tokens do painel. Uma casca
 * que trouxesse classe própria obrigaria um dos dois a herdar o tema do outro.
 * Por isso overlay e painel recebem `className` de quem usa: esta casca cuida do
 * foco, o chamador cuida do desenho.
 */

/**
 * O que conta como parada de Tab dentro do painel.
 *
 * `select` está na lista porque o card do /admin tem um — a casca é comum, e uma
 * lista que só conhecesse `button` deixaria o seletor de coluna fora do ciclo se
 * um dia ele entrar num diálogo.
 */
const FOCAVEIS =
  'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export default function RoadmapDialog({
  labelledBy,
  onClose,
  overlayClassName,
  panelClassName,
  initialFocusSelector,
  testId,
  children,
}: {
  /** `id` do elemento que dá nome ao diálogo — vira o `aria-labelledby`. */
  labelledBy: string;
  onClose: () => void;
  overlayClassName?: string;
  panelClassName?: string;
  /** Seletor do campo que deve receber o foco ao abrir. Sem ele, o primeiro focável. */
  initialFocusSelector?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLElement | null>(null);

  /**
   * O foco ENTRA ao abrir e VOLTA ao fechar.
   *
   * Quem abriu o diálogo é guardado no próprio efeito, e não numa prop: o
   * gatilho é sempre o elemento que estava focado no instante da montagem, e
   * pedir isso ao chamador seria pedir que ele repetisse o que o DOM já sabe.
   *
   * A devolução mora na LIMPEZA do efeito, então vale para qualquer motivo de
   * fechamento — ESC, X, clique fora ou o componente pai sumindo com o card.
   */
  useEffect(() => {
    gatilhoRef.current = document.activeElement as HTMLElement | null;

    const painel = painelRef.current;
    const alvo =
      (initialFocusSelector ? painel?.querySelector<HTMLElement>(initialFocusSelector) : null) ??
      painel?.querySelector<HTMLElement>(FOCAVEIS);
    alvo?.focus();

    return () => {
      gatilhoRef.current?.focus?.();
    };
  }, [initialFocusSelector]);

  /**
   * ESC fecha e o Tab não sai do diálogo.
   *
   * `aria-modal` só PROMETE isso ao leitor de tela; quem cumpre é este handler.
   * Sem ele, o Tab passeia pelos botões do quadro atrás do overlay — que o mouse
   * não alcança, porque o overlay os cobre.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const painel = painelRef.current;
      if (!painel) return;
      const focaveis = painel.querySelectorAll<HTMLElement>(FOCAVEIS);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;

      if (e.shiftKey && (ativo === primeiro || !painel.contains(ativo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-testid={testId}
      className={overlayClassName}
      onClick={onClose}
    >
      <div ref={painelRef} onClick={(e) => e.stopPropagation()} className={panelClassName}>
        {children}
      </div>
    </div>
  );
}
