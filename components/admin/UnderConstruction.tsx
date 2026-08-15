/**
 * Estado honesto das abas que ainda não existem.
 *
 * A alternativa tentadora seria encher a aba com os números que já temos à mão
 * para ela "não ficar vazia". Isso é pior que vazio: um card plausível na aba
 * errada vira decisão errada. Aqui a tela diz o que falta e por quê.
 */
export default function UnderConstruction({
  title,
  summary,
  pending,
}: {
  title: string;
  summary: string;
  /** O que precisa existir antes desta aba poder mostrar número. */
  pending: string[];
}) {
  return (
    <section className="brand-card max-w-3xl p-6 sm:p-8" data-testid="admin-em-construcao">
      <p className="section-kicker">Em construção</p>
      <h2 className="font-display mt-1 text-3xl leading-none">{title}</h2>
      <hr className="hairline my-4" />
      <p className="max-w-prose text-sm text-[var(--ink-2)]">{summary}</p>

      <p className="section-kicker mt-6">Falta para esta aba existir</p>
      <ul className="mt-2 space-y-1.5">
        {pending.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-[var(--ink-dim)]">
            <span aria-hidden className="text-[var(--accent)]">—</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[11px] text-[var(--ink-muted)]">
        Nenhum número é exibido aqui de propósito: número inventado é pior que aba vazia.
      </p>
    </section>
  );
}
