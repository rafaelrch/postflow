/**
 * Esqueleto da Visão geral: mesma grade, mesma altura de card. Placeholder com
 * outra forma faz a tela pular quando o dado chega, e o salto lê como bug.
 */
export default function OverviewSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div
      aria-hidden
      data-testid="admin-skeleton"
      className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="brand-card flex flex-col gap-3 border-[var(--line-strong)] p-5">
          <div className="h-2.5 w-24 rounded-full bg-[var(--paper-3)]" />
          <div className="h-7 w-20 rounded-[var(--radius-sm)] bg-[var(--paper-3)]" />
          <div className="h-2 w-32 rounded-full bg-[var(--paper-3)]" />
        </div>
      ))}
    </div>
  );
}
