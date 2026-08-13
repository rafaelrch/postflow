/**
 * Escala tipográfica e campos da barra lateral.
 *
 * Antes cada seção declarava as próprias classes: `labelCls`/`inputCls` viviam
 * duplicados entre `EditorSidebar` e `Template01Slots`, e o `AiGenPanel` tinha
 * uma terceira cópia com outro nome. Mudar o corpo de um rótulo exigia caçar
 * três lugares e sempre sobrava um.
 *
 * A escala subiu: rótulo era 9px e input 10–11px, abaixo do legível. Piso de
 * 11px para rótulo e 12px para input. O `tracking` do rótulo cai de .08em para
 * .06em — com o corpo maior, o espaçamento antigo abria demais a palavra.
 *
 * O header de escopo é o único que fica MENOR que o rótulo: ele nomeia o grupo,
 * não compete com o conteúdo dele.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IDENTIDADE: estes tokens são a ÚNICA fonte de estilo da barra, e falam a
 * língua do design system do produto (`app/globals.css`) — `--ink`, `--paper`,
 * `--line-strong`, `--accent`, `--radius`, borda de 1.5px. Antes a barra usava
 * a paleta genérica do Tailwind (`gray-900`, `blue-500`, `rounded-xl`), então
 * ela parecia de outro produto em relação ao resto do editor. Nada de cor
 * literal aqui: quem precisar de uma cor nova acrescenta um token no
 * globals.css e usa por nome.
 */

/** Header de escopo do grupo — "CONTEÚDO — SLIDE 02". */
export const scopeHeaderCls =
  'text-[12px] font-medium uppercase tracking-[-0.01em] text-[var(--studio-ink-secondary)]';

/** Rótulo do painel na linha do card — o texto que o usuário clica. */
export const panelLabelCls = 'text-[14px] font-medium text-[var(--ink)]';

/** Rótulo de campo dentro de um painel aberto. */
export const labelCls =
  'text-[11px] font-semibold text-[var(--ink-dim)] uppercase tracking-[0.06em]';

/** Campo de texto/textarea. */
export const inputCls =
  'w-full px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--paper)] border-[1.5px] border-[var(--line-strong)] text-[var(--ink)] text-[12px] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink)] transition-colors';

/** Texto de apoio abaixo de um campo ou no topo de um painel. */
export const helpCls = 'text-[11px] leading-relaxed text-[var(--ink-dim)]';

/** Contadores e valores de slider — tabular para não dançar ao mudar. */
export const numericCls = 'text-[11px] tabular-nums text-[var(--ink-dim)]';

/** `<select>` dentro de um painel. */
export const selectCls =
  'w-full px-2 py-1.5 rounded-[var(--radius-sm)] bg-[var(--paper)] border-[1.5px] border-[var(--line-strong)] text-[var(--ink)] text-[12px] focus:outline-none focus:border-[var(--ink)] cursor-pointer transition-colors';
