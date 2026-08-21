import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { validateSuggestion } from '@/lib/roadmap';

export const runtime = 'nodejs';

/**
 * Teto baixo de propósito: sugerir é um ato raro e pensado. 5 por 10 minutos
 * corta o despejo automatizado sem incomodar quem tem duas ideias seguidas.
 */
const SUGGESTION_LIMIT = 5;
const SUGGESTION_WINDOW_MS = 10 * 60_000;

/**
 * POST /api/roadmap/suggestions — o usuário propõe uma ideia para o roadmap.
 *
 * A sugestão NASCE APROVADA e aparece no Backlog na hora (decisão do Rafael,
 * 21/08 — ver `supabase/migrations/20260821170000_roadmap_backlog_sem_aprovacao.sql`,
 * que substitui a regra da migration anterior). O que segura o mural de spam
 * agora são duas outras coisas, não a fila de moderação: o rate limit acima e o
 * 'rejected' do admin, que tira o card do quadro depois sem apagar a linha.
 *
 * O usuário só consegue pôr card no BACKLOG. As outras 3 colunas continuam
 * fechadas: `roadmap_cards` não tem policy de UPDATE, então mover de coluna é
 * impossível pelo caminho do cliente, com ou sem esta rota.
 *
 * ⚠️ Usa o client da SESSÃO (anon + RLS), não o service_role. Aqui isso não é
 * descuido, é o desenho: a policy `roadmap_cards_suggest` já exige
 * `author_id = auth.uid()`, `approval = 'approved'` e `status = 'backlog'`. Com
 * service_role, o banco aceitaria qualquer coisa que a rota mandasse e a
 * garantia passaria a depender só deste arquivo estar certo. Menor privilégio: o
 * banco continua sendo a segunda trava.
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

    // Chave por USUÁRIO e por IP: só o IP puniria escritório inteiro atrás de um
    // NAT; só o usuário deixaria criar contas para multiplicar o teto.
    const limit = rateLimit(`roadmap-suggestion:${user.id}:${clientIp(request)}`, {
      limit: SUGGESTION_LIMIT,
      windowMs: SUGGESTION_WINDOW_MS,
    });
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Muitas sugestões seguidas. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const validation = validateSuggestion(input);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, fields: validation.fields },
        { status: 400 },
      );
    }

    // A autoria vem da SESSÃO, nunca do corpo: um `authorId` enviado pelo
    // cliente é ignorado aqui e recusado pela policy se alguém tentar por fora.
    const { error } = await supabase.from('roadmap_cards').insert({
      title: validation.value.title,
      description: validation.value.description,
      author_id: user.id,
      approval: 'approved',
      status: 'backlog',
      position: 0,
    });

    if (error) {
      // A mensagem do Postgres carrega nome de tabela e detalhe de query: fica
      // no log do servidor, não na resposta.
      console.error('[api/roadmap/suggestions] insert_failed');
      return NextResponse.json(
        { error: 'Não foi possível registrar sua sugestão.' },
        { status: 500 },
      );
    }

    // 201 sem devolver o card: a tela recarrega o quadro do servidor, que é a
    // autoridade sobre posição e contagem de voto. Devolver o card aqui criaria
    // uma segunda montagem do mesmo dado, com outro caminho para divergir.
    return NextResponse.json(
      { ok: true, message: 'Task criada! Ela já está no Backlog.' },
      { status: 201 },
    );
  } catch {
    console.error('[api/roadmap/suggestions] unexpected_error');
    return NextResponse.json({ error: 'Erro ao registrar sugestão.' }, { status: 500 });
  }
}
