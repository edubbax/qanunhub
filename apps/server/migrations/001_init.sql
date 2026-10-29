-- QanunHub schema v1. Content, users and learning state, leaderboards, moderation and (next phase) billing.

create table users (
  id                  uuid primary key,
  email               text not null unique,
  password_hash       text not null,
  nickname            text not null unique,
  role                text not null default 'user' check (role in ('user', 'editor', 'admin')),
  category            text check (category in ('AB', 'AC', 'BA', 'BB')),
  subgroup            text,
  exam_date           date,
  daily_goal          int not null default 15,
  premium_until       timestamptz,
  email_verified      boolean not null default false,
  leaderboard_banned  boolean not null default false,
  xp_total            int not null default 0,
  hearts              jsonb not null,
  streak              jsonb not null,
  today               jsonb not null,
  category_changed_at timestamptz,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz
);

create table auth_sessions (
  token_hash  text primary key,
  user_id     uuid not null references users on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text,
  ip          text
);
create index auth_sessions_user on auth_sessions (user_id);

create table auth_tokens (
  token_hash  text primary key,
  user_id     uuid not null references users on delete cascade,
  kind        text not null check (kind in ('verify', 'reset')),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create table mail_outbox (
  id          bigint generated always as identity primary key,
  to_email    text not null,
  subject     text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Content -----------------------------------------------------------------------------------------

create table topics (
  id          text primary key,
  program_no  text not null,
  title       text not null,
  short_title text not null,
  sort        int not null,
  categories  text[] not null,
  free        boolean not null default false,
  law_title   text not null,
  note        text
);

create table lessons (
  id          text primary key,
  topic_id    text not null references topics on delete cascade,
  sort        int not null,
  title       text not null,
  refs        text[] not null default '{}',
  categories  text[] not null,
  est_minutes int not null default 5
);
create index lessons_topic on lessons (topic_id, sort);

create table cards (
  id          text primary key,
  lesson_id   text not null references lessons on delete cascade,
  sort        int not null,
  kind        text not null check (kind in ('law', 'note', 'qa')),
  title       text,
  body        text not null,
  ref         text,
  updated_at  timestamptz,
  updated_by  uuid
);
create index cards_lesson on cards (lesson_id, sort);

create table units (
  id          text primary key,
  topic_id    text not null references topics on delete cascade,
  lesson_id   text references lessons on delete set null,
  categories  text[] not null,
  importance  smallint not null default 2
);

create table items (
  id          text primary key,
  unit_id     text not null references units on delete cascade,
  topic_id    text not null references topics on delete cascade,
  lesson_id   text references lessons on delete set null,
  categories  text[] not null,
  type        text not null check (type in ('single', 'multi')),
  stem        text not null,
  statements  jsonb,
  options     jsonb not null,
  answer      jsonb not null,
  points      smallint not null default 1,
  explanation text,
  ref         text,
  source      jsonb,
  status      text not null default 'draft' check (status in ('draft', 'review', 'published', 'flagged')),
  flags       text[] not null default '{}',
  updated_at  timestamptz,
  updated_by  uuid
);
create index items_topic on items (topic_id, status);
create index items_lesson on items (lesson_id);

create table content_meta (
  key   text primary key,
  value text not null
);

-- Learning state ----------------------------------------------------------------------------------

create table lesson_progress (
  user_id           uuid not null references users on delete cascade,
  lesson_id         text not null,
  completions       int not null,
  best_correct      int not null,
  last_completed_at timestamptz not null,
  recent            jsonb not null default '[]',
  primary key (user_id, lesson_id)
);

create table topic_finals (
  user_id         uuid not null references users on delete cascade,
  topic_id        text not null,
  best_pct        int not null,
  passed_at       timestamptz,
  last_attempt_at timestamptz not null,
  attempts        int not null,
  primary key (user_id, topic_id)
);

create table srs_state (
  user_id            uuid not null references users on delete cascade,
  unit_id            text not null,
  phase              text not null check (phase in ('learn', 'relearn', 'review')),
  step               smallint not null,
  ease               numeric(3, 2) not null,
  interval_days      int not null,
  last_good_interval int not null,
  due_at             timestamptz not null,
  reps               int not null,
  lapses             int not null,
  is_leech           boolean not null,
  last_grade         smallint,
  last_review_at     timestamptz,
  last_item_id       text,
  primary key (user_id, unit_id)
);
create index srs_due on srs_state (user_id, due_at);

-- Append-only; the data FSRS will later be fitted on. Partition by month when it grows.
create table review_log (
  id              bigint generated always as identity primary key,
  user_id         uuid not null,
  unit_id         text not null,
  item_id         text not null,
  session_id      uuid not null,
  grade           smallint not null,
  correct         boolean not null,
  response_ms     int not null,
  interval_before int not null,
  interval_after  int not null,
  created_at      timestamptz not null
);
create index review_log_user on review_log (user_id, created_at);
create index review_log_item on review_log (item_id);

create table learn_sessions (
  id           uuid primary key,
  user_id      uuid not null references users on delete cascade,
  kind         text not null,
  data         jsonb not null,
  created_at   timestamptz not null,
  completed_at timestamptz
);
create index learn_sessions_user on learn_sessions (user_id, created_at);

create table xp_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users on delete cascade,
  session_id  uuid,
  source      text not null,
  amount      int not null,
  correct     int not null default 0,
  answered    int not null default 0,
  leaderboard boolean not null,
  category    text,
  created_at  timestamptz not null
);
create index xp_events_user on xp_events (user_id, created_at);

create table leaderboard_scores (
  period       text not null check (period in ('week', 'month')),
  period_start date not null,
  scope        text not null,
  user_id      uuid not null references users on delete cascade,
  xp           int not null default 0,
  correct      int not null default 0,
  answered     int not null default 0,
  reached_at   timestamptz not null,
  primary key (period, period_start, scope, user_id)
);
create index leaderboard_rank on leaderboard_scores (period, period_start, scope, xp desc, reached_at);

-- Moderation and audit ----------------------------------------------------------------------------

create table reports (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users on delete cascade,
  item_id     text not null,
  reason      text not null,
  body        text not null default '',
  status      text not null default 'open' check (status in ('open', 'confirmed', 'rejected')),
  resolution  text not null default '',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index reports_status on reports (status, created_at);

create table audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- Billing (filled in the payment-integration phase) --------------------------------------------------

create table subscriptions (
  id                   uuid primary key,
  user_id              uuid not null references users on delete cascade,
  plan                 text not null,
  status               text not null check (status in ('active', 'past_due', 'canceled', 'expired')),
  provider             text not null,
  provider_ref         text,
  card_mask            text,
  current_period_start timestamptz not null,
  current_period_end   timestamptz not null,
  cancel_at_period_end boolean not null default false,
  price_azn            numeric(6, 2) not null,
  created_at           timestamptz not null default now()
);

create table payments (
  id               uuid primary key,
  subscription_id  uuid references subscriptions on delete set null,
  user_id          uuid not null references users on delete cascade,
  amount_azn       numeric(6, 2) not null,
  status           text not null,
  provider         text not null,
  provider_txn_id  text unique,
  idempotency_key  text unique,
  raw              jsonb,
  created_at       timestamptz not null default now()
);
