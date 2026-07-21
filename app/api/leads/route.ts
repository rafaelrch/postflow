import { NextResponse, type NextRequest } from 'next/server';
// Import relativo (não alias): mesmo motivo das outras rotas — o vitest resolve
// o mock a partir do caminho do arquivo de teste, não do alias '@/'.
import { validateLeadForm, hasErrors, type LeadInterval } from '../../../lib/lead-capture';
import { createAdminSupabaseClient } from '../../../lib/supabase-admin';

export const runtime = 'nodejs';

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
    const { error } = await admin.from('leads').insert({
      name: form.name,
      email: form.email,
      phone: form.phone,
      plan_interval: interval,
    });

    if (error) {
      console.error('[api/leads] erro ao inserir lead:', error);
      return NextResponse.json({ error: 'Não foi possível registrar seus dados.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/leads]', err);
    return NextResponse.json({ error: 'Erro ao registrar lead.' }, { status: 500 });
  }
}
