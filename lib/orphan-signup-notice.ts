/**
 * Aviso de PAGAMENTO ÓRFÃO — a regra, em módulo PURO.
 *
 * Nada de fetch, nada de Supabase, nada de relógio implícito: só a decisão
 * "este `grant` merece um e-mail?". Mesmo desenho de lib/asaas-webhook.ts, pelo
 * mesmo motivo — a decisão é a parte que precisa de teste denso e não pode
 * depender de mock de banco para ser exercitada. O I/O mora na rota.
 *
 * ── O BURACO QUE ISTO TAPA ──────────────────────────────────────────────────
 *
 * O produto é pagamento-primeiro: quando PAYMENT_CONFIRMED chega, a CONTA AINDA
 * NÃO EXISTE. A tela de /cadastro espera o webhook por ~92s (a escada de
 * RETRY_DELAYS_MS em components/auth/AuthForm.tsx) e desiste. Se o webhook
 * demorar mais que isso — instabilidade do Asaas, nossa função fora do ar, a
 * fila deles pausada por 15 falhas seguidas — a pessoa PAGOU e não consegue
 * criar a conta, e ninguém é avisado. Isso vira reclamação ou, pior,
 * contestação no banco, que custa mais que a venda.
 *
 * ── POR QUE AGENDADO, E NÃO IMEDIATO ────────────────────────────────────────
 *
 * A pergunta que decide o e-mail é "a pessoa ainda está na tela esperando?", e
 * ela NÃO tem resposta confiável no instante do webhook:
 *
 *   • o `grant` pode chegar ANTES de o navegador terminar o redirect para
 *     /cadastro (a tela ainda nem começou a perguntar) — mandar aí seria
 *     mandar "crie sua conta" para quem está prestes a criá-la;
 *   • nenhum campo do payload diz QUANDO o pagamento foi confirmado com
 *     precisão de segundos: `confirmedDate`, `clientPaymentDate` e `dateCreated`
 *     do Asaas são datas de calendário, sem hora. Não dá para medir o atraso;
 *   • tempo desde a criação do checkout também não serve: preencher o cartão na
 *     página hospedada leva de segundos a vários minutos, legitimamente.
 *
 * Então não se adivinha. O e-mail é AGENDADO no Resend para daqui a
 * NOTICE_DELAY_MINUTES e CANCELADO quando a pessoa aparece (o commit de
 * app/api/asaas/signup-intent/route.ts). Quem decide não é um palpite sobre
 * onde ela está: é o estado real no fim da janela — a conta nasceu ou não.
 *
 * O cron da Vercel não é alternativa: a conta é HOBBY e ali cron é diário na
 * prática. O agendamento do próprio Resend nos dá o relógio sem infra nova.
 */

/** Motivo de NÃO agendar. Vira log (código, nunca conteúdo do comprador). */
export type NoticeSkipReason =
  /** O evento não libera acesso; não há o que avisar. */
  | 'not_grant'
  /** A assinatura já tem dono: a pessoa resolveu, o e-mail só confundiria. */
  | 'already_claimed'
  /** Já agendamos para esta assinatura. O Asaas reentrega de propósito. */
  | 'already_noticed'
  /** Sem e-mail do pagador não há para quem mandar. */
  | 'no_payer_email'
  /** Sem lead não há token, e sem token o link não leva a lugar nenhum. */
  | 'no_lead';

export type NoticeDecision =
  | { schedule: false; reason: NoticeSkipReason }
  | { schedule: true; to: string; leadId: string; subscriptionId: string };

/**
 * Espera entre o `grant` e o e-mail.
 *
 * O piso é a escada da tela (~92s): abaixo disso o e-mail competiria com a
 * própria página, que ainda está tentando. O resto é a folga para quem chegou
 * ao formulário terminar de digitar a senha — e o cancelamento só acontece no
 * commit, ou seja, depois que ela escolheu a senha.
 *
 * O teto é o comprador: quanto mais tarde o aviso, mais perto da hora em que
 * ele desiste e liga para o banco. 15 minutos é folgado para o cadastro e ainda
 * é no mesmo minuto de atenção da compra.
 */
export const NOTICE_DELAY_MINUTES = 15;

/** Linha de subscriptions no que interessa para a decisão. */
export interface NoticeSubscriptionState {
  user_id?: string | null;
  orphan_notice_email_id?: string | null;
  /** E-mail do pagador já gravado, usado como reserva. Ver decideOrphanNotice. */
  email?: string | null;
}

/**
 * Decide se este evento agenda o aviso.
 *
 * `payerEmail` e `leadId` vêm do PATCH que o webhook acabou de montar (com
 * fallback no que já estava gravado), nunca de request: o destinatário é sempre
 * o e-mail que o Asaas informou para a cobrança.
 */
export function decideOrphanNotice(input: {
  action: string;
  subscriptionId: string | null;
  payerEmail: string | null | undefined;
  leadId: string | null | undefined;
  current: NoticeSubscriptionState | null;
}): NoticeDecision {
  // Só o evento que LIBERA acesso interessa. Renovação de quem já tem conta cai
  // no already_claimed logo abaixo.
  if (input.action !== 'grant') return { schedule: false, reason: 'not_grant' };

  // A trava mais importante: a pessoa já resolveu.
  if (input.current?.user_id) return { schedule: false, reason: 'already_claimed' };

  // IDEMPOTÊNCIA. O `id` do evento já barra a MESMA entrega em
  // payment_webhook_events, mas dois eventos DIFERENTES podem virar 'grant' para
  // a mesma assinatura. Esta coluna é o que garante um e-mail só. A chave de
  // idempotência mandada ao Resend é a segunda trava, para a corrida entre duas
  // entregas simultâneas — ver lib/resend.ts.
  if (input.current?.orphan_notice_email_id) {
    return { schedule: false, reason: 'already_noticed' };
  }

  // O e-mail DESTE evento tem precedência sobre o gravado (é o mesmo campo que o
  // patch está prestes a escrever), mas o gravado é reserva de verdade: a
  // consulta a GET /v3/customers pode ter falhado NESTE evento e o endereço já
  // ter chegado num anterior. Sem a reserva, uma indisponibilidade momentânea do
  // Asaas custaria o aviso inteiro.
  const to = (input.payerEmail ?? input.current?.email)?.trim().toLowerCase();
  if (!to) return { schedule: false, reason: 'no_payer_email' };

  const leadId = input.leadId?.trim();
  // Sem lead não dá para emitir o token assinado, e um /cadastro sem token não
  // sabe de quem é a volta. Mandar um link quebrado é pior que não mandar.
  if (!leadId) return { schedule: false, reason: 'no_lead' };

  if (!input.subscriptionId) return { schedule: false, reason: 'no_lead' };

  return { schedule: true, to, leadId, subscriptionId: input.subscriptionId };
}

/** Instante do envio, em ISO 8601 — o formato que o Resend aceita em scheduled_at. */
export function noticeSendAt(now: Date = new Date()): string {
  return new Date(now.getTime() + NOTICE_DELAY_MINUTES * 60_000).toISOString();
}
