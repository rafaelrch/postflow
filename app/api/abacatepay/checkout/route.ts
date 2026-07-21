import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID, createHash } from 'node:crypto';
import {
  createCustomer,
  createSubscriptionCheckout,
  productIdForInterval,
  type PlanInterval,
} from '@/lib/abacatepay';
import { appUrl } from '@/lib/app-url';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
// Import relativo (não alias): vitest não resolve `@/*` para módulos não
// mockados no teste (mesmo motivo documentado em stripe/checkout/route.ts).
import { hasBillableSubscription } from '../../../../lib/subscription';
import { upsertSubscription } from '../../../../lib/abacatepay-sync';
import { rateLimit, clientIp } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

// Rota pública de escrita (checkout pré-login): teto por IP por minuto.
const CHECKOUT_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

/**
 * Checkout "pagamento primeiro": NÃO exige login. Equivalente AbacatePay da
 * rota Stripe, com uma diferença ESTRUTURAL forçada pela API:
 *
 * A Stripe coletava o e-mail na própria página hospedada e devolvia esse
 * e-mail no objeto da sessão, o que permitia provar depois quem pagou (fix
 * B2). O checkout da AbacatePay não expõe e-mail nenhum — só `customerId`, e
 * quando criado sem cliente vinculado o campo fica null. Portanto o e-mail
 * precisa ser coletado por NÓS antes, virar um customer, e o customer ser
 * amarrado ao checkout. Sem isso não existe e-mail verificável no servidor e
 * o B2 não se sustenta.
 *
 * Guard B1 preservado: usuário logado com assinatura que ainda cobra recebe
 * 409 antes de qualquer chamada à AbacatePay.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`abacate-checkout:${ip}`, { limit: CHECKOUT_RATE_LIMIT, windowMs: RATE_WINDOW_MS });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && (await hasBillableSubscription(supabase, user.id))) {
      return NextResponse.json({ alreadySubscribed: true }, { status: 409 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      interval?: PlanInterval;
      email?: string;
    };
    const interval: PlanInterval = body.interval === 'year' ? 'year' : 'month';
    const email = body.email?.trim().toLowerCase();

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Informe um e-mail válido para continuar.', code: 'email_required' },
        { status: 400 },
      );
    }

    const productId = productIdForInterval(interval);
    if (!productId) {
      return NextResponse.json(
        {
          error: `Produto não configurado para o plano ${interval}. Defina ABACATEPAY_PRODUCT_MONTHLY / ABACATEPAY_PRODUCT_ANNUALLY.`,
        },
        { status: 500 },
      );
    }

    // Cliente único por e-mail do nosso lado. A AbacatePay dedupe por taxId,
    // que não coletamos — então recriar com o mesmo e-mail gera um customer
    // novo. Tudo bem: o que importa pro B2 é que ESTE checkout aponte para um
    // customer cujo e-mail é o que o comprador declarou aqui.
    const customer = await createCustomer({
      email,
      metadata: user ? { supabase_user_id: user.id } : undefined,
    });

    // Referência própria: a AbacatePay não tem placeholder tipo
    // {CHECKOUT_SESSION_ID} da Stripe para injetar o id na URL de retorno, e
    // o id só existe depois da criação. Geramos o nosso antes, mandamos como
    // externalId e carregamos na URL de volta.
    const ref = randomUUID();

    const checkout = await createSubscriptionCheckout({
      productId,
      customerId: customer.id,
      externalId: ref,
      completionUrl: appUrl(`/cadastro?ref=${ref}`),
      returnUrl: appUrl('/precos?checkout=cancel'),
      metadata: {
        interval,
        ref,
        ...(user ? { supabase_user_id: user.id } : {}),
      },
    });

    const admin = createAdminSupabaseClient();
    const { error: mappingError } = await admin.from('abacatepay_checkout_refs').upsert({
      ref_hash: createHash('sha256').update(ref).digest('hex'),
      checkout_id: checkout.id,
      expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    }, { onConflict: 'ref_hash' });
    if (mappingError) throw new Error('checkout_mapping_failed');

    // Registra o checkout pendente já (status PENDING → 'incomplete', que NÃO
    // entra na view de assinatura ativa nem no guard B1). É esse registro que
    // deixa o verify-signup resolver `ref` → id do checkout sem depender de um
    // endpoint de busca por externalId, que a API não oferece.
    await upsertSubscription(checkout, email);

    return NextResponse.json({ url: checkout.url });
  } catch {
    console.error('[abacatepay/checkout] checkout_failed');
    return NextResponse.json(
      { error: 'Não foi possível criar o checkout.' },
      { status: 500 },
    );
  }
}
