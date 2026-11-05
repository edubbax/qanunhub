-- Sample learners on the leaderboards, so a new board is not empty. They are marked as samples in the UI and
-- never sign in; real learners join the same boards as they earn XP.
create table sample_seeds (
  key         text primary key,
  created_at  timestamptz not null default now()
);
alter table sample_seeds enable row level security;
