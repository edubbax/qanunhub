-- Lesson system 2.0: number drills (pool 'drill', item format 'cloze'), key facts and exam frequency on law cards.
alter table units drop constraint if exists units_pool_check;
alter table units add constraint units_pool_check check (pool in ('exam', 'formative', 'drill'));
alter table items drop constraint if exists items_pool_check;
alter table items add constraint items_pool_check check (pool in ('exam', 'formative', 'drill'));
alter table items add column if not exists format text;
alter table cards add column if not exists facts jsonb;
alter table cards add column if not exists heat smallint;
alter table cards add column if not exists exam_count integer;
