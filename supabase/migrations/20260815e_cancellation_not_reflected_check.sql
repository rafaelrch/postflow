-- P2 parte C — alerta "cancelamento não refletido"
--
-- ── POR QUE UMA FUNÇÃO NOVA, E NÃO UM RAMO A MAIS EM admin_health_check ─────
-- Acrescentar um `when` à função existente exigiria um `create or replace` com
-- as onze regras inteiras copiadas. Duas coisas ruins nisso: 230 linhas
-- duplicadas que divergem no primeiro descuido, e — pior — a janela de deploy.
-- O código vai para produção no merge; a migration é aplicada à mão. Se o
-- código passasse a chamar uma função que ainda não existe, a aba Saúde
-- inteira quebraria até o Rafael rodar o SQL. Com uma função SEPARADA, só a
-- regra nova falha isoladamente (o card já sabe se apresentar assim) e as dez
-- antigas continuam intactas.
--
-- ── O QUE ESTA REGRA SEPARA DA `stale_webhook` ──────────────────────────────
-- São problemas diferentes, com urgências diferentes:
--   • `stale_webhook`      = o evento CHEGOU e não processou (problema de fila);
--   • esta                 = o Asaas diz cancelado e o NOSSO BANCO não sabe
--                            (problema de estado — é ela que infla o MRR).
-- Um evento pode estar pendente sem consequência nenhuma (foi o que aconteceu
-- em 14/08: o produto já tinha cancelado antes). E o estado pode divergir com
-- todos os eventos processados. Juntar os dois num alerta só faria o Rafael
-- ignorar os dois.
--
-- SOMENTE LEITURA, como todo o resto da aba: nada aqui altera assinatura,
-- acesso ou crédito.

begin;

create or replace function public.admin_health_cancellation_check(
  p_check_key text,
  p_now timestamptz default now(),
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  safe_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  case p_check_key
    when 'cancellation_not_reflected' then
      with cancel_events as (
        select
          coalesce(
            nullif(e.payload #>> '{subscription,id}', ''),
            nullif(e.payload #>> '{payment,subscription}', '')
          ) as subscription_id,
          max(e.received_at) as last_at,
          bool_or(e.processed_at is null) as has_pending
        from public.payment_webhook_events e
        where e.event_type in ('SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED')
        group by 1
      ), affected as (
        select
          s.id, s.email, c.last_at as occurred_at,
          -- Acesso vencido é o caso caro: o cliente segue usando e o número da
          -- Visão geral conta como receita recorrente.
          (s.current_period_end is not null and s.current_period_end < p_now) as expired,
          case
            when s.current_period_end is not null and s.current_period_end < p_now
              then 'Ativa após o fim do período pago'
            when c.has_pending then 'Cancelada no Asaas, evento ainda pendente'
            else 'Cancelada no Asaas, renovação ainda ligada aqui'
          end as detail
        from cancel_events c
        join public.subscriptions s on s.id = c.subscription_id
        where c.subscription_id is not null
          and s.status in ('active', 'trialing')
          and (
            coalesce(s.cancel_at_period_end, false) = false
            or (s.current_period_end is not null and s.current_period_end < p_now)
          )
      ), sample as (
        select * from affected order by occurred_at asc limit safe_limit
      )
      select jsonb_build_object(
        'count', (select count(*) from affected),
        'first_at', (select min(occurred_at) from affected),
        'last_at', (select max(occurred_at) from affected),
        'severity', case when exists(select 1 from affected where expired) then 'critical' else 'high' end,
        'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'record_key', id, 'email', email, 'occurred_at', occurred_at,
          'detail', detail, 'link_kind', 'customers'
        ) order by occurred_at) from sample), '[]'::jsonb)
      ) into result;

    else
      raise exception 'unknown_admin_health_check' using errcode='22023';
  end case;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_health_cancellation_check(text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.admin_health_cancellation_check(text, timestamptz, integer)
  to service_role;

commit;
