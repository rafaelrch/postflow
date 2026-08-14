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
 * Início do cadastro na volta do checkout pago.
 *
 * Recebe o token assinado que veio na successUrl, confirma que existe uma
 * assinatura PAGA e ainda não reivindicada para aquele lead, cria o usuário
 * (com a senha escolhida no formulário e o marcador de origem) e abre o intent
 * de cadastro. O e-mail de confirmação é o que libera o acesso.
 *
 * ── DOIS PASSOS, MESMA ROTA ─────────────────────────────────────────────────
 *
 * A senha saiu do /definir-senha e voltou para o formulário de cadastro. Só que
 * o e-mail da conta é o de QUEM PAGOU (row.email, vindo do Asaas), nunca o que
 * a pessoa digitar — então o formulário precisa DESCOBRIR esse e-mail antes de
 * pedir a senha, para exibi-lo travado. Daí os dois passos:
 *
 *   • `{ token }`             → RESOLVE: roda o mesmo portão inteiro e devolve
 *                               só `{ ok, email }`. Não cria usuário, não manda
 *                               e-mail, não escreve nada.
 *   • `{ token, password }`   → COMMIT: roda o portão INTEIRO DE NOVO, do zero
 *                               (token, rate limit, estado da assinatura,
 *                               releitura remota), e só então cria/atualiza o
 *                               usuário e dispara a confirmação.
 *
 * O commit não confia em nada que o resolve tenha visto. Os dois compartilham
 * `gate()` justamente para que seja impossível um deles checar menos.
 *
 * MUDANÇA EM RELAÇÃO À VERSÃO ABACATEPAY, e só ela: o que identifica a volta.
 * Lá era um `ref` opaco resolvido pela tabela abacatepay_checkout_refs (que a
 * migração dropou); aqui é o token HMAC + `external_reference` na própria
 * subscriptions. Todo o resto — rate limit duplo, checagem de origin, releitura
 * da API como fonte de verdade, marcador origin='paid_passwordless', resposta
 * genérica — foi preservado deliberadamente.
 *
 * ── O QUE É GENÉRICO E O QUE NÃO É ──────────────────────────────────────────
 *
 * Continuam genéricos: token inválido/ausente, rate limit, origin errada e
 * TODA falha depois da verificação (createUser, rpc, envio do e-mail). Nada ali
 * ajuda quem está do lado certo do balcão.
 *
 * NÃO são genéricos os três estados do pagamento (não encontrado / ainda
 * confirmando / já reivindicado). Antes os três devolviam a mesma coisa e a UI
 * dizia "ainda estamos confirmando seu pagamento" para todos — mandando esperar
 * por algo que, em dois dos três casos, nunca ia acontecer.
 *
 * Isso NÃO é um oráculo de enumeração, e a razão é estrutural: a entrada desta
 * rota é um TOKEN HMAC emitido pelo nosso servidor (lib/signup-token.ts), não um
 * e-mail. Ninguém consegue perguntar sobre um lead que não seja o do próprio
 * checkout — não há o que enumerar. Nenhum dado do pagamento (nome, plano,
 * valor, data) sai daqui em nenhum dos três casos; só o ESTADO.
 */
const generic = { error: 'Não foi possível iniciar o cadastro.' };

/**
 * Estados do pagamento que a UI precisa saber distinguir. O `code` é o contrato
 * com components/auth/AuthForm.tsx — o texto exibido mora lá.
 */
export const SIGNUP_INTENT_CODES = {
  /** Nenhuma assinatura para este lead. Esperar não resolve. */
  notFound: 'no_payment_found',
  /** Existe, mas o webhook ainda não confirmou. Esperar RESOLVE. */
  pending: 'payment_pending',
  /** Existe e já foi reivindicada por uma conta. O caminho é login. */
  claimed: 'account_exists',
  /** Senha fora do tamanho aceito. O cliente já barra; aqui é a última linha. */
  weakPassword: 'weak_password',
} as const;

/** bcrypt trunca em 72 bytes — aceitar mais é prometer o que não se cumpre. */
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

/**
 * Tetos do passo de RESOLVE, em consume_rate_window (20260813). Cobrem a espera
 * pelo webhook: ~92s em 6 tentativas, das quais até 5 caem no mesmo minuto.
 *
 * ⚠️ ORDEM DE DEPLOY: supabase/migrations/20260813_resolve_rate_limit.sql tem de
 * rodar ANTES deste código ir para o ar. Sem a função, o rpc devolve erro e o
 * gate trata como estouro de cota — todo cadastro vira 429.
 *
 * O COMMIT continua em consume_passwordless_rate, 5/min, sem afrouxar nada:
 * ele cria usuário e dispara e-mail; o resolve só lê. Ver o cabeçalho da
 * migration para o raciocínio inteiro.
 */
const RESOLVE_RATE_PER_IP = 15;
const RESOLVE_RATE_PER_REF = 30;

/**
 * O portão, inteiro, sem nenhum efeito colateral em auth: rate limit duplo,
 * estado da assinatura e releitura remota. Devolve OU uma resposta pronta de
 * recusa OU o par (assinatura, e-mail do pagador) já validado.
 *
 * Os DOIS passos passam por aqui. É de propósito: se o commit tivesse o próprio
 * caminho, alguém um dia removeria uma checagem de um lado só. A ÚNICA coisa
 * que muda entre eles é o balde do rate limit (`step`).
 */
async function gate(req: NextRequest, leadId: string, step: 'resolve' | 'commit'): Promise<
  { deny: NextResponse; ok?: never } | { deny?: never; ok: { subscriptionId: string; email: string } }
> {
  const admin = createAdminSupabaseClient();

  // IP a partir de header CONFIÁVEL (posto pela borda), não do x-forwarded-for
  // cru, que o cliente pode forjar para escapar do rate limit por IP.
  const trustedIp =
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown';
  const ipHash = createHash('sha256').update(trustedIp).digest('hex');

  // Segundo rate limit, este PERSISTENTE e por (ip, referência): o da memória
  // acima não sobrevive a múltiplas instâncias serverless.
  //
  // O prefixo 'resolve:' põe o passo de leitura em OUTRAS LINHAS das mesmas
  // tabelas de contagem — baldes independentes. Sem isso, cada espera longa
  // comeria a cota do commit e a pessoa não conseguiria terminar o cadastro
  // depois de ter esperado direitinho.
  const refHash = createHash('sha256')
    .update(step === 'resolve' ? `resolve:${leadId}` : leadId)
    .digest('hex');

  const limited =
    step === 'resolve'
      ? await admin.rpc('consume_rate_window', {
          p_ip_hash: ipHash,
          p_ref_hash: refHash,
          p_ip_limit: RESOLVE_RATE_PER_IP,
          p_ref_limit: RESOLVE_RATE_PER_REF,
        })
      : await admin.rpc('consume_passwordless_rate', {
          p_ip_hash: ipHash,
          p_ref_hash: refHash,
        });
  if (limited.error || limited.data === false) {
    return { deny: NextResponse.json(generic, { status: 429 }) };
  }

  // LISTA, não maybeSingle: um lead pode ter mais de uma assinatura (abandonou
  // um checkout, voltou e pagou noutro). Com maybeSingle isso vira erro do
  // PostgREST e `data` null — que aqui seria lido como "não pagou", travando
  // justamente quem pagou duas vezes. O filtro `.is('user_id', null)` também
  // saiu do WHERE: é ele que precisa virar uma RESPOSTA ("já tem conta") em
  // vez de sumir da consulta e virar "não encontrei pagamento".
  const { data: rows } = await admin
    .from('subscriptions')
    .select('id, email, status, user_id')
    .eq('external_reference', leadId)
    .eq('payment_provider', 'asaas')
    .order('updated_at', { ascending: false })
    .limit(10);

  const found = rows ?? [];

  // (a) Nenhuma assinatura para este lead. Duas situações MUITO diferentes se
  // parecem aqui, e é preciso separá-las antes de responder:
  //
  //   • ele nunca abriu checkout nenhum → não pagou, esperar não resolve;
  //   • ele abriu o checkout e o webhook ainda está voando → esperar RESOLVE.
  //
  // A segunda virou o caso comum quando a successUrl passou a apontar direto
  // para /cadastro: a primeira pergunta acontece no mesmo instante do redirect,
  // antes de o PAYMENT_CONFIRMED chegar. Antes havia uma página intermediária
  // no meio, e os segundos do clique escondiam a corrida.
  //
  // O sinal é payment_checkout_refs, que a rota de checkout grava ANTES de
  // mandar o comprador para o Asaas. Nada de heurística de tempo nem relógio do
  // cliente.
  //
  // ⚠️ A ref justifica ESPERAR, nunca LIBERAR. Ela diz "começou a pagar", não
  // "pagou" — quem cria conta é a assinatura ativa escrita pelo webhook, e este
  // ramo devolve recusa nos dois casos. A diferença é só qual verdade a UI
  // conta para a pessoa.
  if (found.length === 0) {
    const { data: refs } = await admin
      .from('payment_checkout_refs')
      .select('checkout_session_id')
      .eq('lead_id', leadId)
      .limit(1);

    if ((refs?.length ?? 0) > 0) {
      return {
        deny: NextResponse.json(
          { pending: true, code: SIGNUP_INTENT_CODES.pending },
          { status: 202 },
        ),
      };
    }

    return {
      deny: NextResponse.json(
        { error: generic.error, code: SIGNUP_INTENT_CODES.notFound },
        { status: 404 },
      ),
    };
  }

  // (c) Existe, mas TODAS já têm dono. O caminho é login, não cadastro. Vem
  // ANTES do teste de 'active': quem já tem conta já tem conta, qualquer que
  // seja o status da assinatura.
  //
  // É TAMBÉM o que impede trocar a senha de conta alheia no commit: a única
  // assinatura que segue adiante é uma com user_id null.
  const unclaimed = found.filter((r) => !r.user_id);
  if (unclaimed.length === 0) {
    return {
      deny: NextResponse.json(
        { error: generic.error, code: SIGNUP_INTENT_CODES.claimed },
        { status: 409 },
      ),
    };
  }

  // (b) Existe e é desta pessoa, mas o webhook ainda não confirmou. AQUI
  // "tente de novo em instantes" é verdade: esperar resolve mesmo.
  const row = unclaimed.find((r) => r.status === 'active');
  if (!row?.id) {
    return {
      deny: NextResponse.json({ pending: true, code: SIGNUP_INTENT_CODES.pending }, { status: 202 }),
    };
  }

  // Releitura na API como FONTE DE VERDADE, igual ao fluxo AbacatePay: o
  // estado local pode ter sido escrito por um evento fora de ordem. Só o
  // provedor decide se a assinatura está mesmo ativa.
  const remote = await getSubscription(row.id as string);
  if (remote.status !== 'ACTIVE') return { deny: NextResponse.json(generic, { status: 403 }) };

  const email = (row.email as string | null)?.trim().toLowerCase();
  if (!email) return { deny: NextResponse.json(generic, { status: 403 }) };

  return { ok: { subscriptionId: row.id as string, email } };
}

/**
 * Usuário desta MESMA tentativa, criado antes de haver senha (ou numa tentativa
 * anterior que não chegou ao fim), procurado pelo e-mail do pagamento.
 *
 * As três condições são o que separa "terminar o meu cadastro" de "sequestrar a
 * conta de outra pessoa", e valem TODAS ao mesmo tempo:
 *   1. a assinatura ainda não tem dono — garantido pelo `unclaimed` do gate();
 *   2. o usuário nasceu com origin='paid_passwordless' (não é conta comum que
 *      por acaso usa esse e-mail);
 *   3. o e-mail dele nunca foi confirmado, ou seja, ninguém nunca entrou nessa
 *      conta e não há nada ali para roubar.
 *
 * Sem as três, devolve null e o fluxo segue sem tocar em senha nenhuma: a
 * pessoa confirma o e-mail e cai no /definir-senha, que continua existindo
 * exatamente para isso.
 *
 * O SDK admin não sabe buscar usuário por e-mail (só listUsers paginado), então
 * a busca vai direto no endpoint admin do GoTrue. Se o `filter` não for
 * respeitado, o `find` por e-mail exato não acha nada e o retorno é null — a
 * degradação é para o lado seguro.
 */
async function findAdoptableUserId(email: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const res = await fetch(
    `${url}/auth/v1/admin/users?per_page=200&filter=${encodeURIComponent(email)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) return null;

  const payload = (await res.json().catch(() => null)) as {
    users?: Array<{
      id?: string;
      email?: string | null;
      email_confirmed_at?: string | null;
      app_metadata?: { origin?: unknown } | null;
    }>;
  } | null;

  const user = (payload?.users ?? []).find((u) => u.email?.trim().toLowerCase() === email);
  if (!user?.id) return null;
  if (user.app_metadata?.origin !== 'paid_passwordless') return null;
  if (user.email_confirmed_at) return null;
  return user.id;
}

export async function POST(req: NextRequest) {
  // Corte grosso de abuso, antes de ler o corpo. O teto é a SOMA dos dois
  // passos (a espera pelo webhook chama o resolve várias vezes); o teto que
  // interessa, por passo, vem logo abaixo.
  const rl = rateLimit(`asaas-signup-intent:${clientIp(req)}`, {
    limit: RESOLVE_RATE_PER_IP + 5,
    windowMs: 60_000,
  });
  if (!rl.ok) return NextResponse.json(generic, { status: 429 });

  const origin = req.headers.get('origin');
  if (!origin || origin !== appUrl()) return NextResponse.json(generic, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { token?: string; password?: unknown };

  // Assinatura conferida em tempo constante. Só um token emitido pelo nosso
  // servidor chega até aqui com um leadId.
  const leadId = verifySignupToken(body.token);
  if (!leadId) return NextResponse.json(generic, { status: 403 });

  // Sem senha no corpo = passo RESOLVE. Com senha = passo COMMIT.
  const password = typeof body.password === 'string' ? body.password : undefined;
  const step = password === undefined ? 'resolve' : 'commit';

  // Em memória e POR PASSO, espelhando os baldes do banco: o commit continua em
  // 5/min por IP, o resolve tem o teto folgado que a espera exige. Um balde só,
  // compartilhado, faria a espera longa derrubar o commit que vem depois dela.
  const stepRl = rateLimit(`asaas-signup-intent:${step}:${clientIp(req)}`, {
    limit: step === 'resolve' ? RESOLVE_RATE_PER_IP : 5,
    windowMs: 60_000,
  });
  if (!stepRl.ok) return NextResponse.json(generic, { status: 429 });

  // Depois do token, nunca antes: quem não provou de onde veio não recebe
  // resposta específica de nada.
  if (password !== undefined && (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)) {
    return NextResponse.json(
      { error: generic.error, code: SIGNUP_INTENT_CODES.weakPassword },
      { status: 400 },
    );
  }

  try {
    const gated = await gate(req, leadId, step);
    if (gated.deny) return gated.deny;
    const { subscriptionId, email } = gated.ok;

    // RESOLVE termina aqui. O formulário só queria saber de quem é a conta.
    if (password === undefined) return NextResponse.json({ ok: true, email });

    const admin = createAdminSupabaseClient();
    // O e-mail é SEMPRE o do pagamento. Nada do que o formulário mandou entra
    // aqui além da senha — se o e-mail viesse do corpo, qualquer token válido
    // criaria conta paga no endereço que o atacante quisesse.
    //
    // origin='paid_passwordless' é o marcador que claim_on_email_confirmation e
    // prepare_paid_signup_intent exigem PÓS-insert. Sem ele o claim não roda.
    // password_set diz ao /definir-senha que não há mais o que perguntar.
    const appMetadata = { origin: 'paid_passwordless', password_set: true };
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      app_metadata: appMetadata,
    });
    const alreadyExists =
      created.error?.code === 'email_exists' || created.error?.code === 'user_already_exists';
    if (created.error && !alreadyExists) {
      return NextResponse.json(generic, { status: 403 });
    }

    // Reentrada: a pessoa já tinha passado por aqui (o e-mail se perdeu, ela
    // voltou pelo mesmo link) e agora escolheu uma senha. Só grava se a conta
    // for adotável pelas três condições de findAdoptableUserId.
    if (alreadyExists) {
      const adoptable = await findAdoptableUserId(email);
      if (adoptable) {
        const updated = await admin.auth.admin.updateUserById(adoptable, {
          password,
          app_metadata: appMetadata,
        });
        if (updated.error) return NextResponse.json(generic, { status: 403 });
      }
    }

    const prepared = await admin.rpc('prepare_paid_signup_intent', {
      p_subscription_id: subscriptionId,
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
    //
    // O destino CONTINUA sendo /definir-senha, e não /onboarding, por um motivo
    // mecânico: o Supabase devolve a sessão no FRAGMENTO da URL (#access_token),
    // que nunca chega ao servidor. Uma rota protegida como /onboarding decide no
    // middleware, antes de qualquer JS ler o fragmento — veria "sem sessão" e
    // mandaria para o login. /definir-senha é a página que troca esse fragmento
    // por sessão em cookie; com password_set no app_metadata ela não pergunta
    // mais nada e encaminha direto para /onboarding.
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
