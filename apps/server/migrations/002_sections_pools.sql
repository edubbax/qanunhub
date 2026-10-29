-- Sub-topic sections of the learning path, and the split between source (exam) and editors' (formative) questions.

create table sections (
  id       text primary key,
  topic_id text not null references topics on delete cascade,
  sort     int not null,
  title    text not null
);
create index sections_topic on sections (topic_id, sort);

alter table lessons add column section_id text references sections on delete set null;
alter table units add column pool text not null default 'exam' check (pool in ('exam', 'formative'));
alter table items add column pool text not null default 'exam' check (pool in ('exam', 'formative'));
