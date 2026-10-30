-- Accounts move to Supabase Auth: users.id is auth.users.id; passwords, sessions and emails live in Supabase.
alter table users alter column password_hash drop not null;
drop table if exists auth_sessions;
drop table if exists auth_tokens;

-- public.profiles is created on Supabase by supabase/profiles.sql (with the sign-up trigger and RLS).
-- On a plain Postgres (local development, tests) a bare copy keeps the server working.
do $$
begin
  if to_regclass('public.profiles') is null then
    create table public.profiles (
      id          uuid primary key,
      first_name  text,
      last_name   text,
      username    text,
      updated_at  timestamptz not null default now()
    );
    create unique index profiles_username_key on public.profiles (username);
  end if;
end $$;

-- The app's own tables sit in the public schema, which Supabase exposes through its Data API. Row level security
-- with no policies closes them to the anon and authenticated roles; the server connects as their owner.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'profiles' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
