'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';

/**
 * Controle de paginação — um só, usado no dashboard e nas notícias.
 *
 * Desenho do Gmail: um rótulo de INTERVALO e dois chevrons discretos.
 *
 *     1-10 de 11   ‹  ›
 *
 * Quem informa é o intervalo, não um número de página: por isso não existe mais
 * "Página X de Y". As setas não têm preenchimento nem rótulo escrito — elas
 * encostam na direita e não competem com o título da página.
 *
 * Tokens do `globals.css`, sem hex literal.
 */
export default function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onChange,
  label = 'Paginação',
}: {
  /** Página atual, 1-based. */
  page: number;
  totalPages: number;
  /** Total de itens da lista inteira — é o "de 11" do rótulo. */
  totalItems: number;
  /** Itens por página, para calcular o intervalo. */
  pageSize: number;
  onChange: (page: number) => void;
  /** Rótulo do `nav` — distingue as duas listas quando há mais de uma na tela. */
  label?: string;
}) {
  const noComeco = page <= 1;
  const noFim = page >= totalPages;

  // Intervalo do Gmail: "1-10 de 11". O fim é limitado pelo total, senão a
  // última página anunciaria itens que não existem.
  const primeiro = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const ultimo = Math.min(page * pageSize, totalItems);
  const nf = new Intl.NumberFormat('pt-BR');
  const intervalo =
    totalItems === 0
      ? '0 de 0'
      : `${nf.format(primeiro)}-${nf.format(ultimo)} de ${nf.format(totalItems)}`;

  const seta =
    'w-8 h-8 inline-grid place-items-center rounded-[10px] bg-transparent transition-colors ' +
    'text-[var(--ink)] hover:bg-[var(--paper-3)] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ' +
    // Desabilitado PRECISA parecer desabilitado: tinta apagada, sem hover,
    // cursor de bloqueio. Parar de funcionar em silêncio não basta.
    'disabled:text-[var(--ink-muted)] disabled:hover:bg-transparent disabled:cursor-not-allowed';

  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {/* `aria-live` porque o intervalo muda sem trocar de tela. */}
      <span
        aria-live="polite"
        className="text-[12px] tabular-nums mr-1 whitespace-nowrap"
        style={{ color: 'var(--ink-dim)' }}
      >
        {intervalo}
      </span>

      {/* As SETAS somem com uma página só; o rótulo fica. Com uma página o
          intervalo ainda informa quantos itens existem — esconder o bloco
          inteiro tiraria da tela um dado que ninguém mais dá na lista de
          notícias. Navegação que não navega é que vira ruído. */}
      {totalPages > 1 && (
        <>
          <button
            type="button"
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={noComeco}
            aria-label="Página anterior"
            title="Página anterior"
            className={seta}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onChange(Math.min(totalPages, page + 1))}
            disabled={noFim}
            aria-label="Próxima página"
            title="Próxima página"
            className={seta}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </>
      )}
    </nav>
  );
}
