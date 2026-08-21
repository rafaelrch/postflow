-- ROADMAP PÚBLICO — quadro de 4 colunas com voto e sugestão do usuário.
--
-- ── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────────
--   1. `roadmap_cards`  — os cards do quadro. 4 status fixos (as 4 colunas),
--      um estado de aprovação e a ordem dentro da coluna.
--   2. `roadmap_votes`  — um voto por (card, usuário), com UNIQUE de verdade.
--   3. RLS nas duas, no padrão das policies que já existem no schema.
--
-- ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
--   • NÃO cria tabela de papéis nem coluna de admin. Nesta árvore o admin é uma
--     ALLOWLIST DE E-MAIL em `lib/admin-auth.ts` (env ADMIN_EMAILS, fail
--     closed) — leia o comentário no topo daquele arquivo, é decisão
--     registrada. O BANCO NÃO SABE quem é admin, e nenhuma policy aqui tenta
--     adivinhar. Por isso as duas operações privilegiadas (mudar status,
--     aprovar/recusar) NÃO têm policy nenhuma: são NEGADAS para anon e
--     authenticated, sem exceção, e passam por rota de servidor que confere
--     `requireAdmin()` e só então usa o cliente service_role.
--   • NÃO cria comentários. Esta entrega é SÓ VOTO (decisão do Rafael, 21/08).
--   • NÃO torna as colunas configuráveis. As 4 são fixas, no CHECK.
--   • NÃO faz backfill e NÃO insere card de exemplo: o quadro nasce vazio e o
--     primeiro conteúdo entra pelo /admin.
--   • NÃO serve a CONTAGEM de votos para o browser. A policy de `roadmap_votes`
--     deixa cada um ver só o PRÓPRIO voto — de propósito, para a contagem nunca
--     expor QUEM votou. O total é agregado no servidor
--     (`lib/roadmap.ts::loadRoadmapBoard`), que devolve número e nunca identidade.
--
-- ── CONTA APAGADA ───────────────────────────────────────────────────────────
-- Os dois lados são deliberadamente diferentes:
--   • `roadmap_cards.author_id` é `on delete set null` — um card aprovado é
--     conteúdo público em que outras pessoas já votaram. Apagar a conta do autor
--     não pode apagar o card e zerar o voto de terceiros. A autoria some, o
--     card fica (por isso a coluna é nullable).
--   • `roadmap_votes.user_id` é `on delete cascade` — voto é pessoal e não tem
--     sentido sem o votante. Sumindo a conta, o voto sai e a contagem cai em 1.
--
-- Idempotente: pode rodar mais de uma vez.

begin;

-- ── CARDS ───────────────────────────────────────────────────────────────────

create table if not exists public.roadmap_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  -- As 4 colunas do quadro, FIXAS. A chave é o valor gravado; o rótulo de
  -- interface ("Estamos cozinhando") mora no código e pode mudar sem migration.
  status text not null default 'backlog'
    check (status in ('backlog', 'faremos', 'cozinhando', 'pronto')),
  -- Sugestão de usuário NASCE 'pending' e só entra no quadro público quando o
  -- admin aprova. Roadmap com escrita aberta é mural de spam.
  approval text not null default 'pending'
    check (approval in ('pending', 'approved', 'rejected')),
  author_id uuid references auth.users(id) on delete set null,
  -- Ordem DENTRO da coluna. Inteiro simples: a reordenação é do admin e o
  -- volume é baixo; não vale um índice fracionário aqui.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmap_cards_title_len check (char_length(title) between 5 and 120),
  constraint roadmap_cards_description_len check (char_length(description) <= 2000)
);

comment on table public.roadmap_cards is
  'Cards do roadmap público. Sugestão de usuário nasce approval=pending e só aparece no quadro depois que o admin aprova.';

create index if not exists idx_roadmap_cards_board
  on public.roadmap_cards (approval, status, position);
create index if not exists idx_roadmap_cards_author
  on public.roadmap_cards (author_id);

drop trigger if exists set_roadmap_cards_updated on public.roadmap_cards;
create trigger set_roadmap_cards_updated
  before update on public.roadmap_cards
  for each row execute function public.set_updated_at();

-- ── VOTOS ───────────────────────────────────────────────────────────────────

create table if not exists public.roadmap_votes (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.roadmap_cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- A trava do voto único é ESTA, não a UI. O botão pode ser clicado duas vezes,
  -- a requisição pode ser repetida na mão, o cliente pode estar fora de sincronia.
  constraint roadmap_votes_card_user_key unique (card_id, user_id)
);

comment on table public.roadmap_votes is
  'Um voto por (card, usuário). O UNIQUE é a trava real do voto único; a UI é só conveniência.';

create index if not exists idx_roadmap_votes_card on public.roadmap_votes (card_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.roadmap_cards enable row level security;
alter table public.roadmap_votes enable row level security;

-- Leitura pública do quadro: SÓ o que o admin aprovou. Card 'pending' ou
-- 'rejected' é invisível para todo mundo pela chave anon — inclusive para o
-- próprio autor, que nesta fatia não tem tela de "minhas sugestões".
drop policy if exists roadmap_cards_public_read on public.roadmap_cards;
create policy roadmap_cards_public_read on public.roadmap_cards
  for select using (approval = 'approved');

-- Sugerir: só autenticado, só em nome de si mesmo, e só no estado inicial.
-- O `with check` é o que impede alguém de nascer aprovado ou já em 'pronto'
-- mandando o insert direto com a chave anon.
drop policy if exists roadmap_cards_suggest on public.roadmap_cards;
create policy roadmap_cards_suggest on public.roadmap_cards
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and approval = 'pending'
    and status = 'backlog'
    and position = 0
  );

-- ⚠️ NÃO existe policy de UPDATE nem de DELETE em `roadmap_cards`, de propósito.
-- Com RLS ligada e sem policy, as duas operações são negadas para anon e
-- authenticated — inclusive para o AUTOR sobre o próprio card. Mover de coluna e
-- aprovar/recusar são atos de admin, e o banco não sabe quem é admin: passam por
-- `app/api/roadmap/admin/route.ts`, que confere a allowlist e usa service_role.

-- Cada um enxerga SÓ o próprio voto. É isto que faz a contagem não poder ser
-- usada para descobrir quem votou: nem lendo a tabela inteira pela chave anon
-- alguém monta a lista de votantes de um card.
drop policy if exists roadmap_votes_own on public.roadmap_votes;
create policy roadmap_votes_own on public.roadmap_votes
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists roadmap_votes_insert_own on public.roadmap_votes;
create policy roadmap_votes_insert_own on public.roadmap_votes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    -- Não se vota no que não está no quadro.
    and exists (
      select 1 from public.roadmap_cards c
      where c.id = card_id and c.approval = 'approved'
    )
  );

-- Desfazer o voto é apagar a própria linha. Só a sua.
drop policy if exists roadmap_votes_delete_own on public.roadmap_votes;
create policy roadmap_votes_delete_own on public.roadmap_votes
  for delete to authenticated
  using (auth.uid() = user_id);

-- ── GRANTS ──────────────────────────────────────────────────────────────────
-- RLS filtra LINHA; o grant decide se a tabela é alcançável. Os dois juntos.

revoke all on table public.roadmap_cards from public, anon, authenticated;
grant select on table public.roadmap_cards to anon, authenticated;
grant insert on table public.roadmap_cards to authenticated;
grant all on table public.roadmap_cards to service_role;

revoke all on table public.roadmap_votes from public, anon, authenticated;
grant select, insert, delete on table public.roadmap_votes to authenticated;
grant all on table public.roadmap_votes to service_role;

commit;
