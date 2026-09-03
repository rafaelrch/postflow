-- ═══════════════════════════════════════════════════════════════════════════
-- LIMPEZA DO LIXO DE TESTE DA RODADA DE QA — 02/09/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Autorizado pelo Rafael: "pode remover o lixo de teste".
--
-- 🔴 QUEM RODA ESTE SCRIPT É O RAFAEL, PASSO A PASSO, LENDO ANTES DE CADA
--    BLOCO. Nenhum agente executou nada disto contra o banco — este arquivo
--    foi escrito lendo o SCHEMA (supabase/schema.sql e supabase/migrations/*),
--    não consultando produção.
--
-- POR QUE ELE EXISTE: o Supabase é um projeto só, sem staging. Todo teste de
-- pagamento criou usuário e assinatura REAIS, e eles estão contaminando os
-- números do /admin (total de usuários, assinaturas ativas, receita).
--
-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  🚫 NÃO COLE ESTE ARQUIVO INTEIRO NO SQL EDITOR.                      ║
-- ║                                                                       ║
-- ║  Colar tudo de uma vez é o modo ERRADO de usar, e já falhou: em       ║
-- ║  02/09/2026 o lote inteiro abortou num erro 42P01 numa LEITURA do     ║
-- ║  passo 0. Não se perdeu nada por sorte — o erro caiu antes dos        ║
-- ║  DELETEs. Se tivesse caído no meio deles, metade da limpeza estaria   ║
-- ║  feita e a outra metade não, sem ninguém saber qual metade.           ║
-- ║                                                                       ║
-- ║  O JEITO CERTO — um bloco por vez, lendo o resultado antes do         ║
-- ║  próximo:                                                             ║
-- ║    1. PASSO -1  → o mapa de existência. Diz o que existe de verdade.  ║
-- ║    2. PASSO 0   → o inventário. Mostra o alvo e o tamanho do lixo.    ║
-- ║    3. ENSAIO    → BEGIN … blocos 1 a 10 … VERIFICAÇÃO … ROLLBACK.     ║
-- ║                   Nada é gravado. Confira os números.                 ║
-- ║    4. VALENDO   → repita trocando ROLLBACK por COMMIT.                ║
-- ║    5. PASSO 11  → o usuário no auth, pelo painel.                     ║
-- ║    6. PASSO 12  → a pasta do storage.                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- DENTRO DE CADA BLOCO a regra é a mesma:
--   · rode PRIMEIRO o SELECT de conferência;
--   · olhe a contagem e as linhas. Se vier algo que você não reconhece como
--     lixo de QA, PARE;
--   · só então rode o DELETE daquele bloco.
--
-- ⚠️ POR QUE O PASSO -1 EXISTE (a lição de 02/09): a primeira versão deste
--    arquivo consultava `public.user_entitlements`, que NÃO EXISTE. Ela foi
--    criada em 20260724_free_plan_entitlement.sql e DESTRUÍDA depois em
--    20260812_asaas_migration.sql, quando o plano Free saiu — eu li o CREATE e
--    não vi o DROP posterior. O schema tem uma LINHA DO TEMPO: só a leitura na
--    ordem das migrations diz o que existe hoje. O passo -1 pergunta isso ao
--    banco, em vez de deduzir de arquivo.
--
-- ⚠️ POR QUE TANTA CERIMÔNIA: no ciclo anterior um agente apagou um carrossel
--    REAL durante um teste de exclusão, porque desligou uma proteção e não
--    conferiu o alvo antes de uma ação irreversível. Custou 25 créditos e uma
--    recriação. Cada DELETE aqui nasce precedido do SELECT que mostra o alvo.
--
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PARÂMETROS — confira estes dois valores antes de qualquer coisa
-- ───────────────────────────────────────────────────────────────────────────
-- Usuário de QA:  3e3af9ee-… (UUID completo você confirma no PASSO 0)
-- E-mail:         rafaelrocha250304+qa02set@gmail.com
--
-- O e-mail é a âncora mais segura: ele tem o sufixo "+qa02set", que NENHUMA
-- conta real usa. O UUID do LOG está abreviado ("3e3af9ee"), então o PASSO 0
-- resolve o UUID completo a partir do e-mail — em vez de você digitar um UUID
-- pela metade e acertar outro usuário.


-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO -1 — MAPA DE EXISTÊNCIA. Rode ISTO antes de tudo.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `to_regclass` devolve NULL em vez de estourar quando a tabela não existe —
-- é o mesmo padrão que 20260812_asaas_migration.sql usa para conferir a
-- migração (linhas 50 e 592). Esta consulta NUNCA falha, seja qual for o
-- estado do banco.
--
-- COMO LER: `null` na coluna = a tabela NÃO existe aqui. Anote quais deram
-- null e PULE os blocos correspondentes mais adiante.

select
  to_regclass('public.profiles')                   as profiles,
  to_regclass('public.projects')                   as projects,
  to_regclass('public.carousels')                  as carousels,
  to_regclass('public.slides')                     as slides,
  to_regclass('public.news_entries')               as news_entries,
  to_regclass('public.templates')                  as templates,
  to_regclass('public.assets')                     as assets,
  to_regclass('public.scheduled_posts')            as scheduled_posts,
  to_regclass('public.content_relations')          as content_relations;

select
  to_regclass('public.workspaces')                 as workspaces,
  to_regclass('public.workspace_members')          as workspace_members,
  to_regclass('public.workspace_brand_context')    as workspace_brand_context,
  to_regclass('public.user_workspace_preferences') as user_workspace_prefs,
  -- Criada em supabase/reels-schema.sql, que NÃO está em migrations/: pode
  -- nunca ter sido aplicada neste projeto. Esperado dar null.
  to_regclass('public.reels')                      as reels;

select
  to_regclass('public.subscriptions')              as subscriptions,
  to_regclass('public.payment_customers')          as payment_customers,
  to_regclass('public.payment_transactions')       as payment_transactions,
  to_regclass('public.payment_checkout_refs')      as payment_checkout_refs,
  to_regclass('public.payment_webhook_events')     as payment_webhook_events,
  to_regclass('public.leads')                      as leads,
  to_regclass('public.paid_signup_intents')        as paid_signup_intents,
  -- ☠️ ESTA TEM DE DAR NULL. Foi dropada em 20260812_asaas_migration.sql
  -- quando o plano Free saiu. Se vier NÃO-null, alguém a recriou e este
  -- script precisa ser revisto antes de rodar.
  to_regclass('public.user_entitlements')          as user_entitlements_MORTA;

select
  to_regclass('public.credit_ledger')              as credit_ledger,
  to_regclass('public.product_events')             as product_events,
  to_regclass('public.ai_generation_events')       as ai_generation_events,
  to_regclass('public.roadmap_cards')              as roadmap_cards,
  to_regclass('public.roadmap_votes')              as roadmap_votes;


-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 0 — INVENTÁRIO. Só leitura. Rode tudo e leia antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════

-- 0.1 — O ALVO EXISTE E É O QUE VOCÊ ESPERA?
-- Tem de voltar EXATAMENTE 1 linha, com o e-mail terminando em +qa02set@gmail.com.
select id, email, created_at, last_sign_in_at
from auth.users
where email = 'rafaelrocha250304+qa02set@gmail.com';

-- 0.2 — QUANTOS USUÁRIOS REAIS EXISTEM HOJE?
-- Anote este número. No fim do script ele tem de ter caído em EXATAMENTE 1.
select count(*) as usuarios_hoje from auth.users;

-- 0.3 — NENHUM OUTRO usuário de QA passou batido?
-- Se aparecer mais de um "+qa", decida um por vez: este script trata UM alvo.
select id, email, created_at
from auth.users
where email ilike '%+qa%' or email ilike '%teste%' or email ilike '%test%'
order by created_at desc;

-- 0.4 — O QUE ESSE USUÁRIO TEM, TABELA POR TABELA.
--
-- 🔴 POR QUE ISTO É UM BLOCO `DO` E NÃO UM `UNION` BONITO:
--    o UNION da primeira versão morria inteiro se UMA tabela faltasse, e foi
--    exatamente o que aconteceu. E `to_regclass` sozinho não resolve: o
--    PostgreSQL resolve as relações no PARSE, antes de executar, então
--    `where to_regclass(...) is not null and exists(select from x)` falha
--    igual — a tabela `x` precisa existir para a consulta sequer compilar.
--    A saída é SQL DINÂMICO: dentro do `EXECUTE format(...)` a relação só é
--    resolvida na hora, e o `to_regclass` antes dele decide se chega lá.
--    Resultado: tabela ausente vira um aviso e o inventário continua.
--
-- COMO LER: o resultado sai no painel de MENSAGENS/NOTICES do SQL Editor
-- (não na grade de resultados). Guarde: é contra ele que a verificação final
-- vai comparar.

do $$
declare
  v_email text := 'rafaelrocha250304+qa02set@gmail.com';
  v_uid   uuid;
  r       record;
  n       bigint;
  total   bigint := 0;
begin
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    raise notice '── ALVO NÃO ENCONTRADO para % — PARE e confira o e-mail.', v_email;
    return;
  end if;

  raise notice '── ALVO: % (uuid %)', v_email, v_uid;

  for r in
    select * from (values
      ('public.profiles',                   'id'),
      ('public.projects',                   'user_id'),
      ('public.carousels',                  'user_id'),
      ('public.news_entries',               'user_id'),
      ('public.templates',                  'user_id'),
      ('public.assets',                     'user_id'),
      ('public.scheduled_posts',            'user_id'),
      ('public.content_relations',          'user_id'),
      ('public.workspaces',                 'owner_id'),
      ('public.workspace_members',          'user_id'),
      ('public.user_workspace_preferences', 'user_id'),
      ('public.subscriptions',              'user_id'),
      ('public.credit_ledger',              'user_id'),
      ('public.product_events',             'user_id'),
      ('public.ai_generation_events',       'user_id'),
      ('public.payment_customers',          'user_id'),
      ('public.payment_transactions',       'user_id'),
      ('public.paid_signup_intents',        'user_id'),
      ('public.roadmap_votes',              'user_id'),
      ('public.roadmap_cards',              'author_id'),
      ('public.reels',                      'user_id')
    ) as t(tabela, coluna)
  loop
    if to_regclass(r.tabela) is null then
      raise notice '  % TABELA NÃO EXISTE — bloco correspondente deve ser PULADO', rpad(r.tabela, 34);
      continue;
    end if;
    execute format('select count(*) from %s where %I = $1', r.tabela, r.coluna)
      into n using v_uid;
    total := total + n;
    raise notice '  % %', rpad(r.tabela, 34), n;
  end loop;

  -- Slides são filhos de carousels, então a contagem passa pelo pai.
  if to_regclass('public.slides') is not null and to_regclass('public.carousels') is not null then
    execute 'select count(*) from public.slides s
             where s.carousel_id in (select id from public.carousels where user_id = $1)'
      into n using v_uid;
    total := total + n;
    raise notice '  % %', rpad('public.slides (via carousels)', 34), n;
  end if;

  raise notice '── TOTAL DE LINHAS DE LIXO: %', total;
end $$;


-- 0.5 — O QUE NÃO ESTÁ LIGADO AO USUÁRIO POR CHAVE, e por isso NÃO some sozinho.
-- `leads` não tem user_id nenhum: ele se liga ao usuário só pelo E-MAIL.
select 'lead' as o_que, id::text, email, created_at::text
from public.leads
where email = 'rafaelrocha250304+qa02set@gmail.com';

-- A ponte de checkout aponta para o LEAD, não para o usuário.
select 'checkout_ref' as o_que, r.checkout_session_id, r.lead_id::text, r.created_at::text
from public.payment_checkout_refs r
where r.lead_id in (select id from public.leads where email = 'rafaelrocha250304+qa02set@gmail.com');

-- O card do roadmap: `author_id` é ON DELETE SET NULL, então ele SOBREVIVE ao
-- apagamento do usuário, virando um card órfão no roadmap público.
select 'roadmap_card' as o_que, id::text, title, status, created_at::text
from public.roadmap_cards
where title ilike '%[QA]%' or title ilike '%teste automatizado%';


-- ═══════════════════════════════════════════════════════════════════════════
-- MAPA DE CASCATA — leia antes de rodar qualquer DELETE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Quase TUDO neste schema é `on delete cascade` a partir de auth.users(id).
-- Ou seja: apagar a linha do auth levaria junto, sozinho, praticamente tudo.
--
-- Mesmo assim este script apaga TABELA POR TABELA, na ordem, ANTES de tocar no
-- auth. Não é desperdício, é o ponto:
--   · cada DELETE explícito vem com um SELECT que mostra o alvo — a cascata não
--     mostra nada, ela só acontece;
--   · a cascata é definida por FKs que eu li nos ARQUIVOS de migration. Se a FK
--     em produção divergir do arquivo, a cascata pode alcançar mais do que se
--     espera. Apagando na mão, o raio de ação é o que você viu no SELECT;
--   · quando o auth.users for apagado no fim, não sobra nada para a cascata
--     levar. Ela vira rede de segurança, não mecanismo.
--
-- CASCATA (redundante depois dos passos explícitos, mas existe):
--   auth.users → profiles, projects, carousels→slides, news_entries, templates,
--                assets, scheduled_posts, content_relations, workspaces→
--                (workspace_members, workspace_brand_context),
--                user_workspace_preferences, subscriptions, user_entitlements,
--                credit_ledger, product_events, ai_generation_events,
--                payment_customers, paid_signup_intents, roadmap_votes, reels
--   leads      → payment_checkout_refs
--   carousels  → slides
--   workspaces → workspace_members, workspace_brand_context
--
-- NÃO CASCATEIA — some só se você apagar à mão:
--   · public.leads ................ não tem FK para auth.users (liga por e-mail)
--   · public.payment_transactions .. user_id/lead_id são SET NULL → a linha FICA,
--     órfã, e continua contando na financeira do /admin
--   · public.roadmap_cards ......... author_id é SET NULL → o card FICA
--   · public.payment_webhook_events  não tem FK de usuário (log do provedor)
--
-- ⚠️ BLOQUEIO POSSÍVEL: public.paid_signup_intents.consumed_by referencia
--    auth.users(id) SEM cláusula ON DELETE. O padrão é NO ACTION: se existir
--    linha com consumed_by = <alvo>, o DELETE em auth.users FALHA por violação
--    de FK. O passo 8 limpa isso antes.


-- ═══════════════════════════════════════════════════════════════════════════
-- ENSAIO — rode tudo dentro de transação e dê ROLLBACK na primeira vez
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Abra a transação, rode os blocos 1 a 9, rode a VERIFICAÇÃO, e termine com
-- ROLLBACK. Nada é gravado. Confira os números; se estiverem certos, repita
-- trocando ROLLBACK por COMMIT.
--
-- 🔴 NÃO deixe a transação aberta e vá fazer outra coisa: transação aberta
--    segura locks e é assim que aparece o `40P01 deadlock detected` que já
--    ocorreu neste projeto. Se der deadlock, é OUTRA SESSÃO lendo as mesmas
--    tabelas — peça aos agentes para saírem do banco e rode de novo.

begin;


-- ───────────────────────────────────────────────────────────────────────────
-- 1. AGENDAMENTOS  (filho de carousels e news_entries — sai primeiro)
-- ───────────────────────────────────────────────────────────────────────────
select id, kind, status, scheduled_at, carousel_id
from public.scheduled_posts
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.scheduled_posts
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ───────────────────────────────────────────────────────────────────────────
-- 2. RELAÇÕES DE CONTEÚDO  (apontam para carrosséis/news por id solto)
-- ───────────────────────────────────────────────────────────────────────────
select id, source_type, target_type
from public.content_relations
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.content_relations
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ───────────────────────────────────────────────────────────────────────────
-- 3. SLIDES E CARROSSÉIS
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTE É O BLOCO DO INCIDENTE ANTERIOR. Leia a lista de títulos com atenção:
--    tem de conter só o Atelier de teste (texto longo estourando) e o FlowLine
--    de 1 slide. Se aparecer QUALQUER carrossel que você reconheça como seu
--    trabalho de verdade, PARE — o alvo está errado.
select c.id, c.title, c.style, c.status, c.created_at,
       (select count(*) from public.slides s where s.carousel_id = c.id) as slides
from public.carousels c
where c.user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
order by c.created_at;

-- `slides.carousel_id` é ON DELETE CASCADE: este DELETE é REDUNDANTE, o de
-- baixo já levaria os slides. Está aqui para o número aparecer no seu console.
delete from public.slides
where carousel_id in (
  select id from public.carousels
  where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
);

delete from public.carousels
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ───────────────────────────────────────────────────────────────────────────
-- 4. NEWS, TEMPLATES SALVOS E ASSETS  (linhas de banco; os ARQUIVOS saem no 10)
-- ───────────────────────────────────────────────────────────────────────────
select 'news_entries' as tabela, id::text, title from public.news_entries
  where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
union all
select 'templates', id::text, coalesce(name, '(sem nome)') from public.templates
  where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
union all
select 'assets', id::text, coalesce(public_url, '(sem url)') from public.assets
  where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.news_entries where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');
delete from public.templates    where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');
delete from public.assets       where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ───────────────────────────────────────────────────────────────────────────
-- 5. WORKSPACES  ("QA Teste")
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Confira o NOME antes: só pode aparecer o workspace de QA. Se um workspace
--    seu de verdade estiver nesta lista, o alvo está errado — PARE.
select w.id, w.name, w.status, w.created_at,
       (select count(*) from public.workspace_members m where m.workspace_id = w.id) as membros
from public.workspaces w
where w.owner_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

-- A preferência aponta para o workspace (SET NULL), então sai antes por higiene.
delete from public.user_workspace_preferences
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

-- `workspace_members` e `workspace_brand_context` são CASCADE de workspaces:
-- os dois DELETEs abaixo são REDUNDANTES, e existem para mostrar a contagem.
delete from public.workspace_brand_context
where workspace_id in (select id from public.workspaces where owner_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com'));

delete from public.workspace_members
where workspace_id in (select id from public.workspaces where owner_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com'));

-- O usuário de QA pode ser MEMBRO de um workspace que não é dele. Esta linha
-- tira só a associação; o workspace do dono legítimo não é tocado.
delete from public.workspace_members
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.workspaces
where owner_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

-- `projects` referencia workspaces e auth.users; sai depois dos filhos acima.
delete from public.projects
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ───────────────────────────────────────────────────────────────────────────
-- 5b. REELS  (a tabela existe mesmo com a funcionalidade desligada)
-- ───────────────────────────────────────────────────────────────────────────
-- `public.reels` é criada por supabase/reels-schema.sql e tem user_id com
-- CASCADE de auth.users. A funcionalidade está desligada por REELS_ENABLED,
-- mas a TABELA existe e pode ter recebido linha em algum teste antigo.
-- ⚠️ `reels-schema.sql` NÃO está em migrations/, então pode nunca ter sido
--    aplicado neste projeto — o passo -1 diz. Por isso este bloco é blindado:
--    se a tabela não existir, ele avisa e segue, em vez de abortar o lote.
do $$
declare
  v_uid uuid;
  n     bigint;
begin
  select id into v_uid from auth.users
   where email = 'rafaelrocha250304+qa02set@gmail.com';

  if to_regclass('public.reels') is null then
    raise notice 'reels: tabela não existe neste projeto — bloco pulado.';
    return;
  end if;

  execute 'select count(*) from public.reels where user_id = $1' into n using v_uid;
  raise notice 'reels: % linha(s) do usuário de QA. Apagando…', n;

  execute 'delete from public.reels where user_id = $1' using v_uid;
  get diagnostics n = row_count;
  raise notice 'reels: % linha(s) apagada(s).', n;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6. CRÉDITOS, EVENTOS E TELEMETRIA  (é o que suja os números do /admin)
-- ───────────────────────────────────────────────────────────────────────────
select 'credit_ledger' as tabela, count(*) from public.credit_ledger
  where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
union all select 'product_events', count(*) from public.product_events
  where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
union all select 'ai_generation_events', count(*) from public.ai_generation_events
  where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.credit_ledger        where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');
delete from public.product_events       where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');
delete from public.ai_generation_events where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ───────────────────────────────────────────────────────────────────────────
-- 7. ASSINATURA E PAGAMENTO
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 APAGAR A LINHA AQUI NÃO CANCELA NADA NO ASAAS.
--    A assinatura está ATIVA até 03/10 no provedor (sandbox). O banco é só o
--    espelho local. Se você apagar a linha e não cancelar no Asaas, o webhook
--    da próxima cobrança pode chegar e RECRIAR estado para um usuário que não
--    existe mais — e aí sobra lixo novo, mais difícil de achar.
--    CANCELE PRIMEIRO NO PAINEL DO ASAAS, depois rode este bloco.
--    (Sandbox: nenhum dinheiro real está envolvido, mas o webhook é real.)
select s.id as assinatura_no_asaas, s.status, s.email, s.current_period_end
from public.subscriptions s
where s.user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

-- payment_transactions NÃO cascateia (SET NULL): sem este DELETE a transação
-- fica órfã e continua somando na financeira do /admin.
select provider_payment_id, status, gross_value, created_at
from public.payment_transactions
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
   or lead_id in (select id from public.leads where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.payment_transactions
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
   or lead_id in (select id from public.leads where email = 'rafaelrocha250304+qa02set@gmail.com');

-- ☠️ `public.user_entitlements` NÃO EXISTE MAIS e por isso NÃO aparece aqui.
--    A primeira versão deste script a consultava e derrubou o lote do Rafael
--    com 42P01 em 02/09/2026. Ela foi criada em 20260724_free_plan_entitlement
--    e DROPADA em 20260812_asaas_migration.sql quando o plano Free saiu.
--    Se o passo -1 mostrar que ela voltou a existir, PARE: alguém a recriou e
--    este script precisa ser revisto antes de rodar.
delete from public.payment_customers  where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');
delete from public.subscriptions      where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ───────────────────────────────────────────────────────────────────────────
-- 8. LEAD, PONTE DE CHECKOUT E O BLOQUEIO DO auth.users
-- ───────────────────────────────────────────────────────────────────────────
-- O lead NÃO tem FK para auth.users: ele se liga só pelo e-mail, e por isso
-- sobreviveria a tudo o que veio antes.
select id, name, email, phone, plan_interval, created_at
from public.leads
where email = 'rafaelrocha250304+qa02set@gmail.com';

-- `payment_checkout_refs.lead_id` é CASCADE de leads: este DELETE é REDUNDANTE
-- (o de baixo já levaria), e está aqui para a contagem aparecer.
delete from public.payment_checkout_refs
where lead_id in (select id from public.leads where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.leads
where email = 'rafaelrocha250304+qa02set@gmail.com';

-- ⚠️ O BLOQUEIO: paid_signup_intents.consumed_by referencia auth.users SEM
--    ON DELETE. Se sobrar linha apontando para o alvo, o passo 9 falha com
--    violação de FK. Some com as duas pontas aqui.
select id, subscription_id, user_id, consumed_by, consumed_at
from public.paid_signup_intents
where user_id    = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
   or consumed_by = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.paid_signup_intents
where user_id    = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
   or consumed_by = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ───────────────────────────────────────────────────────────────────────────
-- 9. ROADMAP  (o card sobrevive ao usuário — author_id é SET NULL)
-- ───────────────────────────────────────────────────────────────────────────
select id, title, status, author_id, created_at
from public.roadmap_cards
where title ilike '%[QA]%' or title ilike '%teste automatizado%';

-- `roadmap_votes.card_id` é CASCADE do card: redundante, mostra a contagem.
delete from public.roadmap_votes
where card_id in (select id from public.roadmap_cards where title ilike '%[QA]%' or title ilike '%teste automatizado%');

-- Votos que o usuário de QA deu em cards LEGÍTIMOS: sai o voto, o card fica.
delete from public.roadmap_votes
where user_id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

-- ⚠️ Confira o título antes: só o card de QA. O `ilike '%[QA]%'` é estreito de
--    propósito, mas leia a lista do SELECT acima mesmo assim.
delete from public.roadmap_cards
where title ilike '%[QA]%' or title ilike '%teste automatizado%';


-- ───────────────────────────────────────────────────────────────────────────
-- 10. PERFIL
-- ───────────────────────────────────────────────────────────────────────────
-- CASCADE de auth.users: redundante se você for apagar o usuário no passo 11.
-- Se optar por NÃO apagar o auth (ver a recomendação), este DELETE é o que
-- limpa os dados de marca/onboarding do teste.
select id, name, handle, brand_name, onboarding_completed
from public.profiles
where id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');

delete from public.profiles
where id = (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com');


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — ainda dentro da transação, ANTES de decidir commit
-- ═══════════════════════════════════════════════════════════════════════════

-- V1 — o lixo saiu? Tudo tem de vir ZERO.
with alvo as (select id from auth.users where email = 'rafaelrocha250304+qa02set@gmail.com')
select 'profiles' as tabela, count(*) from public.profiles where id in (select id from alvo)
union all select 'carousels',            count(*) from public.carousels            where user_id in (select id from alvo)
union all select 'workspaces',           count(*) from public.workspaces           where owner_id in (select id from alvo)
union all select 'subscriptions',        count(*) from public.subscriptions        where user_id in (select id from alvo)
union all select 'credit_ledger',        count(*) from public.credit_ledger        where user_id in (select id from alvo)
union all select 'product_events',       count(*) from public.product_events       where user_id in (select id from alvo)
union all select 'payment_transactions', count(*) from public.payment_transactions where user_id in (select id from alvo)
union all select 'leads (por e-mail)',   count(*) from public.leads                where email = 'rafaelrocha250304+qa02set@gmail.com'
union all select 'roadmap_cards [QA]',   count(*) from public.roadmap_cards        where title ilike '%[QA]%'
order by 1;

-- V2 — E O MAIS IMPORTANTE: NADA DE VERDADE FOI JUNTO?
-- Compare com o que você anotou no PASSO 0. Estes números NÃO podem ter caído.
select
  (select count(*) from auth.users)                                          as usuarios_total,
  (select count(*) from public.carousels)                                    as carrosseis_total,
  (select count(*) from public.workspaces)                                   as workspaces_total,
  (select count(*) from public.subscriptions where status = 'active')        as assinaturas_ativas,
  (select count(*) from public.roadmap_cards)                                as roadmap_cards_total;

-- V3 — os carrosséis que SOBRARAM são de quem?
-- Todos têm de pertencer a você. Se aparecer um user_id que não reconhece,
-- não commite — investigue.
select c.user_id, u.email, count(*) as carrosseis
from public.carousels c
join auth.users u on u.id = c.user_id
group by c.user_id, u.email
order by 3 desc;

-- V4 — sobrou linha órfã de pagamento?
select count(*) as transacoes_sem_dono
from public.payment_transactions
where user_id is null and lead_id is null;


-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DA TRANSAÇÃO — escolha UMA
-- ═══════════════════════════════════════════════════════════════════════════

rollback;   -- ← ENSAIO: nada é gravado. Use este na primeira passada.
-- commit;  -- ← VALENDO: descomente só depois de conferir V1, V2, V3 e V4.


-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 11 — O USUÁRIO NO auth.users. FORA DA TRANSAÇÃO, E POR ÚLTIMO.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- RECOMENDAÇÃO: APAGAR, não anonimizar. O motivo:
--
--   · o objetivo declarado desta limpeza é descontaminar os NÚMEROS do /admin.
--     Anonimizar resolveria o dado pessoal, mas o usuário continuaria contado
--     em "total de usuários" — ou seja, não resolveria o problema que motivou
--     a tarefa;
--   · não é um cliente real cujo histórico precise ser preservado. É uma conta
--     criada por nós, num teste, com e-mail "+qa02set";
--   · depois dos passos 1 a 10 não sobra nada pendurado nele, então a cascata
--     do auth não tem o que levar. O raio de ação é vazio — que é justamente
--     o efeito procurado.
--
-- SE PREFERIR NÃO APAGAR (e é uma escolha defensável, porque apagar é
-- irreversível), a alternativa é deixar a conta existir sem poder ser usada:
-- os passos 1 a 10 já removeram tudo o que ela tinha, e você bloqueia o acesso
-- pelo painel. Mas conte com ela aparecendo no total de usuários do /admin.
--
-- COMO APAGAR — pelo PAINEL, não por SQL:
--   Authentication → Users → busca "+qa02set" → Delete user.
--
--   Por que não `delete from auth.users`: essa tabela pertence ao
--   `supabase_auth_admin`, não ao seu papel no SQL Editor. Operações nela pelo
--   Editor já deram `42501: must be owner of table users` neste projeto (foi o
--   caso ao tentar criar índice). O painel usa a Admin API, que é o caminho
--   suportado — e ele também limpa `auth.identities` e `auth.sessions`, que um
--   DELETE na tabela não necessariamente limpa.
--
-- ANTES DE APAGAR, confirme mais uma vez que é a conta certa:
select id, email, created_at, last_sign_in_at
from auth.users
where email = 'rafaelrocha250304+qa02set@gmail.com';

-- DEPOIS DE APAGAR, o número tem de ter caído em EXATAMENTE 1 em relação ao
-- que você anotou no passo 0.2:
select count(*) as usuarios_depois from auth.users;


-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 12 — STORAGE. NENHUM DELETE DE TABELA APAGA ARQUIVO.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Os uploads vão para o bucket `postflow-assets`, e o caminho SEMPRE começa
-- pelo UUID do usuário:
--
--     <user_id>/carousel-images/<slide>-<timestamp>.png   (imagens geradas por IA)
--     <user_id>/brand-logo/<timestamp>.<ext>              (logo da marca)
--     <user_id>/<pasta>/<timestamp>-<rand>.<ext>          (uploads em geral)
--
-- (Fonte: lib/upload-image.ts, app/api/generate-image/route.ts e
--  app/(app)/news/page.tsx — todos montam o path com `${userId}/`.)
--
-- LOGO: limpar o storage é apagar a PASTA do UUID inteira. Uma pasta só.
--
-- COMO FAZER — pelo painel:
--   Storage → postflow-assets → localize a pasta com o UUID do usuário de QA
--   → selecione → Delete.
--
-- ⚠️ FAÇA ISTO ANTES DE APAGAR O USUÁRIO no passo 11, ou anote o UUID: depois
--    de apagado, não há mais como descobrir qual pasta era dele — o nome da
--    pasta é a única ligação, e ela não está em lugar nenhum do banco.
--
-- Este SELECT lista as URLs que apontavam para o bucket, e serve de conferência
-- do que deve ter sumido (rode ANTES do passo 4, ou em transação com rollback):
--   select url from public.assets where user_id = <alvo>;
--   select background_image_url, grid_image_url
--     from public.slides where carousel_id in (...);
--
-- O bucket é PÚBLICO: enquanto o arquivo existir, a URL continua aberta, mesmo
-- sem nenhuma linha no banco apontando para ela.


-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE ESTE SCRIPT NÃO FAZ, de propósito
-- ═══════════════════════════════════════════════════════════════════════════
--
-- · não cancela a assinatura no Asaas — isso é no painel do provedor, e tem de
--   vir ANTES do passo 7 (ver o aviso lá);
-- · não mexe em `public.payment_webhook_events`. É o log cru do provedor,
--   chaveado por `event_id`, sem FK de usuário. Serve de trilha de auditoria e
--   apagar não melhora número nenhum do /admin. Se quiser limpar, é decisão
--   separada e precisa de outro filtro (o payload é jsonb);
-- · não toca em `passwordless_rate_limits` nem em `passwordless_ref_rate_limits`:
--   são janelas de rate limit por hash de IP/ref, expiram sozinhas e não têm
--   ligação com usuário;
-- · não apaga NADA por "parecer de teste". Todo filtro deste arquivo é o e-mail
--   exato do QA, o UUID resolvido a partir dele, ou o título do card de QA.
