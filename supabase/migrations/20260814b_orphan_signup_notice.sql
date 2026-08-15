-- 20260814b_orphan_signup_notice.sql
--
-- Aviso de PAGAMENTO ÓRFÃO: marca em subscriptions que já avisamos quem pagou e
-- não conseguiu criar a conta.
--
-- ── O PROBLEMA ──────────────────────────────────────────────────────────────
--
-- O produto é pagamento-primeiro: quando PAYMENT_CONFIRMED chega, a conta ainda
-- não existe (user_id null). A tela de /cadastro espera o webhook por ~92s e
-- desiste. Se o webhook demorar mais — instabilidade do Asaas, nossa função
-- fora do ar, a fila deles pausada por 15 falhas seguidas — a pessoa pagou e
-- não consegue criar a conta, e ninguém é avisado. O webhook passa a agendar um
-- e-mail ("seu acesso está pronto, clique para criar sua conta") pela API do
-- Resend, cancelado se ela aparecer antes da hora.
--
-- ── POR QUE UMA COLUNA, E NÃO SÓ A CHAVE DE IDEMPOTÊNCIA DO RESEND ──────────
--
-- O Asaas reentrega o mesmo evento DE PROPÓSITO, e dois eventos DIFERENTES
-- podem virar 'grant' para a mesma assinatura (o `id` do evento, que
-- payment_webhook_events já deduplica, não cobre esse caso). Esta coluna é a
-- trava primária do "um e-mail só"; a Idempotency-Key mandada ao Resend é a
-- segunda linha, para duas entregas correndo em paralelo.
--
-- Ela guarda o ID DO E-MAIL, não um booleano, porque o id é o que permite
-- CANCELAR o agendamento quando a pessoa termina o cadastro dentro da janela —
-- que é o caso comum e feliz. Um booleano marcaria "avisado" sem dar o meio de
-- desmarcar.
--
-- Idempotente: pode rodar mais de uma vez sem estrago.

-- Id do e-mail agendado no Resend. NULL = nunca avisamos esta assinatura.
alter table public.subscriptions
  add column if not exists orphan_notice_email_id text;

-- Quando agendamos. Não é lido por regra nenhuma: é rastro para conciliação
-- ("quantos pagamentos ficaram órfãos esta semana?"), a mesma função que
-- next_due_date e subscription_status cumprem para o resto do webhook.
alter table public.subscriptions
  add column if not exists orphan_notice_at timestamptz;

comment on column public.subscriptions.orphan_notice_email_id is
  'Id do e-mail agendado no Resend avisando que o acesso está pronto e a conta '
  'ainda não foi criada. NULL = nunca agendado. Preenchido significa AGENDADO, '
  'não entregue: se a pessoa concluir o cadastro dentro da janela, o commit de '
  'signup-intent cancela o envio e a coluna permanece preenchida (quem recebeu '
  'de fato está nos logs do Resend). Guarda o id, e não um booleano, porque é '
  'ele que permite esse cancelamento. Ver lib/orphan-signup-notice.ts.';

comment on column public.subscriptions.orphan_notice_at is
  'Instante em que o aviso de pagamento órfão foi agendado. Rastro de '
  'conciliação; nenhuma regra lê esta coluna.';

-- "Quais pagamentos ficaram órfãos e foram avisados?" — a pergunta de
-- conciliação, e a fila de diagnóstico de quem pagou e sumiu. Parcial: a
-- esmagadora maioria das linhas tem a coluna nula e não precisa entrar no
-- índice.
create index if not exists idx_subscriptions_orphan_notice
  on public.subscriptions (orphan_notice_at desc)
  where orphan_notice_email_id is not null;

-- RLS não muda: subscriptions já tem policy só de SELECT do próprio usuário, e
-- toda escrita continua nascendo no webhook via service role. As duas colunas
-- herdam isso — nenhuma policy nova é necessária, e o dono da assinatura pode
-- ler o id do e-mail dele sem consequência (não é segredo nem credencial).
