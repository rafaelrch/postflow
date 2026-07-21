import { NextResponse, type NextRequest } from 'next/server';
import { getCheckout, type AbacateCheckout } from '@/lib/abacatepay';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
// Imports relativos (não alias) pelo mesmo motivo das outras rotas.
import { resolveEmail, upsertSubscription } from '../../../../lib/abacatepay-sync';

export const runtime = 'nodejs';

/**
 * B2 — sequestro de conta. Verificação de pagamento no cadastro pré-login
 * (a versão Stripe em app/api/auth/verify-signup foi removida na migração).
 *
 * A propriedade de segurança é a mesma: o cadastro é pagamento-primeiro e
 * pré-login, então quem preenche o formulário só prova ser quem pagou
 * apresentando uma referência que SÓ existe para quem completou o pagamento.
 * Diferente do e-mail (que qualquer um sabe), `ref` é um UUID gerado por nós
 * no momento da criação do checkout e devolvido apenas na URL de retorno.
 *
 * Duas diferenças em relação à Stripe, ambas forçadas pela API:
 *  - a busca é `ref` → linha em subscriptions → id do checkout, porque a
 *    AbacatePay não tem endpoint de busca por externalId;
 *  - o e-mail não vem no checkout, só `customerId`, então é preciso uma
 *    segunda chamada a /customers/get (resolveEmail).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; ref?: string };
  const email = body.email?.trim();
  const ref = body.ref?.trim();

  if (!email || !ref) {
    return NextResponse.json(
      { error: 'E-mail e referência de pagamento são obrigatórios.' },
      { status: 400 },
    );
  }

  // `ref` → id do checkout. A linha foi gravada na criação do checkout.
  const admin = createAdminSupabaseClient();
  const { data: row } = await admin
    .from('subscriptions')
    .select('id')
    .eq('provider', 'abacatepay')
    .eq('metadata->>ref', ref)
    .maybeSingle();

  if (!row?.id) {
    return NextResponse.json(
      { error: 'Referência de pagamento inválida ou expirada.' },
      { status: 403 },
    );
  }

  let checkout: AbacateCheckout;
  try {
    checkout = await getCheckout(row.id as string);
  } catch {
    return NextResponse.json(
      { error: 'Referência de pagamento inválida ou expirada.' },
      { status: 403 },
    );
  }

  // Estado lido da API, nunca do cliente. PAID é o único status que comprova
  // pagamento — não há trial nesses produtos, então (ao contrário da Stripe)
  // não existe caso "ativo sem cobrança" a acomodar aqui.
  if (checkout.frequency !== 'SUBSCRIPTION' || checkout.status !== 'PAID') {
    return NextResponse.json(
      { error: 'Pagamento não confirmado para esta referência.' },
      { status: 403 },
    );
  }

  const paidEmail = await resolveEmail(checkout);
  if (!paidEmail || paidEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json(
      { error: 'O e-mail informado não corresponde ao pagamento.' },
      { status: 403 },
    );
  }

  // Defesa em profundidade: sincroniza agora em vez de depender do timing do
  // webhook, pra que o trigger enforce_paid_signup encontre o registro certo
  // no signUp logo em seguida. Mesmo motivo da versão Stripe.
  await upsertSubscription(checkout, paidEmail);

  return NextResponse.json({ ok: true });
}
