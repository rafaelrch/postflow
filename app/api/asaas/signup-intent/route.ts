import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { appUrl } from '@/lib/app-url';
import { getSubscription } from '../../../../lib/asaas/subscriptions';
import { verifySignupToken } from '../../../../lib/signup-token';
import { rateLimit, clientIp } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Início do cadastro passwordless, na volta do checkout pago.
 *
 * Recebe o token assinado que veio na successUrl, confirma que existe uma
 * assinatura PAGA e ainda não reivindicada para aquele lead, cria o usuário
 * (sem senha, com o marcador de origem) e abre o intent de cadastro. O e-mail
 * de confirmação é o que leva a pessoa para definir a senha.
 *
 * MUDANÇA EM RELAÇÃO À VERSÃO ABACATEPAY, e só ela: o que identifica a volta.
 * Lá era um `ref` opaco resolvido pela tabela abacatepay_checkout_refs (que a
 * migração dropou); aqui é o token HMAC + `external_reference` na própria
 * subscriptions. Todo o resto — rate limit duplo, checagem de origin, releitura
 * da API como fonte de verdade, marcador origin='paid_passwordless', resposta
 * genérica — foi preservado deliberadamente.
 *
 * Resposta GENÉRICA em todos os caminhos de recusa: distinguir "token inválido"
 * de "assinatura não encontrada" entregaria um oráculo para enumerar leads.
 */
const generic = { error: 'Não foi possível iniciar o cadastro.' };

export async function POST(req: NextRequest) {
  const rl = rateLimit(`asaas-signup-intent:${clientIp(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json(generic, { status: 429 });

  const origin = req.headers.get('origin');
  if (!origin || origin !== appUrl()) return NextResponse.json(generic, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { token?: string };

  // Assinatura conferida em tempo constante. Só um token emitido pelo nosso
  // servidor chega até aqui com um leadId.
  const leadId = verifySignupToken(body.token);
  if (!leadId) return NextResponse.json(generic, { status: 403 });

  try {
    const admin = createAdminSupabaseClient();

    // IP a partir de header CONFIÁVEL (posto pela borda), não do x-forwarded-for
    // cru, que o cliente pode forjar para escapar do rate limit por IP.
    const trustedIp =
      req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip')?.trim() ||
      'unknown';
    const ipHash = createHash('sha256').update(trustedIp).digest('hex');
    const refHash = createHash('sha256').update(leadId).digest('hex');

    // Segundo rate limit, este PERSISTENTE e por (ip, referência): o da memória
    // acima não sobrevive a múltiplas instâncias serverless.
    const limited = await admin.rpc('consume_passwordless_rate', {
      p_ip_hash: ipHash,
      p_ref_hash: refHash,
    });
    if (limited.error || limited.data === false) return NextResponse.json(generic, { status: 429 });

    // A assinatura só existe depois que o WEBHOOK confirmou o pagamento. Se
    // ainda não há linha, não é erro do usuário — é corrida com o webhook.
    // 202 + pending deixa a página de sucesso tentar de novo em vez de mostrar
    // uma falha para quem acabou de pagar corretamente.
    const { data: row } = await admin
      .from('subscriptions')
      .select('id, email, status')
      .eq('external_reference', leadId)
      .eq('payment_provider', 'asaas')
      .is('user_id', null)
      .maybeSingle();

    if (!row?.id) {
      return NextResponse.json({ pending: true }, { status: 202 });
    }
    if (row.status !== 'active') {
      return NextResponse.json({ pending: true }, { status: 202 });
    }

    // Releitura na API como FONTE DE VERDADE, igual ao fluxo AbacatePay: o
    // estado local pode ter sido escrito por um evento fora de ordem. Só o
    // provedor decide se a assinatura está mesmo ativa.
    const remote = await getSubscription(row.id as string);
    if (remote.status !== 'ACTIVE') return NextResponse.json(generic, { status: 403 });

    const email = (row.email as string | null)?.trim().toLowerCase();
    if (!email) return NextResponse.json(generic, { status: 403 });

    // origin='paid_passwordless' é o marcador que claim_on_email_confirmation e
    // prepare_paid_signup_intent exigem PÓS-insert. Sem ele o claim não roda.
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      app_metadata: { origin: 'paid_passwordless' },
    });
    if (
      created.error &&
      created.error.code !== 'email_exists' &&
      created.error.code !== 'user_already_exists'
    ) {
      return NextResponse.json(generic, { status: 403 });
    }

    const prepared = await admin.rpc('prepare_paid_signup_intent', {
      p_subscription_id: row.id,
      p_email: email,
    });
    if (
      prepared.error ||
      !prepared.data ||
      !['pending', 'claimed'].includes((prepared.data as { state?: string }).state ?? '')
    ) {
      return NextResponse.json(generic, { status: 403 });
    }

    // /resend apenas reenvia a confirmação de um signup já criado. Com o signup
    // público desligado, ele não cria usuário — então não é um caminho de
    // criação de conta alternativo ao gate do banco.
    const mailClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const resent = await mailClient.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: appUrl('/definir-senha') },
    });
    if (resent.error) return NextResponse.json(generic, { status: 403 });

    return NextResponse.json({ ok: true, email });
  } catch {
    return NextResponse.json(generic, { status: 403 });
  }
}
