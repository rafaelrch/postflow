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
 * A sugestão NASCE PENDENTE e não aparece no quadro público até o admin
 * aprovar: roadmap com escrita aberta é mural de spam.
 *
 * ⚠️ Usa o client da SESSÃO (anon + RLS), não o service_role. Aqui isso não é
 * descuido, é o desenho: a policy `roadmap_cards_suggest` já exige
 * `author_id = auth.uid()`, `approval = 'pending'` e `status = 'backlog'`. Com
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
      approval: 'pending',
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

    // 201 sem devolver o card: ele ainda não é público. Devolver o id daria ao
    // cliente uma referência a uma linha que ele não consegue ler.
    return NextResponse.json(
      { ok: true, message: 'Sugestão enviada! Ela aparece no quadro depois da nossa revisão.' },
      { status: 201 },
    );
  } catch {
    console.error('[api/roadmap/suggestions] unexpected_error');
    return NextResponse.json({ error: 'Erro ao registrar sugestão.' }, { status: 500 });
  }
}
