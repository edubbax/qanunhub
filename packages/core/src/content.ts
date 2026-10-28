// In-memory index over a content bundle. Both the server and the browser demo build one at startup.
import type { Card, Category, ContentBundle, Item, Lesson, Topic, Unit } from './types';

export class ContentIndex {
  readonly bundle: ContentBundle;
  readonly topics: Topic[];
  readonly topicById = new Map<string, Topic>();
  readonly lessonById = new Map<string, Lesson>();
  readonly lessonsByTopic = new Map<string, Lesson[]>();
  readonly cardsByLesson = new Map<string, Card[]>();
  readonly unitById = new Map<string, Unit>();
  readonly unitsByLesson = new Map<string, Unit[]>();
  readonly unitsByTopic = new Map<string, Unit[]>();
  readonly itemById = new Map<string, Item>();
  readonly itemsByUnit = new Map<string, Item[]>();

  constructor(bundle: ContentBundle) {
    this.bundle = bundle;
    this.topics = [...bundle.topics].sort((a, b) => a.order - b.order);
    for (const t of this.topics) this.topicById.set(t.id, t);
    for (const l of [...bundle.lessons].sort((a, b) => a.order - b.order)) {
      this.lessonById.set(l.id, l);
      push(this.lessonsByTopic, l.topicId, l);
    }
    for (const c of [...bundle.cards].sort((a, b) => a.order - b.order)) push(this.cardsByLesson, c.lessonId, c);
    const published = bundle.items.filter((i) => i.status === 'published');
    for (const i of published) {
      this.itemById.set(i.id, i);
      push(this.itemsByUnit, i.unitId, i);
    }
    for (const u of bundle.units) {
      if (!this.itemsByUnit.has(u.id)) continue; // a unit without a published item cannot be asked
      this.unitById.set(u.id, u);
      if (u.lessonId) push(this.unitsByLesson, u.lessonId, u);
      push(this.unitsByTopic, u.topicId, u);
    }
  }

  topicsFor(cat: Category): Topic[] {
    return this.topics.filter((t) => t.categories.includes(cat));
  }

  lessonsFor(topicId: string, cat: Category): Lesson[] {
    return (this.lessonsByTopic.get(topicId) ?? []).filter((l) => l.categories.includes(cat));
  }

  unitsForLesson(lessonId: string): Unit[] {
    return this.unitsByLesson.get(lessonId) ?? [];
  }

  unitsForTopic(topicId: string, cat: Category): Unit[] {
    return (this.unitsByTopic.get(topicId) ?? []).filter((u) => u.categories.includes(cat));
  }

  unitsForCategory(cat: Category): Unit[] {
    return this.topicsFor(cat).flatMap((t) => this.unitsForTopic(t.id, cat));
  }

  itemsForUnit(unitId: string): Item[] {
    return this.itemsByUnit.get(unitId) ?? [];
  }

  cards(lessonId: string): Card[] {
    return this.cardsByLesson.get(lessonId) ?? [];
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}
