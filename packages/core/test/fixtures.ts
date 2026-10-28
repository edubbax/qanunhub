import type { Category, ContentBundle, Item } from '../src';

const ALL: Category[] = ['AB', 'AC', 'BA', 'BB'];

function single(id: string, unitId: string, topicId: string, lessonId: string | null, categories: Category[] = ALL): Item {
  return {
    id, unitId, topicId, lessonId, categories, type: 'single', stem: `Sual ${id}: düzgün variant hansıdır?`,
    options: ['Düzgün', 'Yanlış 1', 'Yanlış 2', 'Yanlış 3'], answer: [0], points: 1, explanation: 'İzah', ref: 'm.1',
    status: 'published', flags: [],
  };
}

export function fixtureBundle(): ContentBundle {
  const items: Item[] = [];
  const units: ContentBundle['units'] = [];
  const addUnit = (uid: string, topicId: string, lessonId: string | null, categories: Category[] = ALL, variants = 1) => {
    units.push({ id: uid, topicId, lessonId, categories, importance: 2 });
    for (let v = 0; v < variants; v++) items.push(single(`${uid}-v${v}`, uid, topicId, lessonId, categories));
  };
  // Free topic: two lessons of 4 units, plus a pool of 4.
  for (let i = 0; i < 4; i++) addUnit(`k1u${i}`, 'konst', 'k1', ALL, 2);
  for (let i = 0; i < 4; i++) addUnit(`k2u${i}`, 'konst', 'k2');
  for (let i = 0; i < 4; i++) addUnit(`kpu${i}`, 'konst', null);
  // Premium topic, BA/BB only, with one open (multi) item.
  for (let i = 0; i < 5; i++) addUnit(`mu${i}`, 'melumat', 'm1', ['BA', 'BB']);
  units.push({ id: 'mopen', topicId: 'melumat', lessonId: null, categories: ['BA', 'BB'], importance: 2 });
  items.push({
    id: 'mopen-v0', unitId: 'mopen', topicId: 'melumat', lessonId: null, categories: ['BA', 'BB'], type: 'multi',
    stem: 'Hansı müddəalar doğrudur?', options: ['A doğru', 'B yanlış', 'C doğru', 'D yanlış'], answer: [0, 2], points: 2,
    status: 'published', flags: [],
  });
  // A draft item must never be served.
  items.push({ ...single('draft-1', 'k1u0', 'konst', 'k1'), status: 'draft' });
  return {
    version: 'test', generatedAt: '2026-10-28',
    topics: [
      { id: 'konst', programNo: '1', title: 'AR Konstitusiyası', shortTitle: 'Konstitusiya', order: 1, categories: ALL, free: true, lawTitle: 'Konstitusiya' },
      { id: 'melumat', programNo: '4', title: 'Məlumat azadlığı haqqında', shortTitle: 'Məlumat azadlığı', order: 4, categories: ['BA', 'BB'], free: false, lawTitle: 'Məlumat azadlığı haqqında Qanun' },
    ],
    lessons: [
      { id: 'k1', topicId: 'konst', order: 1, title: 'Xalq hakimiyyəti', refs: ['m.1'], categories: ALL, estMinutes: 5 },
      { id: 'k2', topicId: 'konst', order: 2, title: 'Dövlətçiliyin əsasları', refs: ['m.7'], categories: ALL, estMinutes: 5 },
      { id: 'm1', topicId: 'melumat', order: 1, title: 'Ümumi müddəalar', refs: ['m.1'], categories: ['BA', 'BB'], estMinutes: 5 },
    ],
    cards: [
      { id: 'c1', lessonId: 'k1', order: 1, kind: 'law', title: 'Maddə 1', body: 'Hakimiyyətin yeganə mənbəyi xalqdır.', ref: 'm.1' },
    ],
    units, items,
  };
}
