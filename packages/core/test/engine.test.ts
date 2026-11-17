import { beforeEach, describe, expect, it } from 'vitest';
import {
  AppError, ContentIndex, DAY, HOUR, MemoryStore, answer, complete, getHome, getLeaderboard, getPath, getWeakTopics,
  createCompetition, finishCompetitionNow, getCertificate, getMe, getStandings, grantPremium, listCompetitions, newUser,
  premiumSettings, seededRandom, startCompetition, startDrill, startFinal, startLesson, startMock, startReview, startSection, updateProfile,
  type EngineCtx, type SessionDto,
} from '../src';
import { fixtureBundle, sectionedBundle } from './fixtures';

const T0 = Date.UTC(2026, 10, 2, 8);
let store: MemoryStore;
let content: ContentIndex;
let now = T0;
let ids = 0;

function ctx(): EngineCtx {
  return { store, content, now, random: seededRandom(42), newId: () => `id${++ids}`, categoryChangeLimit: true };
}

/** Answers every question correctly by reading the canonical key through the store (test-only shortcut). */
async function answerAll(s: SessionDto, wrongQids: number[] = []) {
  const stored = (await store.getSession(s.id))!;
  for (const q of s.questions) {
    const sq = stored.questions.find((x) => x.qid === q.qid)!;
    const item = content.itemById.get(sq.itemId)!;
    const correct = item.answer.map((a) => sq.perm.indexOf(a));
    const wrong = [sq.perm.findIndex((c) => !item.answer.includes(c))];
    await answer(ctx(), 'u1', s.id, q.qid, wrongQids.includes(q.qid) ? wrong : correct, 9000);
  }
}

async function errorOf(p: Promise<unknown>): Promise<AppError> {
  try { await p; } catch (e) { return e as AppError; }
  throw new Error('expected an error');
}

beforeEach(async () => {
  // Most tests describe the paid mode for when Premium goes on sale; 'premium closed' covers launch.
  premiumSettings.available = true;
  store = new MemoryStore();
  content = new ContentIndex(fixtureBundle());
  now = T0;
  const u = newUser('u1', 'aynur@example.az', 'aynur', T0);
  u.emailVerified = true;
  await store.saveUser(u);
  await updateProfile(ctx(), 'u1', { category: 'BB', subgroup: 'BB2' });
});

describe('lesson flow', () => {
  it('serves only published items, shows cards and requeues a missed unit', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    expect(s.cards).toHaveLength(1);
    expect(s.questions).toHaveLength(4);
    const stored = (await store.getSession(s.id))!;
    expect(stored.questions.every((q) => q.itemId !== 'draft-1')).toBe(true);

    const q0 = s.questions[0];
    const sq = stored.questions[0];
    const item = content.itemById.get(sq.itemId)!;
    const wrongIdx = sq.perm.findIndex((c) => !item.answer.includes(c));
    const res = await answer(ctx(), 'u1', s.id, q0.qid, [wrongIdx], 9000);
    expect(res.correct).toBe(false);
    expect(res.hearts?.current).toBe(2);
    expect(res.appended?.requeue).toBe(true);
    expect(res.correctIndexes).toEqual(item.answer.map((a) => sq.perm.indexOf(a)));
  });

  it('completes a lesson, awards XP and unlocks the next lesson', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(s);
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.completed).toBe(true);
    expect(r.xp).toBe(10 + 4 + 5);
    expect(r.streak).toBe(1);
    const path = await getPath(ctx(), 'u1');
    expect(path.topics[0].lessons.map((l) => l.state)).toEqual(['done', 'available']);
    expect((await complete(ctx(), 'u1', s.id)).xp).toBe(r.xp); // idempotent
  });

  it('keeps lessons in order', async () => {
    const e = await errorOf(startLesson(ctx(), 'u1', 'k2'));
    expect(e.code).toBe('LESSON_LOCKED');
  });

  it('locks new lessons for 4 hours after three mistakes, while reviews stay open', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    await answerAll({ ...s, questions: s.questions.slice(0, 3) }, [0, 1, 2]);
    const stored = (await store.getSession(s.id))!;
    expect(stored.heartsOut).toBe(true);
    expect((await errorOf(answer(ctx(), 'u1', s.id, 3, [0], 9000))).code).toBe('SESSION_CLOSED');
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.completed).toBe(false);
    expect(r.xp).toBe(0);
    expect((await errorOf(startLesson(ctx(), 'u1', 'k1'))).code).toBe('HEARTS_LOCKED');
    now += 11 * 60_000;
    const review = await startReview(ctx(), 'u1');
    expect(review.questions.length).toBeGreaterThan(0);
    now = T0 + 4 * HOUR + 1;
    await expect(startLesson(ctx(), 'u1', 'k1')).resolves.toBeTruthy();
  });

  it('blocks premium topics on the free plan', async () => {
    expect((await errorOf(startLesson(ctx(), 'u1', 'm1'))).code).toBe('PREMIUM_REQUIRED');
    await grantPremium(ctx(), 'u1', T0 + 30 * DAY);
    const s = await startLesson(ctx(), 'u1', 'm1');
    expect(s.hearts).toBeNull();
  });
});

describe('reviews and finals', () => {
  it('schedules learned units for review the next day', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(s);
    await complete(ctx(), 'u1', s.id);
    now += 10 * 60_000;
    expect((await getHome(ctx(), 'u1')).dueCount).toBe(4);
    const r = await startReview(ctx(), 'u1');
    await answerAll(r);
    const done = await complete(ctx(), 'u1', r.id);
    expect(done.xp).toBe(5 + 4);
    expect((await getHome(ctx(), 'u1')).dueCount).toBe(0);
  });

  it('opens the final after all lessons, passes at 80% and enforces the free cooldown', async () => {
    for (const l of ['k1', 'k2']) {
      const s = await startLesson(ctx(), 'u1', l);
      await answerAll(s);
      await complete(ctx(), 'u1', s.id);
    }
    const f = await startFinal(ctx(), 'u1', 'konst');
    expect(f.examMode).toBe(true);
    expect(f.questions).toHaveLength(12);
    await answerAll(f, [0, 1]);
    const r = await complete(ctx(), 'u1', f.id);
    expect(r.pct).toBe(83);
    expect(r.passed).toBe(true);
    expect(r.review).toHaveLength(12);
    expect((await errorOf(startFinal(ctx(), 'u1', 'konst'))).code).toBe('FINAL_COOLDOWN');
    expect((await getHome(ctx(), 'u1')).topicsPassed).toBe(1);
  });
});

describe('premium features', () => {
  beforeEach(async () => { await grantPremium(ctx(), 'u1', T0 + 30 * DAY); });

  it('builds a mock exam in the category format', async () => {
    await updateProfile({ ...ctx(), categoryChangeLimit: false }, 'u1', { category: 'BA', subgroup: 'BA2' });
    const m = await startMock(ctx(), 'u1');
    expect(m.questions.filter((q) => q.type === 'multi')).toHaveLength(1);
    expect(m.notice).toContain('qapalı sualla əvəz');
    expect(m.targetPercent).toBe(80);
  });

  it('puts premium XP on the weekly board and lists weak topics', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(s, [0]);
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.leaderboardCounted).toBe(true);
    expect(r.leaderboard).toBe('counted');
    const lb = await getLeaderboard(ctx(), 'u1', 'week', 'BB');
    expect(lb.me?.rank).toBe(1);
    expect(lb.rows[0].xp).toBe(r.xp);
    const weak = await getWeakTopics(ctx(), 'u1');
    expect(weak[0].topicId).toBe('konst');
  });

  it('limits category changes to once per 30 days', async () => {
    await updateProfile(ctx(), 'u1', { category: 'AC' });
    const e = await errorOf(updateProfile(ctx(), 'u1', { category: 'BA' }));
    expect(e.code).toBe('CATEGORY_CHANGE_LIMIT');
    now += 31 * DAY;
    await expect(updateProfile(ctx(), 'u1', { category: 'BA' })).resolves.toBeTruthy();
  });
});

describe('free plan leaderboard', () => {
  it('lists every learner with a verified email, whatever the plan', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(s);
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.leaderboardCounted).toBe(true);
    const lb = await getLeaderboard(ctx(), 'u1', 'week', 'ALL');
    expect(lb.eligible).toBe(true);
    expect(lb.rows.map((x) => x.userId)).toEqual(['u1']);
  });

  it('shows an unverified learner a preview rank instead of listing them', async () => {
    const u = (await store.getUser('u1'))!;
    await store.saveUser({ ...u, emailVerified: false });
    const s = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(s);
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.leaderboard).toBe('unverified');
    const lb = await getLeaderboard(ctx(), 'u1', 'week', 'ALL');
    expect(lb.eligible).toBe(false);
    expect(lb.rows).toHaveLength(0);
    expect(lb.previewRank).toBe(1);
  });
});

describe('premium closed (launch)', () => {
  beforeEach(() => { premiumSettings.available = false; });

  it('keeps everyone on the free plan as Gizir, even with a premium date set', async () => {
    await grantPremium(ctx(), 'u1', now + 30 * DAY);
    const me = await getMe(ctx(), 'u1');
    expect(me.premium).toBe(false);
    expect(me.rank.title).toBe('Gizir');
    expect(me.hearts).not.toBeNull();
    expect((await errorOf(startMock(ctx(), 'u1'))).code).toBe('PREMIUM_REQUIRED');
    expect((await errorOf(getWeakTopics(ctx(), 'u1'))).code).toBe('PREMIUM_REQUIRED');
    const path = await getPath(ctx(), 'u1');
    expect(path.topics.filter((t) => !t.locked).map((t) => t.id)).toEqual(['konst']);
  });
});

describe('sections and question pools', () => {
  beforeEach(() => {
    content = new ContentIndex(sectionedBundle());
  });

  it('keeps AB as coming soon', async () => {
    const e = await errorOf(updateProfile({ ...ctx(), categoryChangeLimit: false }, 'u1', { category: 'AB' }));
    expect(e.code).toBe('VALIDATION');
  });

  it('teaches lessons with formative questions and lists sections on the path', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    const stored = (await store.getSession(s.id))!;
    expect(stored.questions.map((q) => q.unitId).sort()).toEqual(['k1f0', 'k1f1', 'k1f2']);
    const path = await getPath(ctx(), 'u1');
    const konst = path.topics.find((t) => t.id === 'konst')!;
    expect(konst.sections.map((x) => x.id)).toEqual(['konst-s01', 'konst-s02']);
    expect(konst.lessons.find((l) => l.id === 'k1')!.sectionId).toBe('konst-s01');
    expect(konst.lessons.find((l) => l.id === 'k1')!.unitCount).toBe(3);
    expect(konst.sections[0].test.available).toBe(false);
  });

  it('opens the section test after its lessons, asks source questions first and records the result', async () => {
    expect((await errorOf(startSection(ctx(), 'u1', 'konst-s01'))).code).toBe('FINAL_LOCKED');
    const lesson = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(lesson);
    await complete(ctx(), 'u1', lesson.id);

    const s = await startSection(ctx(), 'u1', 'konst-s01');
    expect(s.examMode).toBe(true);
    const stored = (await store.getSession(s.id))!;
    const unitIds = stored.questions.map((q) => q.unitId);
    // Four source units exist; the three formative units only fill the rest of the ten slots.
    expect(unitIds.filter((x) => x.startsWith('k1u'))).toHaveLength(4);
    expect(unitIds).toHaveLength(7);
    await answerAll(s);
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.kind).toBe('section');
    expect(r.passed).toBe(true);
    expect(r.review).toHaveLength(7);
    const path = await getPath(ctx(), 'u1');
    const sec = path.topics.find((t) => t.id === 'konst')!.sections[0];
    expect(sec.test).toMatchObject({ available: true, passed: true, bestPct: 100 });
  });

  it('builds finals from source questions first', async () => {
    for (const id of ['k1', 'k2']) {
      const l = await startLesson(ctx(), 'u1', id);
      await answerAll(l);
      await complete(ctx(), 'u1', l.id);
    }
    const f = await startFinal(ctx(), 'u1', 'konst');
    const stored = (await store.getSession(f.id))!;
    // All twelve source units are used; formative units only fill the remaining slots of twenty.
    expect(stored.questions.filter((q) => !q.unitId.startsWith('k1f'))).toHaveLength(12);
    expect(stored.questions).toHaveLength(15);
  });
});

describe('ranks, awards and competitions', () => {
  it('reports merit, the shown rank and new awards after a lesson', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(s);
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.rank.isGizir).toBe(true);
    expect(r.rank.title).toBe('Gizir');
    expect(r.rank.meritDelta).toBeGreaterThan(0);
    expect(r.awards.map((a) => a.id)).toEqual(expect.arrayContaining(['lesson', 'perfect']));
    await grantPremium(ctx(), 'u1', T0 + 30 * DAY);
    const me = await getMe(ctx(), 'u1');
    expect(me.rank.title).toBe('Leytenant');
    expect(me.awards.find((a) => a.id === 'lesson')?.tier).toBe(1);
  });

  it('runs a competition with one attempt, standings, winners and a verifiable certificate', async () => {
    await updateProfile(ctx(), 'u1', { fullName: 'Aynur Məmmədova' });
    const c = await createCompetition(ctx(), {
      title: 'Həftəlik yarış', description: 'Sınaq', category: 'BB', startsAt: T0 - HOUR, endsAt: T0 + DAY, questionCount: 5, timeLimitSec: 600,
    });
    const list = await listCompetitions(ctx(), 'u1');
    expect(list[0]).toMatchObject({ id: c.id, status: 'active', canStart: true });
    const s = await startCompetition(ctx(), 'u1', c.id);
    expect(s.kind).toBe('competition');
    expect(s.examMode).toBe(true);
    expect(s.questions).toHaveLength(5);
    await answerAll(s);
    await complete(ctx(), 'u1', s.id);
    expect((await errorOf(startCompetition(ctx(), 'u1', c.id))).code).toBe('COMPETITION_CLOSED');
    const st = await getStandings(ctx(), 'u1', c.id);
    expect(st.rows[0]).toMatchObject({ place: 1, me: true, pct: 100 });

    now += HOUR;
    const done = await finishCompetitionNow(ctx(), c.id);
    expect(done.winners[0]).toMatchObject({ place: 1, userId: 'u1', name: 'Aynur Məmmədova' });
    const cert = await getCertificate(ctx(), done.winners[0].certificateCode);
    expect(cert).toMatchObject({ name: 'Aynur Məmmədova', place: 1, competitionTitle: 'Həftəlik yarış' });
    const after = await listCompetitions(ctx(), 'u1');
    expect(after[0].my?.certificateCode).toBe(done.winners[0].certificateCode);
    const me = await getMe(ctx(), 'u1');
    expect(me.awards.find((a) => a.id === 'champion')?.tier).toBe(1);
  });
});

/** The fixture with Lesson 2.0 content: law card facts and heat, and number drills built from lesson k1's law text. */
function drillBundle() {
  const b = sectionedBundle();
  b.cards = b.cards.map((c) => (c.id === 'c1' ? { ...c, facts: ['Qanunlar 14 gün müddətində imzalanır.'], heat: 2 as const, examCount: 4 } : c));
  for (let i = 0; i < 3; i++) {
    b.units.push({ id: `k1z${i}`, topicId: 'konst', lessonId: 'k1', categories: ['AB', 'AC', 'BA', 'BB'], importance: 2, pool: 'drill' });
    b.items.push({
      id: `k1z${i}-v0`, unitId: `k1z${i}`, topicId: 'konst', lessonId: 'k1', categories: ['AB', 'AC', 'BA', 'BB'], type: 'single',
      format: 'cloze', stem: 'Boşluğu qanunun mətninə uyğun doldur: «Qanunlar _____ müddətində imzalanır.»',
      options: ['14 gün', '7 gün', '10 gün', '15 gün'], answer: [0], points: 1, explanation: 'Qanunun mətni: «Qanunlar 14 gün müddətində imzalanır.»',
      status: 'published', flags: ['generated'], pool: 'drill',
    });
  }
  return b;
}

describe('lesson system 2.0', () => {
  beforeEach(() => {
    content = new ContentIndex(drillBundle());
  });

  it('mixes two number drills into the lesson check and sends card facts and exam heat', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    const stored = (await store.getSession(s.id))!;
    const drills = stored.questions.filter((q) => q.unitId.startsWith('k1z'));
    expect(drills).toHaveLength(2);
    expect(s.questions.filter((q) => q.format === 'cloze')).toHaveLength(2);
    expect(s.cards[0]).toMatchObject({ facts: ['Qanunlar 14 gün müddətində imzalanır.'], heat: 2, examCount: 4 });
  });

  it('returns the mistakes of a lesson with the law quote for the recap', async () => {
    const s = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(s, [s.questions[0].qid]);
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.completed).toBe(true);
    expect(r.review.length).toBe(1);
    expect(r.review.every((x) => !x.correct)).toBe(true);
  });

  it('runs a numbers drill over the open topics, without spending stars', async () => {
    const s = await startDrill(ctx(), 'u1');
    expect(s.kind).toBe('drill');
    expect(s.hearts).toBeNull();
    expect(s.questions).toHaveLength(3);
    expect(s.questions.every((q) => q.format === 'cloze')).toBe(true);
    await answerAll(s, [s.questions[0].qid]);
    const r = await complete(ctx(), 'u1', s.id);
    expect(r.kind).toBe('drill');
    expect(r.review).toHaveLength(3);
    const home = await getHome(ctx(), 'u1');
    expect(home.drillCount).toBe(3);
  });

  it('keeps number drills out of section tests and the readiness score', async () => {
    const lesson = await startLesson(ctx(), 'u1', 'k1');
    await answerAll(lesson);
    await complete(ctx(), 'u1', lesson.id);
    const sec = await startSection(ctx(), 'u1', 'konst-s01');
    const stored = (await store.getSession(sec.id))!;
    expect(stored.questions.some((q) => q.unitId.startsWith('k1z'))).toBe(false);
    const home = await getHome(ctx(), 'u1');
    expect(home.totalUnits).toBe(content.unitsForCategory('BB').filter((u) => u.pool !== 'drill').length);
  });
});
