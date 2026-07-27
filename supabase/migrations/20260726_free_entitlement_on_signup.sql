-- 20260726_free_entitlement_on_signup.sql
--
-- ETAPA 6 / Fatia 3c — Entitlement 'free' EXPLÍCITO no ato da criação da conta.
--
-- ⚠️ ARQUIVO NOVO — Rafael precisa rodar no SQL Editor do Supabase.
--    NÃO altera 20260724 nem 20260725 (já aplicadas). Idempotente/reexecutável.
--
-- BUG (achado no banco de produção): a conta criada pelo cadastro FREE ficava
-- SEM linha em user_entitlements (e sem profiles). Motivo: user_entitlements só
-- ganhava linha via (a) trigger profiles_entitlement_default no INSERT de
-- profiles — mas profiles só nasce ao CONCLUIR o onboarding — ou (b)
-- subscriptions_entitlement_sync — que não roda no free. E o
-- on_auth_user_created/handle_new_user foi DROPADO em 20260721. Logo, no free
-- não havia evento que criasse o entitlement: 'free' virava "ausência de
-- registro", exatamente o que esta etapa existe para eliminar.
--
-- CORREÇÃO (foundation): trigger AFTER INSERT em auth.users que garante uma
-- linha user_entitlements(plan='free') para QUALQUER conta nova — free, pago e
-- qualquer caminho futuro. Para o pago, o entitlement começa 'free' e o
-- subscriptions_entitlement_sync o promove a 'pro' quando a assinatura é
-- reivindicada (comportamento já existente). Este trigger NUNCA concede 'pro'.
--
-- Segurança / não-regressão do fluxo pago:
--   • É AFTER INSERT — não interfere no gate BEFORE INSERT
--     enforce_paid_signup_precondition_trg (que valida o pago). Timings distintos.
--   • Insere só plan='free', on conflict do nothing — jamais rebaixa um pro nem
--     concede pro.
--   • Envolto em EXCEPTION WHEN OTHERS: uma falha aqui NUNCA aborta a criação do
--     usuário (quebraria free E pago). Na pior hipótese o entitlement fica para
--     o backfill/outros triggers e getEntitlement cai em 'free' (falha fechada).

begin;

create or replace function public.ensure_user_entitlement()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  begin
    insert into public.user_entitlements (user_id, plan)
    values (new.id, 'free')
    on conflict (user_id) do nothing;
  exception when others then
    -- Blindagem: nunca quebra o INSERT em auth.users (signup free e pago).
    null;
  end;
  return new;
end; $$;

revoke all on function public.ensure_user_entitlement() from public, anon, authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then execute 'grant execute on function public.ensure_user_entitlement() to supabase_auth_admin'; end if; end $$;

drop trigger if exists ensure_user_entitlement_trg on auth.users;
create trigger ensure_user_entitlement_trg after insert on auth.users for each row execute function public.ensure_user_entitlement();

-- Backfill: contas JÁ existentes sem entitlement (inclui a conta free que ficou
-- sem linha). plan='free'; NUNCA sobrescreve um registro existente (pro/free).
insert into public.user_entitlements (user_id, plan)
select u.id, 'free'
from auth.users u
where not exists (select 1 from public.user_entitlements e where e.user_id = u.id)
on conflict (user_id) do nothing;

commit;
