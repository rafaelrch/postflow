-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill de subscriptions.current_period_end a partir de next_due_date.
--
-- POR QUE ISTO EXISTE
-- `current_period_end` é a fonte única de "até quando o acesso vale" (ver o
-- bloco "QUAL COLUNA MANDA" em lib/asaas-webhook.ts), mas até agora NINGUÉM a
-- gravava: a data do fim do ciclo só existia em `next_due_date`. Com a coluna
-- sempre nula, o ramo 'end_of_cycle' do webhook lia NaN, concluía "não sobrou
-- ciclo pago" e derrubava o status na hora — ou seja, quem cancelava perdia
-- imediatamente o mês que já tinha pago, e /conta mostrava "Renova em —".
--
-- O código já foi corrigido e passa a gravar a coluna a cada evento. Este
-- backfill é para as assinaturas que JÁ EXISTEM: sem ele, uma linha antiga só
-- ganharia a data no próximo evento do Asaas — que para uma assinatura já
-- cancelada pode nunca chegar.
--
-- A CONVERSÃO
-- next_due_date é `date` (dia do calendário, sem hora). O dia da próxima
-- cobrança é o fim do período pago, então o instante é o FIM daquele dia no
-- horário de Brasília — o mesmo que endOfDayBrasilia() calcula do lado do
-- código. Ancorar em UTC encurtaria o acesso em 3 horas.
--
-- SEGURANÇA
-- Só toca linhas em que current_period_end É NULA: nada que já tenha data é
-- sobrescrito, e rodar duas vezes não muda nada além da primeira. Não inventa
-- data para quem não tem next_due_date — essas continuam nulas, e a tela
-- continua sem afirmar dia (o webhook trata null sem cortar acesso).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

update public.subscriptions
   set current_period_end =
         ((next_due_date + time '23:59:59.999') at time zone 'America/Sao_Paulo')
 where current_period_end is null
   and next_due_date is not null;

commit;
