/**
 * Cliente mínimo da API do Resend.
 *
 * ⚠️ SERVIDOR APENAS — lê RESEND_API_KEY. Nunca importe de componente client.
 *
 * ── POR QUE ISTO EXISTE, se já mandamos e-mail hoje ─────────────────────────
 *
 * Os e-mails de hoje são do SUPABASE AUTH (confirmação de cadastro,
 * recuperação de senha). O Resend entra ali só como SMTP: o Supabase renderiza
 * o HTML dele e entrega pronto. Ver docs/emails-transacionais.md, seção 5.
 *
 * O aviso de pagamento órfão NÃO pode ir por esse caminho, por um motivo
 * estrutural: no instante em que ele precisa sair, o usuário do Supabase AINDA
 * NÃO EXISTE — a assinatura está com user_id null e a conta só nasce quando a
 * pessoa termina o cadastro. Não há a quem o Auth mandaria e-mail. Daí a API
 * direta, que é também o único jeito de usar um TEMPLATE publicado no Resend.
 *
 * ── REGRA DE OURO ───────────────────────────────────────────────────────────
 *
 * NADA aqui lança. Todas as funções devolvem null/false em qualquer falha, e
 * logam código — nunca conteúdo. Quem chama é o webhook do Asaas, e uma exceção
 * ali derrubaria a fila de pagamentos da conta inteira (15 falhas seguidas
 * pausam TODOS os eventos). Trocar "não avisou" por "não registrou o pagamento"
 * é um negócio muito ruim.
 */

const RESEND_API = 'https://api.resend.com';

/** Timeout curto: o webhook do Asaas não pode ficar pendurado esperando e-mail. */
const TIMEOUT_MS = 8_000;

/**
 * Lê a chave. AUSENTE NÃO É SILÊNCIO: loga alto e devolve null.
 *
 * Hoje a chave do Resend só existe dentro do SMTP do Supabase, não nas env vars
 * do app — então este caminho é o estado ATUAL de produção até alguém preencher
 * RESEND_API_KEY na Vercel. Um fallback silencioso aqui esconderia exatamente o
 * problema que este módulo existe para tornar visível.
 */
function apiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.error(
      '[resend] missing_RESEND_API_KEY: nenhum e-mail será enviado. ' +
        'Configure a env var na Vercel (Preview e Production).',
    );
    return null;
  }
  return key;
}

async function call(
  path: string,
  init: { method: string; body?: unknown; idempotencyKey?: string },
): Promise<Record<string, unknown> | null> {
  const key = apiKey();
  if (!key) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  // Idempotency-Key é a trava do Resend contra o mesmo e-mail sair duas vezes
  // quando duas entregas do Asaas correm em paralelo. A requisição repetida
  // devolve o MESMO id em vez de agendar outro envio.
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;

  try {
    const res = await fetch(`${RESEND_API}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      // Só o STATUS. O corpo de erro do Resend ecoa o destinatário, e o
      // destinatário é dado do comprador.
      console.error(`[resend] request_failed path=${path} status=${res.status}`);
      return null;
    }

    return (await res.json().catch(() => null)) as Record<string, unknown> | null;
  } catch (err) {
    // Só o NOME da classe (TimeoutError, TypeError...), nunca a mensagem:
    // mensagem de exceção pode incorporar a URL e o payload.
    console.error(`[resend] request_threw path=${path} ${(err as Error)?.name ?? 'Error'}`);
    return null;
  }
}

/**
 * Agenda (ou envia) um e-mail a partir de um TEMPLATE publicado no Resend.
 *
 * Devolve o id do e-mail — necessário para cancelar depois — ou null se
 * qualquer coisa falhou, inclusive a chave ausente.
 *
 * `templateId` aceita o id OU o alias do template publicado. Usamos o alias:
 * ele é estável e legível, enquanto o uuid muda se o template for recriado.
 */
export async function sendTemplateEmail(input: {
  to: string;
  templateId: string;
  variables?: Record<string, string>;
  /** ISO 8601. Ausente = envio imediato. */
  scheduledAt?: string;
  idempotencyKey?: string;
}): Promise<string | null> {
  const body: Record<string, unknown> = {
    to: [input.to],
    template: { id: input.templateId, variables: input.variables ?? {} },
  };
  // O remetente e o assunto vêm do PRÓPRIO template publicado (o
  // creatools-ative-seu-acesso traz "Equipe Creatools
  // <contato@creatools.com.br>"). Repetir aqui criaria uma segunda fonte de
  // verdade que ninguém lembraria de atualizar junto.
  if (input.scheduledAt) body.scheduled_at = input.scheduledAt;

  const json = await call('/emails', {
    method: 'POST',
    body,
    idempotencyKey: input.idempotencyKey,
  });

  const id = typeof json?.id === 'string' ? json.id : null;
  if (!id) console.error('[resend] send_without_id');
  return id;
}

/**
 * Cancela um e-mail AGENDADO que ainda não saiu.
 *
 * `false` significa "não deu para cancelar", e o chamador trata isso como
 * aceitável: o pior caso é a pessoa que acabou de criar a conta receber um
 * convite para criá-la. Confuso, não danoso — e o link cai em /cadastro, que
 * responde `account_exists` e manda para o login.
 */
export async function cancelScheduledEmail(emailId: string): Promise<boolean> {
  const json = await call(`/emails/${encodeURIComponent(emailId)}/cancel`, {
    method: 'POST',
  });
  return json !== null;
}
