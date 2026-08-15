/**
 * Esqueleto da Visão geral: mesma grade, mesma altura de card. Placeholder com
 * outra forma faz a tela pular quando o dado chega, e o salto lê como bug.
 */
export default function OverviewSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div
      aria-hidden
      data-testid="admin-skeleton"
      className="admin-metrics-grid admin-skeleton"
    >
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="admin-metric-card">
          <div /><div /><div />
        </div>
      ))}
    </div>
  );
}
