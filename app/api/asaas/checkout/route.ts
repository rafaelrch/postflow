import { NextResponse, type NextRequest } from 'next/server';
import { appUrl } from '@/lib/app-url';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
// Imports relativos (não alias): o vitest resolve o mock a partir do caminho do
// arquivo de teste, não do alias '@/'. Ver tests/asaas-checkout-route.test.ts.
import { createCheckout } from '../../../../lib/asaas/checkouts';
import { hasBillableSubscription } from '../../../../lib/subscription';
import { rateLimit, clientIp } from '../../../../lib/rate-limit';
import { isPlanInterval, planFor } from '../../../../lib/plans';
import { createSignupToken } from '../../../../lib/signup-token';

export const runtime = 'nodejs';

// Rota pública de escrita (checkout pré-login): teto por IP por minuto.
const CHECKOUT_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

/**
 * Validade do link de checkout. A doc aceita 10 a 1440 minutos.
 *
 * 60 é folgado para quem vai buscar o cartão, e curto o
 * bastante para que um link abandonado não continue pagável no dia seguinte —
 * uma cobrança que cai 20 horas depois cria assinatura para alguém que já
 * desistiu (ou que já assinou por outro link), e o webhook não tem como saber
 * a diferença.
 */
const CHECKOUT_MINUTES_TO_EXPIRE = 60;

/**
 * Checkout "pagamento primeiro": NÃO exige login.
 *
 * Diferença estrutural em relação à era AbacatePay: lá o e-mail precisava
 * virar um customer via API antes do checkout, porque o checkout não devolvia
 * e-mail nenhum. No Asaas o checkout hospedado coleta os dados do pagador
 * sozinho (inclusive o CPF, que NÓS não pedimos), então não criamos customer
 * no caminho feliz. O que amarra a volta ao comprador é o `externalReference`
 * = id do lead, que o webhook devolve.
 *
 * Guard B1 preservado: usuário logado com assinatura que ainda cobra recebe
 * 409 antes de qualquer chamada ao Asaas.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`asaas-checkout:${ip}`, { limit: CHECKOUT_RATE_LIMIT, windowMs: RATE_WINDOW_MS });
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
      interval?: unknown;
      leadId?: unknown;
    };

    // Sem fallback para 'month': intervalo inválido é erro do cliente, e cobrar
    // o plano errado calado é pior que recusar.
    if (!isPlanInterval(body.interval)) {
      return NextResponse.json(
        { error: 'Plano inválido.', code: 'invalid_interval' },
        { status: 400 },
      );
    }
    const interval = body.interval;

    const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
    if (!/^[0-9a-fA-F-]{36}$/.test(leadId)) {
      return NextResponse.json(
        { error: 'Cadastro de contato não encontrado.', code: 'invalid_lead' },
        { status: 400 },
      );
    }

    // O lead precisa existir: é ele que vira o externalReference e, portanto, a
    // chave que liga o pagamento ao comprador. Leitura via service role porque
    // `leads` tem RLS sem policy (deny para o client).
    const admin = createAdminSupabaseClient();
    const { data: lead, error: leadError } = await admin
      .from('leads')
      // Só o id: o resto do lead não vai para o Asaas (ver o comentário sobre
      // customerData abaixo). A linha precisa existir porque é ela que vira o
      // externalReference — a única amarra entre o pagamento e o comprador.
      .select('id')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      console.error('[asaas/checkout] lead_lookup_failed');
      return NextResponse.json({ error: 'Não foi possível criar o checkout.' }, { status: 500 });
    }
    if (!lead?.id) {
      return NextResponse.json(
        { error: 'Cadastro de contato não encontrado.', code: 'invalid_lead' },
        { status: 400 },
      );
    }

    const plan = planFor(interval);

    // nextDueDate = hoje: a primeira cobrança é no ato do checkout. Formato
    // YYYY-MM-DD exigido pela doc.
    const today = new Date().toISOString().slice(0, 10);

    // Token nosso na URL de volta — ver lib/signup-token.ts. Não é prova de
    // pagamento; é prova de que a volta é deste lead e saiu do nosso servidor.
    const token = createSignupToken(lead.id as string);

    const checkout = await createCheckout(
      {
        // SÓ CARTÃO. Não é escolha nossa: o Asaas recusa o checkout com
        // "O método de pagamento CREDIT_CARD é o único método de pagamento
        // permitido para operações RECURRENT". PIX só existe em chargeTypes
        // DETACHED (cobrança avulsa), o que exigiria renovação manual a cada
        // ciclo — outro produto. Verificado contra o sandbox em 12/08.
        billingTypes: ['CREDIT_CARD'],
        chargeTypes: ['RECURRENT'],
        minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
        externalReference: lead.id as string,
        // ⚠️ Estas URLs precisam ser HTTPS PÚBLICAS. O Asaas rejeita localhost
        // com "O campo successUrl é inválido" — em dev, aponte
        // NEXT_PUBLIC_APP_URL para o túnel (ngrok/cloudflared), não para
        // localhost:3000.
        callback: {
          successUrl: appUrl(`/assinatura/sucesso?t=${encodeURIComponent(token)}`),
          cancelUrl: appUrl('/assinatura/cancelado'),
          expiredUrl: appUrl('/assinatura/expirado'),
        },
        // Sem imageBase64: a referência do Asaas lista o campo como
        // obrigatório, mas o sandbox aceita o checkout sem ele (testado nos
        // dois modos em 12/08). Mandar um PNG 1x1 só para satisfazer a doc
        // deixaria um quadrado vazio na página de pagamento.
        items: [
          {
            name: plan.itemName,
            description: plan.itemDescription,
            quantity: 1,
            value: plan.value,
          },
        ],
        subscription: {
          cycle: plan.cycle,
          nextDueDate: today,
        },
        // customerData é OMITIDO de propósito, e isso é tudo-ou-nada.
        //
        // A doc diz que todos os campos dele são opcionais. É verdade só se o
        // objeto inteiro for omitido: mandar name/email/phone parcial faz o
        // Asaas exigir TAMBÉM cpfCnpj, address, addressNumber, province e
        // postalCode, e devolver 400 sem eles. Como não coletamos documento
        // nem endereço no popup (e não queremos coletar), o objeto não vai —
        // o checkout hospedado pede tudo isso ao comprador.
        //
        // Consequência que o webhook resolve: o e-mail do pagador só é
        // conhecido depois, via GET /v3/customers/{id}. Quem liga o pagamento
        // a esta pessoa é o externalReference acima.
      },
      {
        // SEM RETRY. O client repete 5xx/429 por padrão, o que é certo para
        // leitura e errado aqui: um 502 na volta de um POST que o Asaas já
        // processou viraria um SEGUNDO checkout para o mesmo lead — e o
        // comprador poderia pagar os dois. Erro na tela é recuperável;
        // cobrança duplicada não.
        maxRetries: 0,
      },
    );

    if (!checkout?.link) {
      console.error('[asaas/checkout] checkout_without_link');
      return NextResponse.json({ error: 'Não foi possível criar o checkout.' }, { status: 502 });
    }

    return NextResponse.json({ url: checkout.link });
  } catch {
    // Nada do erro é logado: a mensagem pode carregar payload do comprador.
    console.error('[asaas/checkout] checkout_failed');
    return NextResponse.json(
      { error: 'Não foi possível criar o checkout.' },
      { status: 500 },
    );
  }
}
