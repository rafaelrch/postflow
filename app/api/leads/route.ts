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
 * concluir: captura interesse para remarketing e registra o e-mail do comprador
 * (a AbacatePay não devolve e-mail no checkout — ver supabase/leads-schema.sql).
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
    const { error } = await admin.from('leads').upsert(
      {
        name: form.name,
        email: form.email,
        phone: form.phone,
        plan_interval: interval,
      },
      { onConflict: 'email' },
    );

    if (error) {
      // Log SEM PII: só code/message do Postgres, nunca `details`/`hint` (que
      // ecoam o valor da linha, ex.: "Key (email)=(...)"). Nem os campos do form.
      console.error('[api/leads] falha ao gravar lead:', { code: error.code, message: error.message });
      return NextResponse.json({ error: 'Não foi possível registrar seus dados.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Idem: só a mensagem da exceção, sem despejar objeto que possa conter o form.
    console.error('[api/leads] erro inesperado:', err instanceof Error ? err.message : 'desconhecido');
    return NextResponse.json({ error: 'Erro ao registrar lead.' }, { status: 500 });
  }
}
