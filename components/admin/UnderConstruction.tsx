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
  const icons = { Clientes: Users, Financeiro: WalletCards, Produto: Box, Saúde: Activity } as const;
  const Icon = icons[title as keyof typeof icons] ?? Clock3;

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <div className="admin-section-title">
          <span className="admin-section-icon"><Icon size={16} strokeWidth={1.8} /></span>
          <div><h1>{title}</h1><p>Área interna</p></div>
        </div>
        <span className="admin-scope-badge admin-topbar-badge">Em breve</span>
      </header>

      <section className="admin-empty-state" data-testid="admin-em-construcao">
        <span className="admin-empty-icon"><Clock3 size={18} strokeWidth={1.7} /></span>
        <p className="admin-empty-eyebrow">Em construção</p>
        <h2>{title}</h2>
        <p className="admin-empty-summary">{summary}</p>

        <p className="admin-empty-list-title">Falta para esta área existir</p>
        <ul>
        {pending.map((item) => (
          <li key={item}>
            <span aria-hidden>—</span>
            <span>{item}</span>
          </li>
        ))}
        </ul>

        <p className="admin-empty-note">Nenhum número é exibido aqui de propósito: número inventado é pior que aba vazia.</p>
      </section>
    </div>
  );
}
import { Activity, Box, Clock3, Users, WalletCards } from 'lucide-react';
