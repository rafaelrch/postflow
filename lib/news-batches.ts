/**
 * Lotes de notícias — agrupar, paginar e apagar.
 *
 * 🔴 A linha do banco é um CARD; a unidade da lista é o LOTE, que só existe
 * depois de agrupar por `batch_id`. Todo defeito desta tela nasce de confundir
 * os dois: paginar LINHAS corta lote no meio (a página 1 termina com metade de
 * um lote e a 2 começa com a outra metade), e apagar UMA linha deixa lote
 * corrompido pela metade.
 *
 * Estas funções saíram de dentro do componente para poderem ser afirmadas em
 * teste: o agrupamento e o recorte da página 2 só executam acima de 10 lotes, e
 * o Rafael tem 2 na conta — sem teste, o caminho ficaria sem prova nenhuma.
 */

/** Lotes salvos por página. Mesmo número do dashboard, de propósito. */
export const NEWS_PAGE_SIZE = 10;

/** As três colunas mínimas que dizem quais lotes existem e em que ordem. */
export type ChaveDeLote = { id: string; created_at: string; batch_id: string | null };

/**
 * Chave do lote: o `batch_id`, ou `single_<id>` para a linha solta.
 *
 * A linha sem `batch_id` (importada antes do agrupamento existir, ou salva
 * avulsa) é um lote de um card só. Sem a chave sintética, todas elas cairiam no
 * mesmo balde e virariam um lote gigante e falso.
 */
export function chaveDoLote(batchId: string | null | undefined, primeiraLinhaId: string): string {
  return batchId ? batchId : `single_${primeiraLinhaId}`;
}

/** Agrupa as chaves preservando a ordem de chegada (created_at desc). */
export function agruparChaves(chaves: ChaveDeLote[]): {
  ordem: string[];
  idsPorLote: Map<string, string[]>;
} {
  const ordem: string[] = [];
  const idsPorLote = new Map<string, string[]>();

  for (const r of chaves) {
    const key = chaveDoLote(r.batch_id, r.id);
    const atual = idsPorLote.get(key);
    if (atual) atual.push(r.id);
    else { idsPorLote.set(key, [r.id]); ordem.push(key); }
  }

  return { ordem, idsPorLote };
}

/**
 * Recorta a página em cima das CHAVES (lotes), nunca das linhas.
 *
 * Página fora do intervalo volta para a última que existe — é o caso de quem
 * apagou o último lote da última página, que não pode ficar olhando para uma
 * lista vazia que na verdade tem conteúdo uma página atrás.
 */
export function paginarLotes(
  ordem: string[],
  pagina: number,
  size: number = NEWS_PAGE_SIZE,
): { pagina: number; paginas: number; chavesDaPagina: string[] } {
  const paginas = Math.max(1, Math.ceil(ordem.length / size));
  const pag = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const inicio = (pag - 1) * size;
  return { pagina: pag, paginas, chavesDaPagina: ordem.slice(inicio, inicio + size) };
}

/* ── Apagar ─────────────────────────────────────────────────────────────────
   Ação DESTRUTIVA e IRREVERSÍVEL. Por isso o fluxo inteiro mora aqui, com a
   confirmação recebida por parâmetro: assim o teste consegue afirmar que sem
   um "sim" nenhuma linha sai do banco — a garantia não pode depender de alguém
   lembrar de chamar `confirm` antes. */

export type LoteApagavel = {
  batchId: string | null;
  createdAt: string;
  items: { dbId?: string }[];
};

export type DesfechoDeApagar =
  | { desfecho: 'cancelado' }
  | { desfecho: 'sem-ids' }
  | { desfecho: 'apagado'; apagadas: number }
  | { desfecho: 'falhou'; detalhe: unknown };

/** Todas as linhas do lote que existem no banco. Card sem `dbId` nunca foi
 *  salvo — não há o que apagar, e ele não pode travar o resto. */
export function idsDoLote(lote: LoteApagavel): string[] {
  return lote.items.map((i) => i.dbId).filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * O texto do aviso. Nomeia a DATA do lote e QUANTOS cards vão embora: "apagar
 * este grupo?" não diz o que se perde, e este clique não tem volta.
 */
export function mensagemDeConfirmacao(lote: LoteApagavel, formatarData: (iso: string) => string): string {
  const n = lote.items.length;
  return (
    `Apagar as notícias de ${formatarData(lote.createdAt)}?\n\n` +
    `${n} card${n === 1 ? '' : 's'} ${n === 1 ? 'será apagado' : 'serão apagados'}. ` +
    'Esta ação não pode ser desfeita.'
  );
}

type SupabaseDelete = {
  from(tabela: string): {
    delete(): { in(coluna: string, valores: string[]): PromiseLike<{ error: unknown }> };
  };
};

/**
 * Confirma, apaga TODAS as linhas do lote de uma vez e devolve o desfecho.
 *
 * Devolve em vez de avisar: quem chama é que sabe se toasta, recarrega ou
 * volta de página. O que não pode é falhar em silêncio — daí `falhou` carregar
 * o detalhe, e a exceção de rede virar o mesmo desfecho em vez de estourar.
 */
export async function apagarLoteDeNoticias({
  lote,
  supabase,
  confirmar,
  formatarData = (iso) => iso,
}: {
  lote: LoteApagavel;
  supabase: SupabaseDelete;
  confirmar: (mensagem: string) => boolean;
  formatarData?: (iso: string) => string;
}): Promise<DesfechoDeApagar> {
  if (!confirmar(mensagemDeConfirmacao(lote, formatarData))) return { desfecho: 'cancelado' };

  const ids = idsDoLote(lote);
  // 🔴 Sem alvo não se manda DELETE: um delete sem `.in()` apagaria tudo que o
  // RLS deixasse passar.
  if (ids.length === 0) return { desfecho: 'sem-ids' };

  try {
    const { error } = await supabase.from('news_entries').delete().in('id', ids);
    if (error) return { desfecho: 'falhou', detalhe: error };
    return { desfecho: 'apagado', apagadas: ids.length };
  } catch (err) {
    return { desfecho: 'falhou', detalhe: err };
  }
}
