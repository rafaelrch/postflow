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
`provider = 'stripe'`, the new tables and `paid_signup_intents` exist, and
`claim_on_email_confirmation_trg` is present on `auth.users` with the
`email_confirmed_at` transition guard. A signup confirmation can only be
resent after `prepare_paid_signup_intent` accepts a user whose final
`raw_app_meta_data.origin` is `paid_passwordless`.
`enforce_paid_signup_precondition_trg` must also be present as a BEFORE INSERT
gate; it blocks user creation unless an active, unclaimed AbacatePay subscription
already exists for that email. The obsolete `enforce_paid_passwordless_marker_trg`
must be gone (run `20260722_replace_marker_with_paid_precondition.sql`); future
Free flows require a separately authorized precondition and trigger.
The ACL query must show `consume_credits` only for `authenticated`;
`refund_credits` and `refresh_credits` only for `service_role`; auth trigger
functions only for the Supabase auth role.

## Separate cleanup

Only after the postflight and explicit confirmation that every Stripe row is
discardable, run `supabase/cleanup-stripe-test-data.sql` separately. It never
creates Stripe tables, tolerates missing `stripe_*` tables, and deletes only
`subscriptions where provider = 'stripe'`. Run its preflight and postflight
SELECTs; do not combine it with the migration.

## Passwordless B2 configuration (manual)

Configure Supabase Custom SMTP with Resend (`smtp.resend.com`, user `resend`,
password entered only in the dashboard), customize the **Confirm signup**
template with its confirmation link, and keep the Supabase Email provider
enabled. Keep **Allow new users to sign up** disabled. Verify
`enforce_paid_signup_precondition_trg` is installed; any user creation without a
matching active, unclaimed AbacatePay subscription fails in that trigger with
`paid_subscription_required`.
Allowlist only the fixed callback, verify the Resend domain,
configure rate limits/CAPTCHA, and revoke any previously exposed key. No
Resend SDK or API key is stored in the app.

Runtime: validate ref/subscription, re-read checkout by the original ref,
resolve the server-side email, then call
`admin.createUser({ email, email_confirm: false, app_metadata: { origin:
'paid_passwordless' } })`. Only a successful creation or the strict
`email_exists`/`user_already_exists` retry cases may continue. Next call
`prepare_paid_signup_intent`; its **final** definition is marker-only, so a
legacy/attacker-created user without `raw_app_meta_data.origin =
'paid_passwordless'` fails closed and no email is sent. Only after state
`pending`/`claimed`, call `auth.resend({ type: 'signup', email, options: {
emailRedirectTo: appUrl('/definir-senha') } })`. Do not use
`inviteUserByEmail`, `signInWithOtp`, or mutate an existing user.

## Mandatory hosted smoke — create → prepare → resend

Mocks are not sufficient to prove the hosted GoTrue behavior. Before merge or
production promotion, run one hosted smoke with public signup disabled and
record evidence that:

1. a PAID subscription passes the server-side checkout re-read;
2. the trace order is `admin.createUser` → `prepare_paid_signup_intent` →
   signup `resend`, with redirect exactly `/definir-senha`;
3. Custom SMTP actually delivers the **Confirm signup** link, clicking it
   creates a session, claims the subscription and credits exactly once, and the
   password page accepts only `origin = 'paid_passwordless'`;
4. retrying the marked, unconfirmed user left by an interrupted smoke resends
   safely; and
5. an existing confirmed or unconfirmed user without the marker is rejected by
   `prepare_paid_signup_intent`, with zero resend calls.

## Manual recovery (Rafael only; never automatic)

Run preflight first and stop unless exactly one target is identified:

```sql
begin;
select id,email from auth.users
where id = '<USER_UUID>' and email_confirmed_at is null;
select 1 from public.profiles where id = '<USER_UUID>';
select 1 from public.user_credits where user_id = '<USER_UUID>';
select 1 from public.paid_signup_intents where user_id = '<USER_UUID>';
select 1 from public.subscriptions where user_id = '<USER_UUID>';
rollback;
```

Only after manual proof, and only when all resource queries return zero, an
operator may delete that unconfirmed user through the Supabase Admin API in a
separate controlled session. Do not mark arbitrary users automatically; legacy
unmarked users remain fail-closed.
