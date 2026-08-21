'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronUp, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  DESCRIPTION_MAX,
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
 * ⚠️ COLUNA VAZIA FICA VAZIA. Havia aqui uma frase por coluna ("Nada no backlog
 * ainda…"); o Rafael mandou tirar (21/08). O contador do cabeçalho continua
 * dizendo quantos são, e no Backlog o cartão "Adicionar task" continua sendo o
 * convite — a caixa tracejada de texto era ruído em cima dos dois.
 *
 * Isto vale só para o vazio de SUCESSO. As mensagens de CARREGANDO e de ERRO
 * ficam: quadro vazio por erro de carga diria "não há nada" quando a verdade é
 * "não carregou".
 */

/**
 * O quadro como o servidor mandou — ou as 4 colunas vazias, se ele não mandou
 * nada. Uma função só, usada na montagem E na ressincronização: duas cópias
 * desta linha divergiriam no primeiro ajuste.
 */
function doServidor(colunas: RoadmapColumn[]): RoadmapColumn[] {
  return colunas.length > 0 ? colunas : emptyColumns();
}

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
  const painelRef = useRef<HTMLDivElement>(null);

  /**
   * MESMA função que a rota usa, também para decidir se o primário está
   * habilitado. O botão fica apagado enquanto o TÍTULO não vale — é o que a
   * referência mostra. Descrição não entra nesta conta: ela é opcional, e um
   * "Criar" apagado por causa dela seria um bloqueio sem explicação na tela.
   */
  const check = validateSuggestion({ title, description });
  const tituloInvalido = !check.ok && !!check.fields.title;

  /**
   * ESC fecha e o Tab não sai do diálogo.
   *
   * `aria-modal` só PROMETE isso ao leitor de tela; quem cumpre é este handler.
   * Sem ele, o Tab passeia pelos botões do quadro atrás do overlay — que o mouse
   * não alcança, porque o overlay os cobre.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const painel = painelRef.current;
      if (!painel) return;
      const focaveis = painel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, textarea, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;

      if (e.shiftKey && (ativo === primeiro || !painel.contains(ativo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /** O foco entra no diálogo pelo campo que a pessoa veio preencher. */
  useEffect(() => {
    painelRef.current?.querySelector<HTMLElement>('#roadmap-titulo')?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // A validação COMPLETA continua aqui: o botão habilitado só garante título
    // válido, e a descrição ainda pode estourar o teto ou trazer marcação.
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
        toast.error(await errorMessage(res, 'Não foi possível criar a task.'));
        return;
      }
      toast.success('Task criada! Ela já está no Backlog.');
      onCreated();
    } catch {
      toast.error('Não foi possível criar a task.');
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
        ref={painelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Faixa clara do cabeçalho: seta de voltar, título, X. A seta e o X
            fazem a MESMA coisa — fechar. Não há passo anterior neste fluxo, e
            uma seta que levasse a outro lugar prometeria um que não existe. */}
        <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--paper-2)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Voltar"
            data-testid="voltar-popup"
            className="rounded-md p-1 text-[var(--ink-dim)] hover:bg-black/5 hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 id="criar-task-titulo" className="text-[15px] font-bold text-[var(--ink)]">
            Criar task
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="fechar-popup"
            className="ml-auto rounded-md p-1 text-[var(--ink-dim)] hover:bg-black/5 hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 px-4 py-4">
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
                placeholder="Título da task"
                aria-invalid={!!errors.title}
                className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-[13px] text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
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
              {/* `resize-y` é a alça do canto que a referência mostra: 5 linhas
                  bastam para a maioria, e quem escrever mais estica. */}
              <textarea
                id="roadmap-descricao"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Descrição (opcional)"
                aria-invalid={!!errors.description}
                className="mt-1 w-full resize-y rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-[13px] leading-relaxed text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              />
              {errors.description && (
                <p data-testid="erro-descricao" className="mt-1 text-[11px] text-[var(--danger)]">
                  {errors.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              data-testid="cancelar-task"
              className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-[12px] font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sending || tituloInvalido}
              data-testid="enviar-sugestao"
              className="rounded-lg px-4 py-2 text-[12px] font-semibold shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--ink)]"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              {sending ? 'Criando…' : 'Criar'}
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
  const router = useRouter();
  const [columns, setColumns] = useState<RoadmapColumn[]>(() => doServidor(initialColumns));
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  /**
   * ⚠️ O QUADRO TEM DE SEGUIR O SERVIDOR — não dá para só inicializar o estado
   * com a prop e esquecer.
   *
   * `router.refresh()` re-renderiza o Server Component e MESCLA o payload novo
   * neste componente montado, "without losing unaffected client-side React
   * (e.g. useState)" — está escrito assim na doc do Next 16.2.10, em
   * `03-api-reference/04-functions/use-router.md`. Preservar o `useState` é o
   * comportamento pretendido (é o que salva scroll e input no meio de uma
   * edição), mas para um estado que ESPELHA a prop significa: prop nova,
   * estado velho, tela parada. Foi isso que segurou a task recém-criada fora do
   * Backlog — o refresh disparava e o servidor devolvia o card certo; quem
   * descartava era este componente.
   *
   * O conserto é o padrão do React de ajustar estado durante o render quando a
   * prop muda (guardar a prop anterior e comparar), e não um `useEffect`: o
   * efeito re-renderizaria uma segunda vez, e por um quadro o usuário veria a
   * lista velha depois de o servidor já ter mandado a nova.
   *
   * A comparação é por IDENTIDADE de propósito. Cada refresh desserializa um
   * payload novo, então `initialColumns` é sempre outro array — inclusive
   * quando o conteúdo é igual. Ressincronizar à toa não custa nada; deixar de
   * ressincronizar custa o bug.
   */
  const [quadroDoServidor, setQuadroDoServidor] = useState(initialColumns);
  if (initialColumns !== quadroDoServidor) {
    setQuadroDoServidor(initialColumns);
    // O voto otimista em curso é descartado aqui, e tem de ser: o servidor
    // acabou de dizer qual é a contagem, e ele é a autoridade sobre isso.
    setColumns(doServidor(initialColumns));
  }

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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--ink)]"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
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
        <CreateTaskModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            // A task nasce APROVADA e já pertence ao Backlog — então ela tem de
            // aparecer agora. Quem monta o card é o servidor (posição e
            // contagem de voto vêm de lá): `refresh()` refaz a leitura em vez de
            // o cliente inventar um card que ainda não existe no quadro dele.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
