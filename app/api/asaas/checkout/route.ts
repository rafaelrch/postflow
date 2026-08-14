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
import { AsaasError } from '../../../../lib/asaas/client';

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
 * no caminho feliz.
 *
 * O que amarra a volta ao comprador é a linha em `payment_checkout_refs`
 * (checkout.id → lead.id) gravada no fim desta rota — NÃO o `externalReference`.
 * Medido em sandbox: o Asaas aceita o externalReference e nunca o devolve no
 * webhook. Continuamos mandando porque ele aparece no painel deles e serve para
 * conciliação manual, mas ele não é a chave de nada aqui.
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
      // customerData abaixo). A linha precisa existir porque é ela que vira a
      // ponta lead da payment_checkout_refs — a amarra entre pagamento e
      // comprador — e porque a FK da tabela recusaria um lead inexistente.
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
          // Direto no cadastro, sem página de recado no meio: a única coisa que
          // aquela tela fazia era pedir mais um clique para chegar aqui. Se o
          // webhook ainda não tiver chegado, /cadastro já sabe esperar sozinho
          // (estado payment_pending, com tentativas automáticas).
          //
          // ⚠️ CHEGAR NO /cadastro NÃO É PROVA DE PAGAMENTO — o Asaas redireciona
          // antes de a cobrança ser confirmada, e o token só diz "de qual lead é
          // esta volta". Quem cria a assinatura é o webhook (PAYMENT_CONFIRMED);
          // o cadastro exige essa linha no banco.
          successUrl: appUrl(`/cadastro?t=${encodeURIComponent(token)}`),
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
          // DESCRIÇÃO DA COBRANÇA. Sem ela a fatura do cliente sai como
          // "Descrição não informada" — cobrança irreconhecível é das maiores
          // causas de contestação, e chargeback custa mais que a venda.
          //
          // O texto sai de lib/plans.ts, junto com preço e ciclo, e não daqui:
          // mesma regra que impede o valor cobrado de divergir do anunciado.
          // items[].name/description NÃO resolvem — a produção já manda os dois
          // e a cobrança continua sem descrição.
          //
          // ⚠️ Ver `description` em AsaasCheckoutSubscriptionInput: o campo é
          // comprovadamente o certo em /v3/subscriptions, mas o repasse pelo
          // checkout hospedado só se confirma pagando um checkout no sandbox.
          // Mandar não custa nada nem quebra nada — o Asaas ignora em silêncio
          // o que não conhece (medido: campo inventado devolve 200).
          description: plan.chargeDescription,
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
        // conhecido depois, via GET /v3/customers/{id}. E ele identifica QUEM
        // PAGOU, não QUAL LEAD converteu — os dois endereços divergem na
        // prática. Quem liga o pagamento ao lead é a payment_checkout_refs.
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

    // PONTE checkout → lead. O externalReference acima NÃO volta no webhook (o
    // Asaas aceita e nunca devolve). O que volta é `checkoutSession`, que é este
    // `checkout.id`. Guardar o par aqui é a única forma de saber, lá no webhook,
    // qual lead converteu. Ver supabase/migrations/20260812b_checkout_refs.sql.
    //
    // ORDEM: só depois de o checkout existir. Gravar antes criaria refs para
    // checkouts que o Asaas recusou.
    //
    // FALHA NÃO DERRUBA A RESPOSTA, e isso é deliberado: neste ponto o checkout
    // já foi criado e já é pagável. Devolver erro faria o comprador perder um
    // link válido para não perder um dado de atribuição — trocar dinheiro por
    // métrica. Loga e segue: o pagamento funciona, só a atribuição do lead se
    // perde, e o par ainda dá para reconstruir à mão pelo painel do Asaas
    // (o externalReference aparece lá).
    if (checkout.id) {
      // try/catch além do `error` do Supabase: uma exceção aqui cairia no catch
      // geral da rota e viraria 500 — exatamente a resposta que este bloco
      // existe para evitar.
      try {
        const { error: refError } = await admin.from('payment_checkout_refs').insert({
          checkout_session_id: checkout.id,
          lead_id: lead.id as string,
          plan_interval: interval,
        });
        if (refError) {
          console.error(`[asaas/checkout] checkout_ref_insert_failed checkout=${checkout.id}`);
        }
      } catch {
        console.error(`[asaas/checkout] checkout_ref_insert_threw checkout=${checkout.id}`);
      }
    } else {
      // Não deveria acontecer (id é obrigatório na resposta), mas se acontecer
      // o pagamento continua válido e sem rastro de atribuição — precisa gritar.
      console.error('[asaas/checkout] checkout_without_id: atribuição do lead ficará perdida');
    }

    return NextResponse.json({ url: checkout.link });
  } catch (err) {
    // O objeto de erro NÃO é logado inteiro: ele carrega o corpo da requisição,
    // e ali vai dado do comprador. Mas logar só "falhou" deixa a rota
    // indiagnosticável — foi o que aconteceu na primeira integração com o
    // sandbox, onde a causa era um campo do payload recusado e não dava para
    // saber qual.
    //
    // O meio-termo: `code` e `description` do AsaasError são texto do PROVEDOR
    // sobre o que ele recusou ("O campo successUrl é inválido"), não conteúdo
    // do comprador. Isso é seguro e é exatamente o que se precisa ler às 3h da
    // manhã.
    if (err instanceof AsaasError) {
      console.error(
        `[asaas/checkout] asaas_rejected status=${err.status} code=${err.code ?? '?'} description=${err.description ?? '?'}`,
      );
    } else {
      // Só o NOME da classe do erro, nunca a mensagem: mensagem de exceção
      // pode incorporar o payload. O nome (AsaasConfigError, TypeError...) já
      // separa 'env faltando' de 'bug no código' sem vazar nada.
      console.error(`[asaas/checkout] checkout_failed ${(err as Error)?.name ?? 'Error'}`);
    }
    return NextResponse.json(
      { error: 'Não foi possível criar o checkout.' },
      { status: 500 },
    );
  }
}
