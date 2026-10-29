-- Military ranks and awards (users.game), the name printed on certificates, and competitions.

alter table users add column game jsonb;
alter table users add column full_name text;

create table competitions (
  id             uuid primary key,
  title          text not null,
  description    text not null default '',
  category       text check (category in ('AB', 'AC', 'BA', 'BB')),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  question_count int not null,
  time_limit_sec int not null,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz,
  winners        jsonb not null default '[]'
);
create index competitions_starts on competitions (starts_at desc);

create table competition_entries (
  competition_id uuid not null references competitions on delete cascade,
  user_id        uuid not null references users on delete cascade,
  nickname       text not null,
  category       text not null,
  session_id     uuid not null,
  started_at     timestamptz not null,
  finished_at    timestamptz,
  points         int not null default 0,
  max_points     int not null default 0,
  pct            int not null default 0,
  duration_ms    int not null default 0,
  primary key (competition_id, user_id)
);

create table certificates (
  code              text primary key,
  competition_id    uuid not null references competitions on delete cascade,
  competition_title text not null,
  user_id           uuid not null references users on delete cascade,
  name              text not null,
  place             int not null,
  pct               int not null,
  category          text,
  issued_at         timestamptz not null
);
