// In-memory index over a content bundle. Both the server and the browser demo build one at startup.
import type { Card, Category, ContentBundle, Item, ItemPool, Lesson, Section, Topic, Unit } from './types';

export function poolOf(x: { pool?: ItemPool }): ItemPool {
  return x.pool ?? 'exam';
}

export class ContentIndex {
  readonly bundle: ContentBundle;
  readonly topics: Topic[];
  readonly topicById = new Map<string, Topic>();
  readonly sectionById = new Map<string, Section>();
  readonly sectionsByTopic = new Map<string, Section[]>();
  readonly lessonById = new Map<string, Lesson>();
  readonly lessonsByTopic = new Map<string, Lesson[]>();
  readonly lessonsBySection = new Map<string, Lesson[]>();
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
    for (const s of [...(bundle.sections ?? [])].sort((a, b) => a.order - b.order)) {
      this.sectionById.set(s.id, s);
      push(this.sectionsByTopic, s.topicId, s);
    }
    for (const l of [...bundle.lessons].sort((a, b) => a.order - b.order)) {
      this.lessonById.set(l.id, l);
      push(this.lessonsByTopic, l.topicId, l);
      push(this.lessonsBySection, this.sectionIdOf(l), l);
    }
    // Bundles built before sections existed get one section per topic.
    for (const [topicId, lessons] of this.lessonsByTopic) {
      if (lessons.some((l) => !l.sectionId || !this.sectionById.has(l.sectionId))) {
        const s: Section = { id: `${topicId}-s00`, topicId, order: 0, title: 'Dərslər' };
        this.sectionById.set(s.id, s);
        this.sectionsByTopic.set(topicId, [s, ...(this.sectionsByTopic.get(topicId) ?? [])]);
      }
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

  sectionIdOf(l: Lesson): string {
    return l.sectionId && this.sectionById.has(l.sectionId) ? l.sectionId : `${l.topicId}-s00`;
  }

  topicsFor(cat: Category): Topic[] {
    return this.topics.filter((t) => t.categories.includes(cat));
  }

  lessonsFor(topicId: string, cat: Category): Lesson[] {
    return (this.lessonsByTopic.get(topicId) ?? []).filter((l) => l.categories.includes(cat));
  }

  /** Sections of a topic that have at least one lesson in the category. */
  sectionsFor(topicId: string, cat: Category): Section[] {
    return (this.sectionsByTopic.get(topicId) ?? []).filter((s) => this.sectionLessons(s.id, cat).length > 0);
  }

  sectionLessons(sectionId: string, cat: Category): Lesson[] {
    return (this.lessonsBySection.get(sectionId) ?? []).filter((l) => l.categories.includes(cat));
  }

  unitsForLesson(lessonId: string, pool?: ItemPool): Unit[] {
    const all = this.unitsByLesson.get(lessonId) ?? [];
    return pool ? all.filter((u) => poolOf(u) === pool) : all;
  }

  /** Questions a lesson asks: the editors' formative checks, or every unit of the lesson when it has none. */
  lessonUnits(lessonId: string): Unit[] {
    const formative = this.unitsForLesson(lessonId, 'formative');
    return formative.length > 0 ? formative : this.unitsForLesson(lessonId);
  }

  unitsForTopic(topicId: string, cat: Category, pool?: ItemPool): Unit[] {
    return (this.unitsByTopic.get(topicId) ?? []).filter((u) => u.categories.includes(cat) && (!pool || poolOf(u) === pool));
  }

  unitsForCategory(cat: Category, pool?: ItemPool): Unit[] {
    return this.topicsFor(cat).flatMap((t) => this.unitsForTopic(t.id, cat, pool));
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
