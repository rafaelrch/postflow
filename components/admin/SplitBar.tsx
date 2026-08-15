/**
 * Barra de proporção mensal × anual. CSS puro, sem biblioteca de gráfico: são
 * duas fatias, e um pacote de charts inteiro para desenhar duas fatias é peso
 * que a página paga para sempre.
 */
export default function SplitBar({
  parts,
}: {
  parts: { label: string; value: number; className: string }[];
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full border-[1.5px] border-[var(--ink)] bg-[var(--paper-3)]"
        role="img"
        aria-label={parts.map((part) => `${part.label}: ${part.value}`).join(', ')}
      >
        {total > 0 &&
          parts.map((part) => (
            <span
              key={part.label}
              className={part.className}
              style={{ width: `${(part.value / total) * 100}%` }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--ink-dim)]">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${part.className}`} />
            <span>{part.label}</span>
            <span className="font-mono text-[var(--ink)]">{part.value}</span>
            <span className="font-mono">
              {total > 0 ? `(${Math.round((part.value / total) * 100)}%)` : '(—)'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
