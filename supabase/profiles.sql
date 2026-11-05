-- QanunHub: user profiles on Supabase.
-- Paste into Supabase Dashboard -> SQL Editor and run. Safe to run again: every statement is idempotent.
--
-- What it does:
--   1. public.profiles: one row per auth.users row (id, first_name, last_name, username, updated_at).
--   2. on_auth_user_created: a trigger that inserts an empty profile row as soon as someone signs up.
--   3. Row level security: a signed-in user can read and change only their own row; anon has no access.
--   4. public.username_available(text): lets the "Profilini tamamla" screen check a username before saving.

-- 1. Table ------------------------------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text,
  last_name   text,
  username    text,
  updated_at  timestamptz not null default now()
);

-- The QanunHub server may have created a plain copy of the table before this script ran; bring it up to date.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_first_name_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_first_name_check check (first_name is null or char_length(btrim(first_name)) between 2 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_last_name_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_last_name_check check (last_name is null or char_length(btrim(last_name)) between 2 and 40);
  end if;
  -- Usernames are stored in lower case: 3-24 characters, latin letters, digits, "_" and ".".
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_username_check check (username is null or username ~ '^[a-z0-9_.]{3,24}$');
  end if;
end $$;

create unique index if not exists profiles_username_key on public.profiles (username);

comment on table public.profiles is 'QanunHub learner profile; the row is created by on_auth_user_created and completed by the user.';

-- updated_at follows every change.
create or replace function public.profiles_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();

-- 2. Empty profile row on sign-up ---------------------------------------------------------------------------

-- Runs as its owner because the signing-up user cannot write to public.profiles yet; it only ever inserts the
-- id of the auth.users row that fired it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that existed before this script get their row too.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- 3. Row level security -------------------------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- Normally the trigger creates the row; this covers a row that is missing for any reason.
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 4. Username availability ------------------------------------------------------------------------------------

-- Other users' rows are hidden by RLS, so the check runs as the function owner. It answers only yes/no for a
-- well-formed name, and only to signed-in users (usernames are public on the leaderboard anyway).
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and candidate ~ '^[a-z0-9_.]{3,24}$'
     and not exists (
       select 1 from public.profiles p
       where p.username = candidate and p.id <> (select auth.uid())
     );
$$;

revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

-- 5. E-mail confirmation for the API server ---------------------------------------------------------------------

-- The QanunHub API needs one fact from auth.users: has this account confirmed its e-mail (the leaderboard, competitions
-- and certificates open after that). The auth schema is not readable by other roles, so the answer comes from here.
-- Only the server may call it; supabase/api-role.sql grants it to the server's database role.
create or replace function public.account_email_confirmed(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.email_confirmed_at is not null from auth.users u where u.id = uid), false);
$$;

revoke execute on function public.account_email_confirmed(uuid) from public, anon, authenticated;
