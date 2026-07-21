# AbacatePay database rollout

This runbook is for the legacy snapshot where `public.subscriptions` exists
without `provider`, and the AbacatePay/leads/Stripe tables do not exist.

## Before the migration (read-only)

Run these queries and save only the results in a protected operator location:

```sql
select n.nspname, c.relname, c.relkind,
  case when c.relkind = 'v' then pg_get_viewdef(c.oid, true) end as view_definition
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'user_active_subscription';

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'subscriptions'
order by ordinal_position;

select status, count(*) as rows
from public.subscriptions group by status order by status;

select count(*) as subscriptions_total,
  count(*) filter (where user_id is null) as without_user,
  count(*) filter (where status in ('active', 'trialing')) as active_or_trialing
from public.subscriptions;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'user_credits'
order by ordinal_position;

select t.tgname, p.proname, pg_get_triggerdef(t.oid, true)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
```

Expected: `relkind = 'v'`, the old subscription columns are present, and
`user_credits` has `user_id`, `balance`, `monthly_allowance`, `period_start`,
`period_end`, and `updated_at`.

Export `select * from public.subscriptions order by id` and
`select * from public.user_credits order by user_id` to a protected local file;
do not paste the results into tickets or logs. Record counts by subscription
status and confirm every existing subscription
   is legacy Stripe test data. The migration preserves these rows and marks them
   `provider = 'stripe'`; it does not clean them.

## Migration

Run `supabase/migrations/20260721_abacatepay_secure_rollout.sql` once in the
Supabase SQL editor. It is one transaction and contains no Stripe cleanup.
Stop on any error. Expected results are: the old subscription row count is
unchanged, all old rows have `provider = 'stripe'`, `stripe_customer_id` is
nullable, the view remains a view, AbacatePay/leads tables exist, and the auth
triggers/RPC ACLs are installed.

## Postflight (read-only)

Run:

```sql
select provider, count(*) as rows
from public.subscriptions group by provider order by provider;

select count(*) as leads_rows from public.leads;
select count(*) as abacatepay_customers_rows from public.abacatepay_customers;
select count(*) as abacatepay_events_rows from public.abacatepay_webhook_events;

select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('consume_credits', 'refund_credits', 'refresh_credits',
                       'enforce_paid_signup', 'handle_new_user', 'plan_allowance')
order by routine_name;

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in ('consume_credits', 'refund_credits', 'refresh_credits',
                       'enforce_paid_signup', 'handle_new_user', 'plan_allowance')
order by routine_name, grantee;

select t.tgname, p.proname, pg_get_triggerdef(t.oid, true)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
```

Expected: the pre-migration subscription count is unchanged, all old rows are
`provider = 'stripe'`, the new tables exist, and both auth triggers are
present. The ACL query must show `consume_credits` only for `authenticated`;
`refund_credits` and `refresh_credits` only for `service_role`; auth trigger
functions only for the Supabase auth role.

## Separate cleanup

Only after the postflight and explicit confirmation that every Stripe row is
discardable, run `supabase/cleanup-stripe-test-data.sql` separately. It never
creates Stripe tables, tolerates missing `stripe_*` tables, and deletes only
`subscriptions where provider = 'stripe'`. Run its preflight and postflight
SELECTs; do not combine it with the migration.
