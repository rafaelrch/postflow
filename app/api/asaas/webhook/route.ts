import { NextResponse, type NextRequest } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
// Imports relativos (não alias) pelo mesmo motivo das outras rotas: manter os
// módulos mockáveis a partir do arquivo de teste.
import {
  allowanceFor,
  buildSubscriptionPatch,
  extractContext,
  verifyAccessToken,
  withResolvedLead,
  type CurrentSubscription,
} from '../../../../lib/asaas-webhook';
import { getCustomer } from '../../../../lib/asaas/customers';

export const runtime = 'nodejs';

/**
 * Webhook do Asaas.
 *
 * ── POR QUE ESTA ROTA QUASE NUNCA DEVOLVE ERRO ──────────────────────────────
 * O Asaas considera entregue só o que responde 2xx. Falha consecutiva penaliza
 * a fila e, na 15ª, INTERROMPE a fila inteira da conta — não só deste evento:
 * de TODOS os pagamentos. Eventos pendentes ficam disponíveis por 14 dias e
 * depois somem. Ou seja, uma exceção não tratada aqui pode derrubar o
 * recebimento de pagamentos do produto inteiro e o estrago é silencioso.
 *
 * Por isso a regra é: erro de REGRA DE NEGÓCIO vira log + 200. O evento já está
 * persistido com processed_at null, que é o rastro para reprocessar depois.
 *
 * ÚNICAS exceções, ambas deliberadas:
 *   • 401 quando o token não confere — uma chamada não autenticada não pode ser
 *     contabilizada como entregue;
 *   • 500 quando ASAAS_WEBHOOK_TOKEN não está configurada — ambiente quebrado
 *     deve falhar ruidosamente, nunca aceitar tudo.
 *
 * ── FLUXO ───────────────────────────────────────────────────────────────────
 * O produto é pagamento-primeiro: quando PAYMENT_CONFIRMED chega, a CONTA AINDA
 * NÃO EXISTE. A assinatura é gravada com user_id NULL e o cadastro a reivindica
 * depois, casando por lower(email) — daí a insistência em gravar o e-mail certo.
 */
export async function POST(req: NextRequest) {
  // 1. Autenticação. O Asaas não assina o corpo; este token é a única barreira.
  const check = verifyAccessToken(req.headers.get('asaas-access-token'));
  if (check === 'not_configured') {
    console.error('[asaas/webhook] missing_ASAAS_WEBHOOK_TOKEN');
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 500 });
  }
  if (check === 'unauthorized') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // 2. Parse tolerante. Corpo ilegível não é reentregável com sucesso nenhum,
  // então 400 aqui é honesto — e não conta como falha de processamento nossa.
  let payload: unknown;
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const ctx = extractContext(payload);
  const admin = createAdminSupabaseClient();

  // 3. IDEMPOTÊNCIA — registra ANTES de processar.
  //
  // A doc do Asaas recomenda o `id` do evento como chave única. Gravar antes
  // (e não depois) é o que dá idempotência de verdade: se a mesma entrega
  // chegar duas vezes em paralelo, a segunda colide na PK e sai sem reprocessar.
  // Gravar depois deixaria a janela entre processar e registrar aberta.
  //
  // Sem `id` no payload não há como deduplicar. Processa mesmo assim (o upsert
  // por id da assinatura é idempotente) e loga — melhor processar duas vezes
  // um upsert idempotente do que ignorar um pagamento.
  if (ctx.eventId) {
    const { error: insertErr } = await admin.from('payment_webhook_events').insert({
      event_id: ctx.eventId,
      event_type: ctx.event,
      payload: payload as Record<string, unknown>,
      // processed_at fica NULL de propósito: só é preenchido no fim. Uma linha
      // com processed_at null é um evento que morreu no meio do processamento —
      // é o diagnóstico para saber o que reprocessar.
    });

    if (insertErr) {
      // 23505 = PK duplicada = já recebemos este evento. Responde 2xx e sai.
      if (insertErr.code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      // Falha de banco no registro: não dá para garantir idempotência, então
      // não processa. 200 mesmo assim — o Asaas reentrega o evento por conta
      // própria e derrubar a fila por uma indisponibilidade nossa é pior.
      console.error('[asaas/webhook] event_record_failed');
      return NextResponse.json({ received: true, stored: false });
    }
  } else {
    console.error('[asaas/webhook] event_without_id');
  }

  try {
    await processEvent(admin, ctx);
  } catch {
    // Regra de negócio falhou. O evento fica com processed_at null para
    // diagnóstico e a resposta é 2xx: a fila do Asaas NÃO pode ser penalizada
    // por um erro nosso.
    console.error('[asaas/webhook] processing_failed');
    return NextResponse.json({ received: true, processed: false });
  }

  if (ctx.eventId) {
    const { error } = await admin
      .from('payment_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', ctx.eventId);
    if (error) console.error('[asaas/webhook] processed_mark_failed');
  }

  return NextResponse.json({ received: true });
}

type Admin = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Traduz o `checkoutSession` do evento de volta para o lead que abriu o
 * checkout, via payment_checkout_refs.
 *
 * Existe porque o Asaas NÃO devolve o externalReference que mandamos na criação
 * do checkout — nem em payment nem em subscription. O que ele devolve é o id do
 * checkout, e a ponte para o lead é nossa. Ver
 * supabase/migrations/20260812b_checkout_refs.sql.
 *
 * NUNCA lança e NUNCA inventa: sem pista, devolve null e o patch grava
 * external_reference NULL. O pagamento vale mais que a atribuição, e um lead
 * errado é pior que lead nenhum — ele atribuiria a conversão à pessoa errada.
 */
async function resolveLeadId(
  admin: Admin,
  ctx: ReturnType<typeof extractContext>,
): Promise<string | null> {
  // O evento já trouxe a fonte direta: não gasta uma consulta.
  if (ctx.externalReference) return null;

  if (!ctx.checkoutSession) {
    console.error(
      `[asaas/webhook] no_checkout_session event=${ctx.event ?? 'unknown'} ` +
        `subscription=${ctx.subscriptionId ?? '?'}: lead não atribuível`,
    );
    return null;
  }

  try {
    const { data, error } = await admin
      .from('payment_checkout_refs')
      .select('lead_id')
      .eq('checkout_session_id', ctx.checkoutSession)
      .maybeSingle();

    if (error) {
      console.error('[asaas/webhook] checkout_ref_lookup_failed');
      return null;
    }
    if (!data?.lead_id) {
      // Checkout criado antes desta ponte existir, ou insert da ref que falhou
      // na rota de checkout. Recuperável à mão pelo painel do Asaas.
      console.error(
        `[asaas/webhook] checkout_ref_not_found session=${ctx.checkoutSession}`,
      );
      return null;
    }
    return data.lead_id as string;
  } catch {
    // Indisponibilidade do banco não pode derrubar o evento.
    console.error('[asaas/webhook] checkout_ref_lookup_threw');
    return null;
  }
}

async function processEvent(admin: Admin, ctx: ReturnType<typeof extractContext>) {
  // Evento fora da nossa lista: registrado e ignorado. A lista do Asaas tem
  // ~30 eventos; tratamos 10.
  if (ctx.action === 'ignore') return;

  // Sem id de assinatura não há o que sincronizar. Acontece em cobrança avulsa
  // (payment.subscription null), que não é o nosso fluxo.
  if (!ctx.subscriptionId) {
    console.error(`[asaas/webhook] no_subscription_id event=${ctx.event ?? 'unknown'}`);
    return;
  }

  const { data: current } = await admin
    .from('subscriptions')
    .select('id, status, plan_interval, external_reference, current_period_end, user_id, email')
    .eq('id', ctx.subscriptionId)
    .maybeSingle();

  // Resolve o lead ANTES de montar o patch: é ele que vira external_reference.
  const resolved = withResolvedLead(ctx, await resolveLeadId(admin, ctx));

  const patch = buildSubscriptionPatch(resolved, (current ?? null) as CurrentSubscription | null);

  // E-MAIL DO PAGADOR. É a chave do cadastro posterior
  // (enforce_paid_signup_precondition casa por lower(email)), então precisa ser
  // o e-mail de quem PAGOU — não o que a pessoa digitou no popup de lead. Os
  // dois podem divergir: nada impede alguém de informar outro endereço no
  // checkout hospedado, e quem manda é o do pagamento.
  //
  // O payload de cobrança traz só `customer` (cus_xxx), nunca o e-mail, daí a
  // chamada extra. Falha aqui não derruba o evento: sem e-mail a assinatura
  // ainda é gravada, e o e-mail pode chegar num evento seguinte.
  if (ctx.customerId) {
    try {
      const customer = await getCustomer(ctx.customerId);
      const payerEmail = customer.email?.trim().toLowerCase();
      if (payerEmail) {
        const known = (current?.email as string | undefined)?.trim().toLowerCase();
        if (known && known !== payerEmail) {
          // Divergência é informação de negócio, não erro: registre e siga com
          // o do pagador. Sem PII no log.
          console.warn(
            `[asaas/webhook] payer_email_differs subscription=${ctx.subscriptionId}`,
          );
        }
        patch.email = payerEmail;
      }
    } catch {
      console.error('[asaas/webhook] customer_lookup_failed');
    }
  }

  // Upsert por id: o mesmo evento reentregue não duplica linha.
  const { error } = await admin
    .from('subscriptions')
    .upsert(patch, { onConflict: 'id' });
  if (error) {
    console.error('[asaas/webhook] subscription_upsert_failed');
    throw error;
  }

  await refreshCreditsOnRenewal(admin, ctx, current as CurrentSubscription | null, patch);
}

/**
 * Recarga de créditos na RENOVAÇÃO.
 *
 * Só faz sentido quando a assinatura JÁ tem dono. No primeiro pagamento
 * user_id é NULL (a conta ainda não existe) e quem provisiona os créditos é
 * claim_paid_signup_for_user, no cadastro. Aqui é o ciclo seguinte: reset=true
 * zera o saldo para o allowance do plano, que é o comportamento de renovação.
 *
 * refresh_credits valida o allowance contra plan_allowance no banco e recusa
 * valor divergente (invalid_credit_allowance) — por isso o erro é só logado:
 * ele significa bug de contrato nosso, não falha do Asaas, e não pode derrubar
 * a fila de webhooks.
 */
async function refreshCreditsOnRenewal(
  admin: Admin,
  ctx: ReturnType<typeof extractContext>,
  current: CurrentSubscription | null,
  patch: Record<string, unknown>,
) {
  if (ctx.action !== 'grant') return;

  const userId = current?.user_id;
  if (!userId) return;

  const interval = patch.plan_interval === 'year' ? 'year' : 'month';
  const { error } = await admin.rpc('refresh_credits', {
    p_user: userId,
    p_allowance: allowanceFor(interval),
    p_reset: true,
  });
  if (error) console.error('[asaas/webhook] refresh_credits_failed');
}
