// Content storage: import a ContentBundle into Postgres and load it back into an in-memory ContentIndex.
import type { ContentBundle, Item } from '@qanunhub/core';
import { ContentIndex } from '@qanunhub/core';
import type { Db, Sql } from './db';

type Row = Record<string, any>;

export function rowToItem(r: Row): Item {
  return {
    id: r.id, unitId: r.unit_id, topicId: r.topic_id, lessonId: r.lesson_id, categories: r.categories, type: r.type,
    stem: r.stem, ...(r.statements ? { statements: r.statements } : {}), options: r.options, answer: r.answer,
    points: r.points, ...(r.explanation ? { explanation: r.explanation } : {}), ...(r.ref ? { ref: r.ref } : {}),
    ...(r.source ? { source: r.source } : {}), status: r.status, flags: r.flags,
  };
}

export async function loadBundle(sql: Db): Promise<ContentBundle> {
  const [topics, lessons, cards, units, items, meta] = await Promise.all([
    sql`select * from topics order by sort`,
    sql`select * from lessons order by topic_id, sort`,
    sql`select * from cards order by lesson_id, sort`,
    sql`select * from units`,
    sql`select * from items`,
    sql`select * from content_meta where key = 'version'`,
  ]);
  return {
    version: meta[0]?.value ?? 'empty',
    generatedAt: meta[0]?.value ?? '',
    topics: topics.map((r) => ({
      id: r.id, programNo: r.program_no, title: r.title, shortTitle: r.short_title, order: r.sort, categories: r.categories,
      free: r.free, lawTitle: r.law_title, ...(r.note ? { note: r.note } : {}),
    })),
    lessons: lessons.map((r) => ({ id: r.id, topicId: r.topic_id, order: r.sort, title: r.title, refs: r.refs, categories: r.categories, estMinutes: r.est_minutes })),
    cards: cards.map((r) => ({ id: r.id, lessonId: r.lesson_id, order: r.sort, kind: r.kind, ...(r.title ? { title: r.title } : {}), body: r.body, ...(r.ref ? { ref: r.ref } : {}) })),
    units: units.map((r) => ({ id: r.id, topicId: r.topic_id, lessonId: r.lesson_id, categories: r.categories, importance: r.importance })),
    items: items.map(rowToItem),
  };
}

/**
 * Replaces the content tables with a bundle. Learner state references units by id, so ids must be
 * stable between builds; items edited by an editor (updated_by set) are kept unless `overwriteEdited`.
 */
export async function importBundle(sql: Sql, b: ContentBundle, opts: { overwriteEdited?: boolean } = {}): Promise<{ topics: number; lessons: number; items: number; keptEdited: number }> {
  return sql.begin(async (tx) => {
    const edited = opts.overwriteEdited ? [] : await tx`select * from items where updated_by is not null`;
    const editedCards = opts.overwriteEdited ? [] : await tx`select * from cards where updated_by is not null`;
    await tx`delete from items`;
    await tx`delete from units`;
    await tx`delete from cards`;
    await tx`delete from lessons`;
    await tx`delete from topics`;
    const chunk = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
    for (const c of chunk(b.topics)) {
      await tx`insert into topics ${tx(c.map((t) => ({ id: t.id, program_no: t.programNo, title: t.title, short_title: t.shortTitle, sort: t.order, categories: t.categories, free: t.free, law_title: t.lawTitle, note: t.note ?? null })))}`;
    }
    for (const c of chunk(b.lessons)) {
      await tx`insert into lessons ${tx(c.map((l) => ({ id: l.id, topic_id: l.topicId, sort: l.order, title: l.title, refs: l.refs, categories: l.categories, est_minutes: l.estMinutes })))}`;
    }
    for (const c of chunk(b.cards)) {
      await tx`insert into cards ${tx(c.map((x) => ({ id: x.id, lesson_id: x.lessonId, sort: x.order, kind: x.kind, title: x.title ?? null, body: x.body, ref: x.ref ?? null })))}`;
    }
    for (const c of chunk(b.units)) {
      await tx`insert into units ${tx(c.map((u) => ({ id: u.id, topic_id: u.topicId, lesson_id: u.lessonId, categories: u.categories, importance: u.importance })))}`;
    }
    for (const c of chunk(b.items, 300)) {
      await tx`insert into items ${tx(c.map((i) => ({
        id: i.id, unit_id: i.unitId, topic_id: i.topicId, lesson_id: i.lessonId, categories: i.categories, type: i.type, stem: i.stem,
        statements: i.statements ? tx.json(i.statements) : null, options: tx.json(i.options), answer: tx.json(i.answer), points: i.points,
        explanation: i.explanation ?? null, ref: i.ref ?? null, source: i.source ? tx.json(i.source as any) : null, status: i.status, flags: i.flags,
      })))}`;
    }
    let keptEdited = 0;
    for (const r of edited) {
      const res = await tx`
        update items set stem = ${r.stem}, statements = ${r.statements ? tx.json(r.statements) : null}, options = ${tx.json(r.options)},
          answer = ${tx.json(r.answer)}, explanation = ${r.explanation}, ref = ${r.ref}, status = ${r.status}, flags = ${r.flags},
          updated_at = ${r.updated_at}, updated_by = ${r.updated_by}
        where id = ${r.id}`;
      keptEdited += res.count;
    }
    for (const r of editedCards) {
      await tx`update cards set title = ${r.title}, body = ${r.body}, updated_at = ${r.updated_at}, updated_by = ${r.updated_by} where id = ${r.id}`;
    }
    await tx`insert into content_meta (key, value) values ('version', ${b.version}) on conflict (key) do update set value = excluded.value`;
    return { topics: b.topics.length, lessons: b.lessons.length, items: b.items.length, keptEdited };
  });
}

/** Holds the current ContentIndex; reloaded after imports and editor changes. */
export class ContentCache {
  private index: ContentIndex = new ContentIndex({ version: 'empty', generatedAt: '', topics: [], lessons: [], cards: [], units: [], items: [] });
  private loading: Promise<void> | null = null;

  constructor(private readonly sql: Sql) {}

  get current(): ContentIndex {
    return this.index;
  }

  async reload(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        this.index = new ContentIndex(await loadBundle(this.sql));
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }
}
