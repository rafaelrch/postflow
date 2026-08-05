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
 */

/** Header de escopo do grupo — "CONTEÚDO — SLIDE 02". */
export const scopeHeaderCls =
  'text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-900/35 dark:text-white/30';

/** Rótulo do painel na linha do card — o texto que o usuário clica. */
export const panelLabelCls = 'text-[13px] font-medium text-gray-900 dark:text-white';

/** Rótulo de campo dentro de um painel aberto. */
export const labelCls =
  'text-[11px] font-semibold text-gray-900/45 dark:text-white/40 uppercase tracking-[0.06em]';

/** Campo de texto/textarea. */
export const inputCls =
  'w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-black/[0.07] dark:border-white/[0.07] text-gray-900 dark:text-white text-[12px] placeholder-black/20 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-black/[0.06] dark:focus:ring-white/[0.06] focus:border-black/20 dark:focus:border-white/20 transition-all';

/** Texto de apoio abaixo de um campo ou no topo de um painel. */
export const helpCls = 'text-[11px] leading-relaxed text-gray-900/40 dark:text-white/35';

/** Contadores e valores de slider — tabular para não dançar ao mudar. */
export const numericCls = 'text-[11px] tabular-nums text-gray-900/45 dark:text-white/40';

/** `<select>` dentro de um painel. */
export const selectCls =
  'w-full px-2 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-[12px] focus:outline-none focus:border-black/30 dark:focus:border-white/30 cursor-pointer';
