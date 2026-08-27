-- Task 1: referral informado no onboarding.
-- A coluna é opcional para preservar perfis existentes sem resposta.
alter table public.profiles
  add column if not exists referral_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_referral_source_check'
  ) then
    alter table public.profiles
      add constraint profiles_referral_source_check check (
        referral_source is null or referral_source in (
          'twitter_x',
          'youtube',
          'google_search',
          'instagram',
          'tiktok',
          'facebook',
          'reddit',
          'hacker_news'
        )
      );
  end if;
end
$$;
