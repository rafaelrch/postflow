import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const VOTE_LIMIT = 30;
const VOTE_WINDOW_MS = 60_000;

/** UUID v4 tal como o `gen_random_uuid()` do Postgres gera. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/roadmap/vote — vota num card, ou DESFAZ o voto.
 *
 * Alternável por decisão de produto: clicar de novo tira o voto. Por isso a rota
 * é uma só e não um par votar/desvotar — o cliente não precisa saber o estado
 * atual para agir, e dois cliques rápidos não deixam o servidor num estado que o
 * usuário não pediu.
 *
 * ⚠️ A trava do voto único é o UNIQUE (card_id, user_id) no banco, não este
 * código. Aqui há uma corrida real: duas requisições simultâneas podem ler
 * "ainda não votou" e tentar inserir as duas. A segunda leva `23505` do Postgres
 * — e a rota trata isso como SUCESSO idempotente (o voto existe, que é o que o
 * usuário queria), em vez de devolver 500 por uma corrida que não é problema
 * dele.
 *
 * Usa o client da SESSÃO (anon + RLS), não o service_role: a policy já amarra
 * `user_id = auth.uid()` e exige que o card esteja aprovado. Menor privilégio.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const limit = rateLimit(`roadmap-vote:${user.id}:${clientIp(request)}`, {
      limit: VOTE_LIMIT,
      windowMs: VOTE_WINDOW_MS,
    });
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Muitos votos seguidos. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const cardId = (body as { cardId?: unknown })?.cardId;
    if (typeof cardId !== 'string' || !UUID_RE.test(cardId)) {
      return NextResponse.json({ error: '"cardId" deve ser o id de um card.' }, { status: 400 });
    }

    // A policy de select em `roadmap_votes` já restringe ao próprio usuário, mas
    // o filtro explícito fica: a intenção não pode depender só da RLS estar
    // ligada — se alguém afrouxar a policy amanhã, esta consulta continua certa.
    const existing = await supabase
      .from('roadmap_votes')
      .select('id')
      .eq('card_id', cardId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing.error) {
      console.error('[api/roadmap/vote] read_failed');
      return NextResponse.json({ error: 'Não foi possível registrar seu voto.' }, { status: 500 });
    }

    if (existing.data) {
      const { error } = await supabase
        .from('roadmap_votes')
        .delete()
        .eq('card_id', cardId)
        .eq('user_id', user.id);
      if (error) {
        console.error('[api/roadmap/vote] delete_failed');
        return NextResponse.json({ error: 'Não foi possível remover seu voto.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, voted: false });
    }

    const { error } = await supabase
      .from('roadmap_votes')
      .insert({ card_id: cardId, user_id: user.id });

    if (error) {
      // 23505 = unique_violation: perdemos a corrida com outra requisição do
      // mesmo usuário. O voto existe, o desfecho é o pedido. Não é erro.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ ok: true, voted: true });
      }
      // 23503 = foreign_key_violation, e a policy de insert nega card não
      // aprovado: os dois casos são "esse card não está no quadro".
      if ((error as { code?: string }).code === '23503') {
        return NextResponse.json({ error: 'Card não encontrado.' }, { status: 404 });
      }
      console.error('[api/roadmap/vote] insert_failed');
      return NextResponse.json({ error: 'Não foi possível registrar seu voto.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, voted: true });
  } catch {
    console.error('[api/roadmap/vote] unexpected_error');
    return NextResponse.json({ error: 'Erro ao registrar voto.' }, { status: 500 });
  }
}
