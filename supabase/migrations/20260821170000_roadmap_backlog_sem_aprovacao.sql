-- ROADMAP PÚBLICO — a sugestão do usuário entra DIRETO no Backlog.
--
-- ⚠️ ESTA MIGRATION SUBSTITUI A REGRA DE `20260821143000_roadmap_publico.sql`.
-- Quem ler as duas em sequência: vale ESTA. Lá, a policy
-- `roadmap_cards_suggest` exigia `approval = 'pending'` — a sugestão nascia
-- invisível e só entrava no quadro quando o admin aprovasse. Aqui ela passa a
-- exigir `approval = 'approved'`: nasce JÁ VISÍVEL no Backlog. É o modelo que o
-- Rafael pediu (21/08): qualquer autenticado põe a task no Backlog; sair do
-- Backlog para as outras 3 colunas continua sendo só do admin.
--
-- ── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────────
--   1. Recria `roadmap_cards_suggest` exigindo `approval = 'approved'`, ainda
--      em nome próprio (`auth.uid() = author_id`), ainda `status = 'backlog'` e
--      `position = 0`. O `with check` continua sendo o que impede alguém de
--      nascer em 'pronto' mandando o insert direto com a chave anon.
--   2. Troca o DEFAULT da coluna `approval` para 'approved', para o default e a
--      policy dizerem a mesma coisa — um insert sem `approval` explícito não
--      pode mais cair num valor que a própria policy recusa.
--   3. Atualiza o comentário da tabela, que ainda descrevia a regra antiga.
--
-- ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
--   • NÃO remove a coluna `approval` nem nenhum dos 3 valores. O conceito FICA:
--     'rejected' é como o admin tira spam do quadro sem apagar a linha (o card
--     some da leitura pública, o histórico e os votos continuam lá). O que muda
--     é só o PADRÃO — de "invisível até aprovar" para "visível até recusar".
--   • NÃO mexe na leitura pública: `roadmap_cards_public_read` continua
--     filtrando `approval = 'approved'`, e é justamente por isso que marcar
--     'rejected' continua tirando o card do quadro.
--   • NÃO cria policy de UPDATE nem de DELETE em `roadmap_cards`. Continua não
--     existindo nenhuma, de propósito: mover de coluna e recusar são atos de
--     admin, passam por rota de servidor que confere a allowlist de e-mail
--     (`lib/admin-auth.ts`) e só então usa service_role. Pelo caminho do
--     cliente, mudar o status de um card segue impossível.
--   • NÃO faz backfill dos cards que já estejam 'pending'. Aprovar em massa por
--     migration decidiria pelo admin o que ele ainda não olhou; esses poucos
--     cards continuam invisíveis e saem pela tela de /admin.
--   • NÃO toca em `roadmap_votes`: votar já exigia card aprovado, e agora o card
--     do usuário nasce aprovado — a regra não muda, o efeito é que dá para
--     votar na sugestão desde o primeiro instante.
--
-- Idempotente: pode rodar mais de uma vez.

begin;

alter table public.roadmap_cards
  alter column approval set default 'approved';

comment on table public.roadmap_cards is
  'Cards do roadmap público. Sugestão de usuário nasce approval=approved e já aparece no Backlog; approval=rejected é como o admin tira spam do quadro sem apagar a linha. Mover de coluna continua sendo só do admin.';

drop policy if exists roadmap_cards_suggest on public.roadmap_cards;
create policy roadmap_cards_suggest on public.roadmap_cards
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and approval = 'approved'
    and status = 'backlog'
    and position = 0
  );

commit;
