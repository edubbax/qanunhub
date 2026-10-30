-- Minimal stand-in for the parts of a Supabase database that supabase/profiles.sql and the server use:
-- the auth schema with auth.users and auth.uid(), and the anon/authenticated roles.
-- For local development and tests only; never run this on a real Supabase project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;

create table if not exists auth.users (
  id                  uuid primary key,
  email               text,
  email_confirmed_at  timestamptz,
  is_anonymous        boolean not null default false,
  created_at          timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to anon, authenticated;
