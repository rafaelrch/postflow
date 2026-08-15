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
    <div className="admin-split">
      <div
        className="admin-split-track"
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
      <ul>
        {parts.map((part) => (
          <li key={part.label}>
            <span aria-hidden className={`admin-split-dot ${part.className}`} />
            <span>{part.label}</span>
            <span className="admin-tabular">{part.value}</span>
            <span className="admin-tabular">
              {total > 0 ? `(${Math.round((part.value / total) * 100)}%)` : '(—)'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
