-- QanunHub: the database role the API server connects as. Run once, after profiles.sql, in the SQL Editor.
-- Replace CHANGE_ME with a long random password and put the same password in the server's DATABASE_URL:
--   postgres://qanunhub_api.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
-- (transaction pooler; set DATABASE_PREPARE=false). The server creates its own tables on first start (owner:
-- qanunhub_api, row level security on, no policies), so the Data API cannot reach them.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'qanunhub_api') then
    create role qanunhub_api login password 'CHANGE_ME' connection limit 30;
  end if;
end $$;
grant qanunhub_api to postgres;
grant usage, create on schema public to qanunhub_api;
alter role qanunhub_api set search_path = public;
alter role qanunhub_api set statement_timeout = '15s';

-- Read-only access to the learner's profile and the e-mail confirmation flag.
grant select on table public.profiles to qanunhub_api;
drop policy if exists "profiles: api reads all" on public.profiles;
create policy "profiles: api reads all" on public.profiles
  for select to qanunhub_api
  using (true);
grant execute on function public.account_email_confirmed(uuid) to qanunhub_api;
