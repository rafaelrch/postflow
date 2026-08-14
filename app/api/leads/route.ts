import { NextResponse, type NextRequest } from 'next/server';
// Import relativo (não alias): mesmo motivo das outras rotas — o vitest resolve
// o mock a partir do caminho do arquivo de teste, não do alias '@/'.
import { validateLeadForm, hasErrors, type LeadInterval } from '../../../lib/lead-capture';
import { createAdminSupabaseClient } from '../../../lib/supabase-admin';
import { rateLimit, clientIp } from '../../../lib/rate-limit';

export const runtime = 'nodejs';

// Rota pública de escrita: teto de requisições por IP por minuto.
const LEADS_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

/**
 * Grava um lead (nome/e-mail/telefone + plano escolhido) no submit do popup de
 * preços, ANTES do checkout. É o passo que não pode depender de a compra se
 * concluir: captura interesse para remarketing e gera o id que vira o
 * `externalReference` do checkout do Asaas — a chave pela qual o webhook liga o
 * pagamento de volta a quem comprou (ver supabase/leads-schema.sql).
 *
 * Insere via service role de propósito: `leads` tem RLS sem policy (deny para o
 * client), então dados de contato de terceiros nunca ficam legíveis no browser.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`leads:${ip}`, { limit: LEADS_RATE_LIMIT, windowMs: RATE_WINDOW_MS });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      phone?: string;
      interval?: LeadInterval;
    };

    const form = {
      name: (body.name ?? '').trim(),
      email: (body.email ?? '').trim().toLowerCase(),
      phone: (body.phone ?? '').trim(),
    };
    const interval: LeadInterval = body.interval === 'year' ? 'year' : 'month';

    // Revalida no servidor: o client já validou, mas a rota é pública e não pode
    // confiar na entrada.
    const errors = validateLeadForm(form);
    if (hasErrors(errors)) {
      return NextResponse.json({ error: 'Dados inválidos.', fields: errors }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    // Upsert por e-mail: reenvio do mesmo endereço atualiza nome/telefone/plano
    // (+ updated_at via trigger) em vez de acumular duplicata. Ver leads-schema.sql.
    //
    // O `select('id')` não é enfeite: o id do lead é o externalReference do
    // checkout do Asaas, ou seja, a chave que liga o pagamento de volta a quem
    // comprou. Sem devolvê-lo aqui, o passo seguinte (POST /api/asaas/checkout)
    // não tem o que mandar. Com o upsert por e-mail, reenviar o mesmo endereço
    // devolve o MESMO id — o lead não se multiplica.
    const { data, error } = await admin
      .from('leads')
      .upsert(
        {
          name: form.name,
          email: form.email,
          phone: form.phone,
          plan_interval: interval,
        },
        { onConflict: 'email' },
      )
      .select('id')
      .single();

    if (error || !data?.id) {
      // Nenhum campo do erro é confiável para log: até `code` pode conter PII
      // se uma dependência ou mock devolver um objeto fora do contrato esperado.
      console.error('[api/leads] database_write_failed');
      return NextResponse.json({ error: 'Não foi possível registrar seus dados.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, leadId: data.id as string });
  } catch {
    // Exceções podem incorporar payloads na própria mensagem; registre só o
    // identificador estável do evento, sem o objeto ou texto arbitrário.
    console.error('[api/leads] unexpected_error');
    return NextResponse.json({ error: 'Erro ao registrar lead.' }, { status: 500 });
  }
}
