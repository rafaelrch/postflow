'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronUp, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  ROADMAP_STATUSES,
  ROADMAP_STATUS_LABELS,
  TITLE_MAX,
  TITLE_MIN,
  validateSuggestion,
  type RoadmapCard,
  type RoadmapColumn,
  type RoadmapStatus,
} from '@/lib/roadmap';

/**
 * Roadmap público — a tela.
 *
 * SÓ VOTOS nesta entrega (decisão do Rafael, 21/08). Não há contador de
 * comentário, nem zerado: um ícone de comentário que não leva a lugar nenhum
 * promete uma função que não existe.
 *
 * NÃO há arrastar card entre colunas, de propósito. Mover é ato de ADMIN e tem
 * rota própria (`PATCH /api/roadmap/admin`); um card que se arrasta diria ao
 * usuário que ele pode decidir a coluna — e o servidor recusaria depois.
 */

/**
 * Os três desfechos do quadro.
 *
 * ⚠️ `loading` NÃO é servido por um `app/(app)/roadmap/loading.tsx`, e não pode
 * ser. Esta página é um Server Component que faz I/O de rede (Supabase), e em
 * Next 16.2.10 um `loading.tsx` põe isso sob um boundary de Suspense que NUNCA
 * resolve no cliente: o HTML chega, fica escondido na área de staging e o
 * usuário olha o esqueleto para sempre. Foi o que matou /dashboard, /agenda e
 * /conta — ver `docs/bug-loading-fetch-next16.md` e `tests/loading-rotas.test.tsx`,
 * que quebra se alguém criar o arquivo. (Eu criei, o teste pegou, apaguei.)
 *
 * O feedback de navegação do produto é o `NavPending` da barra lateral. Este
 * estado continua existindo porque o quadro é apresentacional: quem o montar
 * precisa poder dizer "ainda não sei" sem desenhar 4 colunas vazias, que é uma
 * mentira diferente — "não há nada" em vez de "não carregou".
 */
export type BoardState = 'ready' | 'loading' | 'error';

/** Cor da barra vertical de cada coluna. Tokens que já existem no tema. */
const COLUMN_ACCENT: Record<RoadmapStatus, string> = {
  backlog: 'var(--ink-muted)',
  faremos: 'var(--warn)',
  cozinhando: 'var(--accent)',
  pronto: 'var(--success)',
};

/**
 * Frase de coluna vazia, uma por coluna.
 *
 * "0 itens" é um número, não uma informação: não diz se aquilo é normal, nem o
 * que aconteceria para mudar. Cada coluna vazia significa uma coisa diferente —
 * "Pronto" vazio é começo de projeto, "Backlog" vazio é convite a sugerir.
 */
const EMPTY_COPY: Record<RoadmapStatus, string> = {
  backlog: 'Nada no backlog ainda. Sua sugestão pode ser a primeira.',
  faremos: 'Nada decidido para os próximos ciclos por enquanto.',
  cozinhando: 'Nada em produção neste momento.',
  pronto: 'Assim que a primeira entrega sair, ela aparece aqui.',
};

/** As 4 colunas vazias — usado pelo estado de carregando e pelo de erro. */
export function emptyColumns(): RoadmapColumn[] {
  return ROADMAP_STATUSES.map((status) => ({
    status,
    label: ROADMAP_STATUS_LABELS[status],
    cards: [],
  }));
}

/** Mensagem útil por status HTTP — 401, 429 e 400 dizem coisas diferentes. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
  if (res.status === 401) return 'Sua sessão expirou. Entre de novo para continuar.';
  if (res.status === 429) return 'Você fez isso muitas vezes seguidas. Tente de novo em instantes.';
  if (res.status === 400) {
    const campo = body.fields ? Object.values(body.fields)[0] : undefined;
    return campo || body.error || fallback;
  }
  return body.error || fallback;
}

// ───────────────────────────────────────────────────────────── Card

function VoteButton({
  card,
  onToggle,
  disabled,
}: {
  card: RoadmapCard;
  onToggle: (card: RoadmapCard) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(card)}
      disabled={disabled}
      // `aria-pressed` é o que comunica "votado" a quem usa leitor de tela — a
      // cor sozinha não diz nada. Reflete o hasVoted que veio do servidor.
      aria-pressed={card.hasVoted}
      aria-label={`Votar em ${card.title}`}
      data-testid={`vote-${card.id}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--accent)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        card.hasVoted
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
          : 'border-[var(--line-strong)] bg-[var(--paper)] text-[var(--ink-dim)] hover:border-[var(--ink)] hover:text-[var(--ink)]',
      )}
    >
      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      <span data-testid={`vote-count-${card.id}`} className="tabular-nums">
        {card.voteCount}
      </span>
    </button>
  );
}

function Card({
  card,
  onToggle,
  pending,
}: {
  card: RoadmapCard;
  onToggle: (card: RoadmapCard) => void;
  pending: boolean;
}) {
  return (
    <article
      data-testid={`card-${card.id}`}
      className="rounded-xl border border-[var(--line)] bg-white p-3 shadow-sm"
    >
      <h3 className="text-[13px] font-bold leading-snug text-[var(--ink)]">{card.title}</h3>
      {card.description && (
        <p
          data-testid={`card-desc-${card.id}`}
          className="mt-1 text-[12px] leading-relaxed text-[var(--ink-dim)]"
          /* Truncar em 3 linhas com reticências. Inline e não classe utilitária:
             o corte é regra de layout deste card e não pode depender de um
             plugin do Tailwind estar ligado. */
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {card.description}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <VoteButton card={card} onToggle={onToggle} disabled={pending} />
      </div>
    </article>
  );
}

// ───────────────────────────────────────────────────────────── Coluna

function Column({
  column,
  state,
  onToggle,
  pendingId,
  children,
}: {
  column: RoadmapColumn;
  state: BoardState;
  onToggle: (card: RoadmapCard) => void;
  pendingId: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section
      data-testid={`column-${column.status}`}
      aria-label={column.label}
      /* `min-w` + o `overflow-x` do pai: em tela estreita o quadro ROLA na
         horizontal em vez de espremer as 4 colunas até o card ficar ilegível. */
      className="flex w-[280px] min-w-[280px] shrink-0 flex-col rounded-xl bg-[var(--paper-2)] p-3"
    >
      <header className="mb-3 flex items-center gap-2">
        <span
          aria-hidden
          data-testid={`column-accent-${column.status}`}
          className="h-4 w-1 rounded-full"
          style={{ background: COLUMN_ACCENT[column.status] }}
        />
        <h2 className="text-[13px] font-bold text-[var(--ink)]">{column.label}</h2>
        {state === 'ready' && (
          <span className="ml-auto text-[11px] tabular-nums text-[var(--ink-muted)]">
            {column.cards.length}
          </span>
        )}
      </header>

      {/* Cada coluna rola sozinha na vertical. */}
      <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        {children}

        {state === 'loading' && (
          <div data-testid={`column-loading-${column.status}`} aria-busy="true">
            <span className="sr-only">Carregando…</span>
            {[0, 1].map((i) => (
              <div
                key={i}
                aria-hidden
                className="mb-2 h-20 animate-pulse rounded-xl border border-[var(--line)] bg-white/60"
              />
            ))}
          </div>
        )}

        {state === 'error' && (
          <p
            data-testid={`column-error-${column.status}`}
            className="rounded-lg border border-dashed border-[var(--line-strong)] p-3 text-[12px] text-[var(--ink-dim)]"
          >
            Não foi possível carregar esta coluna. Atualize a página para tentar de novo.
          </p>
        )}

        {state === 'ready' &&
          column.cards.map((card) => (
            <Card key={card.id} card={card} onToggle={onToggle} pending={pendingId === card.id} />
          ))}

        {state === 'ready' && column.cards.length === 0 && (
          <p
            data-testid={`column-empty-${column.status}`}
            className="rounded-lg border border-dashed border-[var(--line-strong)] p-3 text-[12px] text-[var(--ink-dim)]"
          >
            {EMPTY_COPY[column.status]}
          </p>
        )}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────── Popup

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // MESMA função que a rota usa (`lib/roadmap.validateSuggestion`), não uma
    // segunda cópia das regras. Duas validações escritas à mão divergem no
    // primeiro ajuste de limite, e aí o usuário passa no cliente e leva 400.
    const check = validateSuggestion({ title, description });
    if (!check.ok) {
      setErrors(check.fields);
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/roadmap/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check.value),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res, 'Não foi possível enviar sua sugestão.'));
        return;
      }
      toast.success('Sugestão enviada! Ela entra no quadro depois da revisão.');
      onCreated();
    } catch {
      toast.error('Não foi possível enviar sua sugestão.');
    } finally {
      setSending(false);
    }
  }

  const tituloLen = title.trim().length;
  const descLen = description.trim().length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="criar-task-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-[var(--paper)] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 id="criar-task-titulo" className="text-[15px] font-bold text-[var(--ink)]">
            Sugerir uma ideia
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-[var(--ink-dim)] hover:bg-black/5 hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/*
          O aviso vem ANTES dos campos, não depois de enviar. Quem manda uma
          sugestão e não a encontra no Backlog conclui que o envio falhou e manda
          de novo — é assim que a fila de moderação vira fila de duplicatas.
        */}
        <p
          data-testid="aviso-aprovacao"
          className="mt-3 rounded-lg border border-[var(--line-strong)] bg-[var(--paper-2)] p-2.5 text-[12px] text-[var(--ink-dim)]"
        >
          Sua sugestão passa por aprovação antes de aparecer no quadro — ela não entra no Backlog na hora.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="roadmap-titulo" className="text-[12px] font-semibold text-[var(--ink)]">
                Título
              </label>
              <span
                data-testid="contador-titulo"
                className={cn(
                  'text-[11px] tabular-nums',
                  tituloLen > TITLE_MAX ? 'font-semibold text-[var(--danger)]' : 'text-[var(--ink-muted)]',
                )}
              >
                {tituloLen}/{TITLE_MAX}
              </span>
            </div>
            <input
              id="roadmap-titulo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Exportar o carrossel em PDF"
              aria-invalid={!!errors.title}
              className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-[13px] text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            {errors.title && (
              <p data-testid="erro-titulo" className="mt-1 text-[11px] text-[var(--danger)]">
                {errors.title}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="roadmap-descricao" className="text-[12px] font-semibold text-[var(--ink)]">
                Descrição
              </label>
              <span
                data-testid="contador-descricao"
                className={cn(
                  'text-[11px] tabular-nums',
                  descLen > DESCRIPTION_MAX ? 'font-semibold text-[var(--danger)]' : 'text-[var(--ink-muted)]',
                )}
              >
                {descLen}/{DESCRIPTION_MAX}
              </span>
            </div>
            <textarea
              id="roadmap-descricao"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder={`Conte o que você faria com isso. Mínimo de ${DESCRIPTION_MIN} caracteres.`}
              aria-invalid={!!errors.description}
              className="mt-1 w-full resize-y rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-[13px] leading-relaxed text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            {errors.description && (
              <p data-testid="erro-descricao" className="mt-1 text-[11px] text-[var(--danger)]">
                {errors.description}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-[12px] font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sending}
              data-testid="enviar-sugestao"
              className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition-opacity disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--success)]"
              style={{ background: 'var(--success)' }}
            >
              {sending ? 'Enviando…' : 'Enviar sugestão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Quadro

export default function RoadmapClient({
  initialColumns,
  state = 'ready',
  isAuthenticated = true,
}: {
  initialColumns: RoadmapColumn[];
  state?: BoardState;
  isAuthenticated?: boolean;
}) {
  const [columns, setColumns] = useState<RoadmapColumn[]>(
    initialColumns.length > 0 ? initialColumns : emptyColumns(),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  /** Aplica um patch a UM card, sem mexer no resto do quadro. */
  const patchCard = useCallback((cardId: string, patch: Partial<RoadmapCard>) => {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        cards: col.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
      })),
    );
  }, []);

  /**
   * Voto otimista: o número muda na hora e VOLTA se a rota recusar.
   *
   * O estado anterior é capturado ANTES do patch, e é ele que o catch restaura —
   * reverter para "count - 1" seria errado se outra coisa tivesse mexido no card
   * nesse intervalo.
   */
  const toggleVote = useCallback(
    async (card: RoadmapCard) => {
      if (pendingId) return;
      if (!isAuthenticated) {
        toast.error('Entre na sua conta para votar.');
        return;
      }

      const antes = { hasVoted: card.hasVoted, voteCount: card.voteCount };
      const votando = !card.hasVoted;

      setPendingId(card.id);
      patchCard(card.id, {
        hasVoted: votando,
        voteCount: Math.max(0, card.voteCount + (votando ? 1 : -1)),
      });

      try {
        const res = await fetch('/api/roadmap/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: card.id }),
        });
        if (!res.ok) {
          patchCard(card.id, antes);
          toast.error(await errorMessage(res, 'Não foi possível registrar seu voto.'));
          return;
        }
        // O servidor é a autoridade sobre o estado do voto: uma corrida (dois
        // cliques, duas abas) pode terminar diferente do palpite otimista.
        const body = (await res.json().catch(() => ({}))) as { voted?: boolean };
        if (typeof body.voted === 'boolean' && body.voted !== votando) {
          patchCard(card.id, {
            hasVoted: body.voted,
            voteCount: Math.max(0, antes.voteCount + (body.voted ? 1 : 0) - (antes.hasVoted ? 1 : 0)),
          });
        }
      } catch {
        patchCard(card.id, antes);
        toast.error('Não foi possível registrar seu voto.');
      } finally {
        setPendingId(null);
      }
    },
    [isAuthenticated, patchCard, pendingId],
  );

  const colunas = useMemo(
    () => (state === 'ready' ? columns : emptyColumns()),
    [columns, state],
  );

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--ink)]">Roadmap</h1>
          <p className="mt-0.5 text-[12px] text-[var(--ink-dim)]">
            O que vem por aí. Vote no que você quer ver primeiro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          data-testid="criar-task"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--success)]"
          style={{ background: 'var(--success)' }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Criar task
        </button>
      </div>

      {/* Rolagem horizontal em tela estreita — ver o comentário na `Column`. */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {colunas.map((column, i) => (
          <Column
            key={column.status}
            column={column}
            state={state}
            onToggle={toggleVote}
            pendingId={pendingId}
          >
            {/* O cartão de adicionar mora no topo da PRIMEIRA coluna e faz o
                mesmo que o botão do cabeçalho — é o alvo que a pessoa já está
                olhando quando decide que falta alguma coisa no Backlog. */}
            {i === 0 && state === 'ready' && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                data-testid="adicionar-task-card"
                className="mb-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--line-strong)] bg-white/50 px-3 py-3 text-[12px] font-medium text-[var(--ink-dim)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Adicionar task
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </Column>
        ))}
      </div>

      {modalOpen && (
        <CreateTaskModal onClose={() => setModalOpen(false)} onCreated={() => setModalOpen(false)} />
      )}
    </div>
  );
}
