'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronUp, Map as MapIcon, Undo2, XCircle } from 'lucide-react';
import {
  ROADMAP_STATUSES,
  ROADMAP_STATUS_LABELS,
  type RoadmapApproval,
  type RoadmapStatus,
} from '@/lib/roadmap';
import type { AdminRoadmapBoard, AdminRoadmapCard } from '@/lib/admin-roadmap';

/**
 * Roadmap no /admin — ver tudo, mover, aprovar e recusar.
 *
 * ── POR QUE BOTÃO/SELECT E NÃO ARRASTAR ─────────────────────────────────────
 * Arrastar é o gesto que se espera de um kanban, e num quadro de 4 colunas ele
 * seria bonito. Mas arrastar acessível não é o `draggable` do HTML: é um padrão
 * completo (pegar com Espaço, mover com as setas, anunciar cada passo por
 * `aria-live`, soltar com Enter, cancelar com ESC) e, sem isso, a única forma de
 * mover um card passa a ser o mouse. Aqui isso é pior do que em outra tela
 * qualquer: mover de coluna é a operação PRINCIPAL desta página e não existe
 * segundo caminho para ela em lugar nenhum do produto. Entre um gesto bonito que
 * exclui e um controle explícito que todo mundo usa, este arquivo escolhe o
 * segundo — um `<select>` nativo de coluna, que já vem com teclado, leitor de
 * tela e toque de graça.
 *
 * ── O ESTADO SEGUE O SERVIDOR ───────────────────────────────────────────────
 * ⚠️ `router.refresh()` mescla o payload novo SEM desmontar este componente e
 * SEM perder `useState` (doc do Next 16.2.10 em
 * `03-api-reference/04-functions/use-router.md`). Um estado que espelha a prop
 * precisa se ressincronizar explicitamente, senão a tela congela na primeira
 * versão que recebeu — foi exatamente o bug do quadro público, e o padrão de
 * ajustar estado durante o render está repetido aqui pelo mesmo motivo.
 */

export type AdminBoardState = 'ready' | 'loading' | 'error';

/** O que cada ação manda para `PATCH /api/roadmap/admin`. */
type Acao =
  | { tipo: 'mover'; status: RoadmapStatus }
  | { tipo: 'aprovacao'; approval: RoadmapApproval };

const APPROVAL_LABEL: Record<RoadmapApproval, string> = {
  pending: 'Pendente',
  approved: 'No quadro',
  rejected: 'Recusado',
};

/** Mensagem útil por status HTTP — 401/403, 404 e 400 dizem coisas diferentes. */
async function mensagemDeErro(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) return 'Sua sessão expirou. Entre de novo para continuar.';
  if (res.status === 403) return 'Esta conta não está na allowlist de administradores.';
  if (res.status === 404) return 'Este card não existe mais. Recarregue a página.';
  return body.error || fallback;
}

// ───────────────────────────────────────────────────────────── Card

function Card({
  card,
  onMover,
  onAprovacao,
  ocupado,
}: {
  card: AdminRoadmapCard;
  onMover: (card: AdminRoadmapCard, status: RoadmapStatus) => void;
  onAprovacao: (card: AdminRoadmapCard, approval: RoadmapApproval) => void;
  ocupado: boolean;
}) {
  const seletorId = `coluna-${card.id}`;

  return (
    <article
      className="admin-roadmap-card"
      data-testid={`admin-card-${card.id}`}
      data-approval={card.approval}
      aria-busy={ocupado ? 'true' : undefined}
    >
      <header>
        <h3>{card.title}</h3>
        {/* A contagem é a informação que decide a ordem do roadmap: fica no
            card, não escondida atrás de um clique. */}
        <span className="admin-roadmap-votes" data-testid={`admin-votos-${card.id}`}>
          <ChevronUp size={13} strokeWidth={2} aria-hidden />
          {card.voteCount}
          <span className="sr-only"> voto(s)</span>
        </span>
      </header>

      {/* O selo é o que impede a pegadinha: card recusado no meio dos outros,
          sem marca, parece um card normal do quadro. */}
      <span
        className="admin-roadmap-pill"
        data-approval={card.approval}
        data-testid={`admin-selo-${card.id}`}
      >
        {APPROVAL_LABEL[card.approval]}
      </span>

      {card.description && <p className="admin-roadmap-desc">{card.description}</p>}

      <footer className="admin-roadmap-actions">
        <label className="admin-roadmap-move" htmlFor={seletorId}>
          <span>Coluna</span>
          <select
            id={seletorId}
            data-testid={`admin-mover-${card.id}`}
            value={card.status}
            disabled={ocupado}
            onChange={(e) => onMover(card, e.target.value as RoadmapStatus)}
          >
            {ROADMAP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ROADMAP_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        {card.approval !== 'approved' && (
          <button
            type="button"
            className="admin-roadmap-btn"
            data-tone="approve"
            data-testid={`admin-aprovar-${card.id}`}
            disabled={ocupado}
            onClick={() => onAprovacao(card, 'approved')}
          >
            {card.approval === 'rejected' ? <Undo2 size={13} aria-hidden /> : <CheckCircle2 size={13} aria-hidden />}
            {card.approval === 'rejected' ? 'Devolver ao quadro' : 'Aprovar'}
          </button>
        )}

        {card.approval !== 'rejected' && (
          <button
            type="button"
            className="admin-roadmap-btn"
            data-tone="reject"
            data-testid={`admin-recusar-${card.id}`}
            disabled={ocupado}
            onClick={() => onAprovacao(card, 'rejected')}
          >
            <XCircle size={13} aria-hidden />
            Recusar
          </button>
        )}
      </footer>
    </article>
  );
}

// ───────────────────────────────────────────────────────────── Quadro

export default function RoadmapAdminClient({
  initialBoard,
  state = 'ready',
}: {
  initialBoard: AdminRoadmapBoard;
  state?: AdminBoardState;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [board, setBoard] = useState<AdminRoadmapBoard>(initialBoard);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Ver o ⚠️ do topo: prop nova, estado velho, tela congelada.
  const [doServidor, setDoServidor] = useState(initialBoard);
  if (initialBoard !== doServidor) {
    setDoServidor(initialBoard);
    setBoard(initialBoard);
  }

  /**
   * Aplica a mudança nos três grupos de uma vez.
   *
   * Recalcular o board inteiro a partir da lista de cards, em vez de mover a
   * linha "na mão" de um grupo para o outro: aprovar tira de `pendentes` E põe
   * na coluna certa, e são duas metades da mesma operação. Duas edições
   * separadas divergem no primeiro caso que alguém esquecer.
   */
  const aplicar = useCallback((cardId: string, patch: Partial<AdminRoadmapCard>) => {
    setBoard((anterior) => {
      const todos = [
        ...anterior.pendentes,
        ...anterior.colunas.flatMap((c) => c.cards),
        ...anterior.recusados,
      ].map((card) => (card.id === cardId ? { ...card, ...patch } : card));

      return {
        pendentes: todos.filter((c) => c.approval === 'pending'),
        colunas: ROADMAP_STATUSES.map((status) => ({
          status,
          label: ROADMAP_STATUS_LABELS[status],
          cards: todos.filter((c) => c.approval === 'approved' && c.status === status),
        })),
        recusados: todos.filter((c) => c.approval === 'rejected'),
      };
    });
  }, []);

  /**
   * Uma ação só, para as três operações — todas são o mesmo PATCH.
   *
   * Otimista com REVERSÃO: o estado anterior do card é capturado ANTES e é ele
   * que volta se a rota recusar. A tela não pode ficar mostrando uma coluna que
   * o banco não tem.
   */
  const executar = useCallback(
    async (card: AdminRoadmapCard, acao: Acao) => {
      if (pendingId) return;

      const antes = { status: card.status, approval: card.approval };
      const patch: Partial<AdminRoadmapCard> =
        acao.tipo === 'mover' ? { status: acao.status } : { approval: acao.approval };

      const descricao =
        acao.tipo === 'mover'
          ? `“${card.title}” foi para ${ROADMAP_STATUS_LABELS[acao.status]}.`
          : acao.approval === 'approved'
            ? `“${card.title}” entrou no quadro público.`
            : `“${card.title}” saiu do quadro. A linha e os votos continuam no banco.`;

      setPendingId(card.id);
      setErro(null);
      setAviso(null);
      aplicar(card.id, patch);

      try {
        const res = await fetch('/api/roadmap/admin', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId: card.id,
            ...(acao.tipo === 'mover' ? { status: acao.status } : { approval: acao.approval }),
          }),
        });

        if (!res.ok) {
          aplicar(card.id, antes);
          setErro(await mensagemDeErro(res, 'Não foi possível atualizar o card.'));
          return;
        }

        setAviso(descricao);
        // O quadro é lido no servidor: sem revalidar, a próxima navegação
        // traria o estado de antes desta ação.
        startTransition(() => router.refresh());
      } catch {
        aplicar(card.id, antes);
        setErro('Não foi possível atualizar o card.');
      } finally {
        setPendingId(null);
      }
    },
    [aplicar, pendingId, router],
  );

  const mover = useCallback(
    (card: AdminRoadmapCard, status: RoadmapStatus) => {
      if (status === card.status) return;
      void executar(card, { tipo: 'mover', status });
    },
    [executar],
  );

  const decidir = useCallback(
    (card: AdminRoadmapCard, approval: RoadmapApproval) => {
      void executar(card, { tipo: 'aprovacao', approval });
    },
    [executar],
  );

  if (state === 'loading') {
    return (
      <div className="admin-roadmap-skeleton" data-testid="admin-roadmap-carregando" aria-busy="true">
        <span className="sr-only">Carregando o roadmap…</span>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden />
        ))}
      </div>
    );
  }

  /**
   * Erro NÃO pode virar quadro vazio: "não há nada no roadmap" e "o roadmap não
   * carregou" levam a decisões opostas. Mesma regra da tela pública.
   */
  if (state === 'error') {
    return (
      <div className="admin-state-card admin-state-card--danger" data-testid="admin-roadmap-erro" role="alert">
        <h2>O roadmap não carregou</h2>
        <p>
          Isto é falha de leitura, não quadro vazio — nenhum card foi perdido. Recarregue a página;
          se persistir, o log do servidor traz o motivo.
        </p>
      </div>
    );
  }

  const total =
    board.pendentes.length +
    board.colunas.reduce((soma, coluna) => soma + coluna.cards.length, 0) +
    board.recusados.length;

  return (
    <div className="admin-roadmap">
      {/* `role=status`/`role=alert`: o resultado da ação também é anunciado a
          quem não está olhando para o card que mudou. */}
      {erro && (
        <p className="admin-roadmap-feedback" data-tone="erro" role="alert" data-testid="admin-roadmap-acao-erro">
          {erro}
        </p>
      )}
      {aviso && !erro && (
        <p className="admin-roadmap-feedback" data-tone="ok" role="status" data-testid="admin-roadmap-acao-ok">
          {aviso}
        </p>
      )}

      {total === 0 && (
        <div className="admin-empty-state" data-testid="admin-roadmap-vazio">
          <span className="admin-empty-icon"><MapIcon size={18} /></span>
          <h2>Nenhum card no roadmap</h2>
          <p className="admin-empty-summary">
            Ninguém sugeriu nada ainda. As tasks que chegarem pelo quadro público aparecem aqui —
            inclusive as que você recusar.
          </p>
        </div>
      )}

      {/* PENDENTES PRIMEIRO: são os invisíveis, e é o que se vem resolver. */}
      {board.pendentes.length > 0 && (
        <section className="admin-metric-section" aria-labelledby="roadmap-pendentes">
          <div className="admin-group-heading">
            <div>
              <h2 id="roadmap-pendentes">Aguardando decisão</h2>
              <p>Invisíveis no quadro público até você aprovar — inclusive as anteriores à regra nova</p>
            </div>
            <span className="admin-scope-badge">{board.pendentes.length}</span>
          </div>
          <div className="admin-roadmap-list" data-testid="admin-roadmap-pendentes">
            {board.pendentes.map((card) => (
              <Card
                key={card.id}
                card={card}
                onMover={mover}
                onAprovacao={decidir}
                ocupado={pendingId === card.id}
              />
            ))}
          </div>
        </section>
      )}

      <section className="admin-metric-section" aria-labelledby="roadmap-quadro">
        <div className="admin-group-heading">
          <div>
            <h2 id="roadmap-quadro">No quadro público</h2>
            <p>As 4 colunas que o cliente vê · mover de coluna vale na hora</p>
          </div>
          <span className="admin-scope-badge">
            {board.colunas.reduce((soma, coluna) => soma + coluna.cards.length, 0)}
          </span>
        </div>

        <div className="admin-roadmap-columns">
          {board.colunas.map((coluna) => (
            <section
              key={coluna.status}
              className="admin-roadmap-column"
              aria-label={coluna.label}
              data-testid={`admin-coluna-${coluna.status}`}
            >
              <header>
                <h3>{coluna.label}</h3>
                <span>{coluna.cards.length}</span>
              </header>
              {coluna.cards.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  onMover={mover}
                  onAprovacao={decidir}
                  ocupado={pendingId === card.id}
                />
              ))}
            </section>
          ))}
        </div>
      </section>

      {board.recusados.length > 0 && (
        <section className="admin-metric-section" aria-labelledby="roadmap-recusados">
          <div className="admin-group-heading">
            <div>
              <h2 id="roadmap-recusados">Recusados</h2>
              <p>Fora do quadro, com linha e votos preservados — dá para devolver quando quiser</p>
            </div>
            <span className="admin-scope-badge">{board.recusados.length}</span>
          </div>
          <div className="admin-roadmap-list" data-testid="admin-roadmap-recusados">
            {board.recusados.map((card) => (
              <Card
                key={card.id}
                card={card}
                onMover={mover}
                onAprovacao={decidir}
                ocupado={pendingId === card.id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
