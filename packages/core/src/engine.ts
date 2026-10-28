// Application service: every learner-facing operation. Pure orchestration over Store + ContentIndex,
// so the Postgres server and the in-browser demo behave identically.
import type {
  AnswerDto, CardDto, CompleteDto, HeartsDto, HomeDto, LeaderboardDto, MeDto, PathDto, PathTopicDto, ProfilePatch,
  QuestionDto, RankDto, ReviewEntryDto, SessionDto, WeakTopicDto,
} from './api';
import { SESSION_TITLES } from './api';
import type { ContentIndex } from './content';
import { AppError } from './errors';
import { EXAM_FORMATS, MOCK_MINUTES, findSubgroup, targetPercent } from './exam';
import {
  HEARTS_EARN_MIN_CORRECT, HEARTS_MAX, XP, canEarnHeart, computeRank, earnHeart, finalXp, freshHearts, freshStreak,
  isPremium, lessonXp, loseHeart, normalizeHearts, reviewXp, touchStreak, visibleStreak,
} from './gamification';
import { isLearned, newSrsState, priority, readingMs, retrievability, schedule, toGrade } from './srs';
import type { Store } from './store';
import { DAY, HOUR, MINUTE, dayKey, dayStart, daysBetween, periodEnd, periodStartKey } from './time';
import type {
  Category, Item, LessonProgress, Period, ReviewLog, Scope, Session, SessionKind, SessionQuestion, SrsState, TopicFinal,
  Unit, UserRecord,
} from './types';
import { CATEGORIES } from './types';

export interface EngineCtx {
  store: Store;
  content: ContentIndex;
  now: number;
  random: () => number;
  newId: () => string;
  /** When false, learners may switch category at any time (demo and admin use). */
  categoryChangeLimit?: boolean;
}

export const LESSON_QUESTIONS = 8;
export const LESSON_REVIEW_TAIL = 3;
export const REVIEW_QUESTIONS = 10;
export const FINAL_QUESTIONS = 20;
export const FINAL_PASS_PCT = 80;
export const SESSION_TTL = 60 * MINUTE;
export const FREE_FINAL_COOLDOWN = 24 * HOUR;
export const SUSPICION_LIMIT = 3;

// ---------------------------------------------------------------- users

export function newUser(id: string, email: string, nickname: string, now: number): UserRecord {
  return {
    id, email, nickname, role: 'user', category: null, subgroup: null, examDate: null, dailyGoal: 15,
    premiumUntil: null, emailVerified: false, leaderboardBanned: false, createdAt: now, xpTotal: 0,
    hearts: freshHearts(now), streak: freshStreak(now), today: { day: dayKey(now), xp: 0, lbXp: 0 }, categoryChangedAt: null,
  };
}

async function loadUser(ctx: EngineCtx, userId: string): Promise<UserRecord> {
  const u = await ctx.store.getUser(userId);
  if (!u) throw new AppError('UNAUTHORIZED', 'Hesab tapılmadı. Yenidən daxil olun.');
  u.hearts = normalizeHearts(u.hearts, ctx.now);
  const today = dayKey(ctx.now);
  if (u.today.day !== today) u.today = { day: today, xp: 0, lbXp: 0 };
  return u;
}

function requireCategory(u: UserRecord): Category {
  if (!u.category) throw new AppError('NO_CATEGORY', 'Əvvəlcə kateqoriyanı seçin.');
  return u.category;
}

function heartsDto(u: UserRecord, now: number): HeartsDto | null {
  if (isPremium(u, now)) return null;
  return { current: u.hearts.current, max: HEARTS_MAX, lockedUntil: u.hearts.lockedUntil, canEarn: canEarnHeart(u.hearts) };
}

// ---------------------------------------------------------------- shared calculations

interface Progress {
  lessons: Map<string, LessonProgress>;
  finals: Map<string, TopicFinal>;
  srs: Map<string, SrsState>;
}

async function loadProgress(ctx: EngineCtx, userId: string): Promise<Progress> {
  const [lessons, finals, srs] = await Promise.all([
    ctx.store.getLessonProgress(userId), ctx.store.getTopicFinals(userId), ctx.store.getSrs(userId),
  ]);
  return {
    lessons: new Map(lessons.map((l) => [l.lessonId, l])),
    finals: new Map(finals.map((f) => [f.topicId, f])),
    srs: new Map(srs.map((s) => [s.unitId, s])),
  };
}

function mastery(units: Unit[], srs: Map<string, SrsState>, now: number): number {
  if (units.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (const u of units) {
    num += u.importance * retrievability(srs.get(u.id), now);
    den += u.importance;
  }
  return den ? num / den : 0;
}

function passedPct(ctx: EngineCtx, cat: Category, finals: Map<string, TopicFinal>): number {
  const topics = ctx.content.topicsFor(cat).filter((t) => ctx.content.unitsForTopic(t.id, cat).length > 0);
  if (topics.length === 0) return 0;
  const passed = topics.filter((t) => finals.get(t.id)?.passedAt).length;
  return Math.round((passed / topics.length) * 100);
}

function retention30(srs: Map<string, SrsState>, now: number): number {
  const recent = [...srs.values()].filter((s) => s.phase === 'review' && s.lastReviewAt && now - s.lastReviewAt < 30 * DAY);
  if (recent.length === 0) return 0;
  return recent.reduce((a, s) => a + retrievability(s, now), 0) / recent.length;
}

function rankDto(ctx: EngineCtx, u: UserRecord, p: Progress): RankDto | null {
  if (!isPremium(u, ctx.now) || !u.category) return null;
  const pp = passedPct(ctx, u.category, p.finals);
  const r = computeRank(pp, u.xpTotal, retention30(p.srs, ctx.now));
  return {
    code: r.current.code, title: r.current.title, nextTitle: r.next?.title ?? null, passedPct: pp,
    nextPassedPct: r.next?.minPassedPct ?? null, nextXp: r.next?.minXp ?? null,
  };
}

function meDto(ctx: EngineCtx, u: UserRecord, p: Progress): MeDto {
  const premium = isPremium(u, ctx.now);
  return {
    id: u.id, email: u.email, nickname: u.nickname, role: u.role, category: u.category, subgroup: u.subgroup,
    examDate: u.examDate, dailyGoal: u.dailyGoal, premium, premiumUntil: u.premiumUntil, emailVerified: u.emailVerified,
    xpTotal: u.xpTotal, todayXp: u.today.xp, hearts: heartsDto(u, ctx.now), streak: visibleStreak(u.streak, ctx.now, premium),
    longestStreak: u.streak.longest, freezesLeft: premium ? u.streak.freezesLeft : 0, rank: rankDto(ctx, u, p),
  };
}

function lessonStates(ctx: EngineCtx, topicId: string, cat: Category, lessons: Map<string, LessonProgress>) {
  const list = ctx.content.lessonsFor(topicId, cat);
  return list.map((l, i) => {
    const done = (lessons.get(l.id)?.completions ?? 0) > 0;
    const prevDone = i === 0 || (lessons.get(list[i - 1].id)?.completions ?? 0) > 0;
    return { lesson: l, state: done ? 'done' as const : prevDone ? 'available' as const : 'locked' as const };
  });
}

function topicAccessible(ctx: EngineCtx, topicId: string, u: UserRecord): boolean {
  const t = ctx.content.topicById.get(topicId);
  return !!t && (t.free || isPremium(u, ctx.now));
}

// ---------------------------------------------------------------- read models

export async function getMe(ctx: EngineCtx, userId: string): Promise<MeDto> {
  const u = await loadUser(ctx, userId);
  return meDto(ctx, u, await loadProgress(ctx, userId));
}

export async function getHome(ctx: EngineCtx, userId: string): Promise<HomeDto> {
  const u = await loadUser(ctx, userId);
  const p = await loadProgress(ctx, userId);
  const me = meDto(ctx, u, p);
  const cat = u.category;
  if (!cat) {
    return { me, dueCount: 0, nextLesson: null, readiness: 0, targetPercent: 80, examDaysLeft: null, topicsTotal: 0, topicsPassed: 0, learnedUnits: 0, totalUnits: 0 };
  }
  const units = ctx.content.unitsForCategory(cat);
  const unitIds = new Set(units.map((x) => x.id));
  const dueCount = [...p.srs.values()].filter((s) => unitIds.has(s.unitId) && s.dueAt <= ctx.now).length;
  let nextLesson: HomeDto['nextLesson'] = null;
  for (const t of ctx.content.topicsFor(cat)) {
    if (!topicAccessible(ctx, t.id, u)) continue;
    const next = lessonStates(ctx, t.id, cat, p.lessons).find((s) => s.state === 'available');
    if (next) { nextLesson = { id: next.lesson.id, title: next.lesson.title, topicId: t.id, topicTitle: t.shortTitle }; break; }
  }
  const topics = ctx.content.topicsFor(cat).filter((t) => ctx.content.unitsForTopic(t.id, cat).length > 0);
  return {
    me, dueCount, nextLesson,
    readiness: Math.round(mastery(units, p.srs, ctx.now) * 100),
    targetPercent: targetPercent(cat, u.subgroup),
    examDaysLeft: u.examDate ? Math.max(0, daysBetween(dayKey(ctx.now), u.examDate)) : null,
    topicsTotal: topics.length,
    topicsPassed: topics.filter((t) => p.finals.get(t.id)?.passedAt).length,
    learnedUnits: units.filter((x) => isLearned(p.srs.get(x.id), ctx.now)).length,
    totalUnits: units.length,
  };
}

export async function getPath(ctx: EngineCtx, userId: string): Promise<PathDto> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  const p = await loadProgress(ctx, userId);
  const topics: PathTopicDto[] = ctx.content.topicsFor(cat).map((t) => {
    const locked = !topicAccessible(ctx, t.id, u);
    const states = lessonStates(ctx, t.id, cat, p.lessons);
    const doneLessons = states.filter((s) => s.state === 'done').length;
    const fin = p.finals.get(t.id);
    const unitCount = ctx.content.unitsForTopic(t.id, cat).length;
    const cooldown = !isPremium(u, ctx.now) && fin ? fin.lastAttemptAt + FREE_FINAL_COOLDOWN : null;
    return {
      id: t.id, programNo: t.programNo, title: t.title, shortTitle: t.shortTitle, note: t.note, free: t.free, locked,
      lessons: states.map(({ lesson, state }) => ({
        id: lesson.id, title: lesson.title, order: lesson.order, refs: lesson.refs, estMinutes: lesson.estMinutes,
        unitCount: ctx.content.unitsForLesson(lesson.id).length, state: locked ? 'locked' as const : state,
      })),
      doneLessons,
      mastery: Math.round(mastery(ctx.content.unitsForTopic(t.id, cat), p.srs, ctx.now) * 100),
      final: {
        available: !locked && unitCount > 0 && doneLessons === states.length,
        passed: !!fin?.passedAt,
        bestPct: fin?.bestPct ?? 0,
        nextAttemptAt: cooldown && cooldown > ctx.now ? cooldown : null,
        questionCount: Math.min(FINAL_QUESTIONS, unitCount),
      },
    };
  });
  return { category: cat, topics };
}

// ---------------------------------------------------------------- profile

const NICK_RE = /^[\p{L}\p{N}_.-]{3,24}$/u;

export async function updateProfile(ctx: EngineCtx, userId: string, patch: ProfilePatch): Promise<MeDto> {
  const u = await loadUser(ctx, userId);
  if (patch.category !== undefined) {
    if (!CATEGORIES.includes(patch.category)) throw new AppError('VALIDATION', 'Kateqoriya yanlışdır.');
    if (patch.category !== u.category) {
      if (ctx.categoryChangeLimit !== false && u.category && u.categoryChangedAt && ctx.now - u.categoryChangedAt < 30 * DAY) {
        throw new AppError('CATEGORY_CHANGE_LIMIT', 'Kateqoriyanı 30 gündə bir dəfə dəyişmək olar.', { nextChangeAt: u.categoryChangedAt + 30 * DAY });
      }
      if (u.category) u.categoryChangedAt = ctx.now;
      u.category = patch.category;
      if (u.subgroup && findSubgroup(u.subgroup)?.category !== patch.category) u.subgroup = null;
    }
  }
  if (patch.subgroup !== undefined) {
    if (patch.subgroup === null) u.subgroup = null;
    else {
      const sg = findSubgroup(patch.subgroup);
      if (!sg || sg.category !== u.category) throw new AppError('VALIDATION', 'Alt qrup seçilmiş kateqoriyaya uyğun deyil.');
      u.subgroup = sg.code;
    }
  }
  if (patch.examDate !== undefined) {
    if (patch.examDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(patch.examDate)) throw new AppError('VALIDATION', 'Tarix formatı yanlışdır.');
    u.examDate = patch.examDate;
  }
  if (patch.dailyGoal !== undefined) {
    if (![10, 15, 20, 30, 45].includes(patch.dailyGoal)) throw new AppError('VALIDATION', 'Gündəlik hədəf 10, 15, 20, 30 və ya 45 dəqiqə ola bilər.');
    u.dailyGoal = patch.dailyGoal;
  }
  if (patch.nickname !== undefined) {
    if (!NICK_RE.test(patch.nickname)) throw new AppError('VALIDATION', 'Ləqəb 3–24 simvol olmalıdır: hərf, rəqəm, «_», «.», «-».');
    u.nickname = patch.nickname;
  }
  await ctx.store.saveUser(u);
  return meDto(ctx, u, await loadProgress(ctx, userId));
}

// ---------------------------------------------------------------- sessions

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickItem(ctx: EngineCtx, unitId: string, avoid: string | null, type?: Item['type']): Item | null {
  let items = ctx.content.itemsForUnit(unitId);
  if (type) items = items.filter((i) => i.type === type);
  if (items.length === 0) return null;
  const pool = items.length > 1 && avoid ? items.filter((i) => i.id !== avoid) : items;
  return pool[Math.floor(ctx.random() * pool.length)];
}

function makeQuestion(ctx: EngineCtx, qid: number, item: Item, requeue: boolean): SessionQuestion {
  const perm = shuffle(item.options.map((_, i) => i), ctx.random);
  return { qid, itemId: item.id, unitId: item.unitId, perm, requeue };
}

function questionDto(ctx: EngineCtx, q: SessionQuestion): QuestionDto {
  const item = ctx.content.itemById.get(q.itemId);
  if (!item) throw new AppError('NOT_FOUND', 'Sual artıq mövcud deyil.');
  const topic = ctx.content.topicById.get(item.topicId);
  return {
    qid: q.qid, type: item.type, stem: item.stem,
    statements: item.type === 'single' ? item.statements : undefined,
    options: q.perm.map((i) => item.options[i]),
    points: item.points, requeue: q.requeue, topicTitle: topic?.shortTitle ?? '',
  };
}

function sessionDto(ctx: EngineCtx, s: Session, u: UserRecord, title: string, subtitle: string, cards: CardDto[], notice?: string): SessionDto {
  const exam = s.kind === 'final' || s.kind === 'mock';
  const maxPoints = s.questions.filter((q) => !q.requeue).reduce((a, q) => a + (ctx.content.itemById.get(q.itemId)?.points ?? 1), 0);
  return {
    id: s.id, kind: s.kind, title, subtitle, cards,
    questions: s.questions.map((q) => questionDto(ctx, q)),
    examMode: exam, timeLimitSec: s.timeLimitSec, expiresAt: s.expiresAt,
    hearts: s.kind === 'lesson' ? heartsDto(u, ctx.now) : null,
    maxPoints,
    targetPercent: s.kind === 'final' ? FINAL_PASS_PCT : s.kind === 'mock' ? targetPercent(u.category, u.subgroup) : null,
    notice,
  };
}

function newSession(ctx: EngineCtx, u: UserRecord, kind: SessionKind, extra: Partial<Session>): Session {
  return {
    id: ctx.newId(), userId: u.id, kind, lessonId: null, topicId: null, createdAt: ctx.now,
    expiresAt: ctx.now + SESSION_TTL, timeLimitSec: null, questions: [], completedAt: null, xp: 0,
    heartsOut: false, suspicion: 0, result: null, ...extra,
  };
}

function dueUnits(ctx: EngineCtx, cat: Category, srs: Map<string, SrsState>, exclude: Set<string>): Unit[] {
  return ctx.content.unitsForCategory(cat)
    .filter((x) => !exclude.has(x.id))
    .map((x) => ({ x, s: srs.get(x.id) }))
    .filter((r): r is { x: Unit; s: SrsState } => !!r.s && r.s.dueAt <= ctx.now)
    .sort((a, b) => priority(b.s, ctx.now, b.x.importance) - priority(a.s, ctx.now, a.x.importance))
    .map((r) => r.x);
}

export async function startLesson(ctx: EngineCtx, userId: string, lessonId: string): Promise<SessionDto> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  const lesson = ctx.content.lessonById.get(lessonId);
  if (!lesson || !lesson.categories.includes(cat)) throw new AppError('NOT_FOUND', 'Dərs tapılmadı.');
  if (!topicAccessible(ctx, lesson.topicId, u)) throw new AppError('PREMIUM_REQUIRED', 'Bu mövzu Premium planına daxildir.');
  const premium = isPremium(u, ctx.now);
  if (!premium && u.hearts.lockedUntil && u.hearts.lockedUntil > ctx.now) {
    throw new AppError('HEARTS_LOCKED', 'Canların bitib. Bərpa olunana qədər təkrar edə bilərsən.', { lockedUntil: u.hearts.lockedUntil });
  }
  const p = await loadProgress(ctx, userId);
  const state = lessonStates(ctx, lesson.topicId, cat, p.lessons).find((s) => s.lesson.id === lessonId);
  if (state?.state === 'locked') throw new AppError('LESSON_LOCKED', 'Əvvəlki dərsi bitir, sonra bu dərs açılacaq.');

  const units = ctx.content.unitsForLesson(lessonId);
  const ordered = [
    ...shuffle(units.filter((x) => !p.srs.has(x.id)), ctx.random),
    ...units.filter((x) => p.srs.has(x.id)).sort((a, b) => retrievability(p.srs.get(a.id), ctx.now) - retrievability(p.srs.get(b.id), ctx.now)),
  ].slice(0, LESSON_QUESTIONS);
  const tail = dueUnits(ctx, cat, p.srs, new Set(units.map((x) => x.id))).slice(0, LESSON_REVIEW_TAIL);

  const s = newSession(ctx, u, 'lesson', { lessonId, topicId: lesson.topicId });
  for (const unit of [...shuffle(ordered, ctx.random), ...tail]) {
    const item = pickItem(ctx, unit.id, p.srs.get(unit.id)?.lastItemId ?? null);
    if (item) s.questions.push(makeQuestion(ctx, s.questions.length, item, false));
  }
  if (s.questions.length === 0) throw new AppError('NOT_FOUND', 'Bu dərsdə hələ sual yoxdur.');
  await ctx.store.saveSession(s);
  const topic = ctx.content.topicById.get(lesson.topicId)!;
  const cards: CardDto[] = ctx.content.cards(lessonId).map((c) => ({ id: c.id, kind: c.kind, title: c.title, body: c.body, ref: c.ref }));
  return sessionDto(ctx, s, u, lesson.title, topic.shortTitle, cards);
}

export async function startReview(ctx: EngineCtx, userId: string): Promise<SessionDto> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  const p = await loadProgress(ctx, userId);
  let units = dueUnits(ctx, cat, p.srs, new Set()).slice(0, REVIEW_QUESTIONS);
  let notice: string | undefined;
  if (units.length === 0) {
    units = ctx.content.unitsForCategory(cat)
      .filter((x) => p.srs.has(x.id))
      .sort((a, b) => retrievability(p.srs.get(a.id), ctx.now) - retrievability(p.srs.get(b.id), ctx.now))
      .slice(0, REVIEW_QUESTIONS);
    notice = 'Vaxtı çatmış təkrar yoxdur. Ən zəif xatırladığın suallardan əlavə məşq.';
  }
  if (units.length === 0) throw new AppError('NOTHING_TO_REVIEW', 'Hələ təkrar ediləcək sual yoxdur. Əvvəlcə bir dərs keç.');
  const s = newSession(ctx, u, 'review', {});
  for (const unit of units) {
    const item = pickItem(ctx, unit.id, p.srs.get(unit.id)?.lastItemId ?? null);
    if (item) s.questions.push(makeQuestion(ctx, s.questions.length, item, false));
  }
  await ctx.store.saveSession(s);
  return sessionDto(ctx, s, u, 'Gündəlik təkrar', `${s.questions.length} sual`, [], notice);
}

export async function startWeak(ctx: EngineCtx, userId: string, topicId: string): Promise<SessionDto> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  if (!isPremium(u, ctx.now)) throw new AppError('PREMIUM_REQUIRED', 'Zəif mövzular Premium funksiyasıdır.');
  const topic = ctx.content.topicById.get(topicId);
  if (!topic) throw new AppError('NOT_FOUND', 'Mövzu tapılmadı.');
  const p = await loadProgress(ctx, userId);
  const units = ctx.content.unitsForTopic(topicId, cat)
    .filter((x) => p.srs.has(x.id))
    .sort((a, b) => {
      const sa = p.srs.get(a.id)!; const sb = p.srs.get(b.id)!;
      return (Number(sb.isLeech) - Number(sa.isLeech)) || retrievability(sa, ctx.now) - retrievability(sb, ctx.now);
    })
    .slice(0, REVIEW_QUESTIONS);
  if (units.length === 0) throw new AppError('NOTHING_TO_REVIEW', 'Bu mövzuda hələ öyrənilmiş sual yoxdur.');
  const s = newSession(ctx, u, 'weak', { topicId });
  for (const unit of units) {
    const item = pickItem(ctx, unit.id, p.srs.get(unit.id)?.lastItemId ?? null);
    if (item) s.questions.push(makeQuestion(ctx, s.questions.length, item, false));
  }
  await ctx.store.saveSession(s);
  return sessionDto(ctx, s, u, `Gücləndirmə: ${topic.shortTitle}`, `${s.questions.length} sual`, []);
}

export async function startFinal(ctx: EngineCtx, userId: string, topicId: string): Promise<SessionDto> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  const topic = ctx.content.topicById.get(topicId);
  if (!topic || !topic.categories.includes(cat)) throw new AppError('NOT_FOUND', 'Mövzu tapılmadı.');
  if (!topicAccessible(ctx, topicId, u)) throw new AppError('PREMIUM_REQUIRED', 'Bu mövzu Premium planına daxildir.');
  const p = await loadProgress(ctx, userId);
  const states = lessonStates(ctx, topicId, cat, p.lessons);
  if (states.some((s) => s.state !== 'done')) throw new AppError('FINAL_LOCKED', 'Final testi mövzunun bütün dərsləri bitəndə açılır.');
  const fin = p.finals.get(topicId);
  if (!isPremium(u, ctx.now) && fin && ctx.now - fin.lastAttemptAt < FREE_FINAL_COOLDOWN) {
    throw new AppError('FINAL_COOLDOWN', 'Pulsuz planda final testinə 24 saatda bir dəfə girmək olar.', { nextAttemptAt: fin.lastAttemptAt + FREE_FINAL_COOLDOWN });
  }
  const units = shuffle(ctx.content.unitsForTopic(topicId, cat), ctx.random).slice(0, FINAL_QUESTIONS);
  const s = newSession(ctx, u, 'final', { topicId });
  for (const unit of units) {
    const item = pickItem(ctx, unit.id, null);
    if (item) s.questions.push(makeQuestion(ctx, s.questions.length, item, false));
  }
  if (s.questions.length === 0) throw new AppError('NOT_FOUND', 'Bu mövzuda hələ sual yoxdur.');
  s.timeLimitSec = s.questions.length * 60;
  s.expiresAt = ctx.now + s.timeLimitSec * 1000 + 5 * MINUTE;
  // The attempt counts when it starts, so restarting cannot dodge the free-plan cooldown.
  await ctx.store.saveTopicFinal(userId, { topicId, bestPct: fin?.bestPct ?? 0, passedAt: fin?.passedAt ?? null, lastAttemptAt: ctx.now, attempts: (fin?.attempts ?? 0) + 1 });
  await ctx.store.saveSession(s);
  return sessionDto(ctx, s, u, `Final testi: ${topic.shortTitle}`, `${s.questions.length} sual · keçid ${FINAL_PASS_PCT}%`, []);
}

export async function startMock(ctx: EngineCtx, userId: string): Promise<SessionDto> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  if (!isPremium(u, ctx.now)) throw new AppError('PREMIUM_REQUIRED', 'Sınaq imtahanı Premium funksiyasıdır.');
  const fmt = EXAM_FORMATS[cat];
  const units = ctx.content.unitsForCategory(cat);
  const multiUnits = shuffle(units.filter((x) => ctx.content.itemsForUnit(x.id).some((i) => i.type === 'multi')), ctx.random);
  const singleUnits = units.filter((x) => ctx.content.itemsForUnit(x.id).some((i) => i.type === 'single'));

  // Spread closed questions across topics in proportion to their size, as the real test covers the whole programme.
  const byTopic = new Map<string, Unit[]>();
  for (const x of shuffle(singleUnits, ctx.random)) {
    const a = byTopic.get(x.topicId) ?? [];
    a.push(x);
    byTopic.set(x.topicId, a);
  }
  const openPicked = multiUnits.slice(0, fmt.lawOpen);
  const closedNeeded = fmt.lawClosed + (fmt.lawOpen - openPicked.length);
  const total = singleUnits.length || 1;
  const picked: Unit[] = [];
  const used = new Set(openPicked.map((x) => x.id));
  for (const [, list] of byTopic) {
    const share = Math.max(1, Math.round((list.length / total) * closedNeeded));
    for (const x of list.slice(0, share)) if (!used.has(x.id) && picked.length < closedNeeded) { picked.push(x); used.add(x.id); }
  }
  for (const x of shuffle(singleUnits, ctx.random)) {
    if (picked.length >= closedNeeded) break;
    if (!used.has(x.id)) { picked.push(x); used.add(x.id); }
  }
  const s = newSession(ctx, u, 'mock', {});
  for (const x of shuffle(picked, ctx.random)) {
    const item = pickItem(ctx, x.id, null, 'single');
    if (item) s.questions.push(makeQuestion(ctx, s.questions.length, item, false));
  }
  for (const x of openPicked) {
    const item = pickItem(ctx, x.id, null, 'multi');
    if (item) s.questions.push(makeQuestion(ctx, s.questions.length, item, false));
  }
  s.timeLimitSec = MOCK_MINUTES * 60;
  s.expiresAt = ctx.now + s.timeLimitSec * 1000 + 5 * MINUTE;
  await ctx.store.saveSession(s);
  const notice = fmt.lawOpen > 0 && openPicked.length < fmt.lawOpen
    ? `Bankda kifayət qədər açıq tapşırıq yoxdur: ${fmt.lawOpen - openPicked.length} açıq tapşırıq qapalı sualla əvəz edildi.`
    : undefined;
  return sessionDto(ctx, s, u, `Sınaq imtahanı · ${cat}`, `Qanunvericilik: ${fmt.lawClosed} qapalı + ${fmt.lawOpen} açıq · ${MOCK_MINUTES} dəq`, [], notice);
}

async function loadOpenSession(ctx: EngineCtx, userId: string, sessionId: string): Promise<Session> {
  const s = await ctx.store.getSession(sessionId);
  if (!s || s.userId !== userId) throw new AppError('NOT_FOUND', 'Sessiya tapılmadı.');
  if (s.completedAt) throw new AppError('SESSION_CLOSED', 'Bu sessiya artıq bitib.');
  return s;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

export async function answer(ctx: EngineCtx, userId: string, sessionId: string, qid: number, given: number[], ms: number): Promise<AnswerDto> {
  const s = await loadOpenSession(ctx, userId, sessionId);
  if (ctx.now > s.expiresAt) throw new AppError('SESSION_CLOSED', 'Sessiyanın vaxtı bitib.');
  if (s.heartsOut) throw new AppError('SESSION_CLOSED', 'Canların bitdiyi üçün dərs dayandı.');
  const q = s.questions.find((x) => x.qid === qid);
  if (!q) throw new AppError('NOT_FOUND', 'Sual tapılmadı.');
  if (q.answer) throw new AppError('ALREADY_ANSWERED', 'Bu suala artıq cavab verilib.');
  const item = ctx.content.itemById.get(q.itemId);
  if (!item) throw new AppError('NOT_FOUND', 'Sual artıq mövcud deyil.');
  if (!Array.isArray(given) || given.some((g) => !Number.isInteger(g) || g < 0 || g >= q.perm.length)) {
    throw new AppError('VALIDATION', 'Cavab formatı yanlışdır.');
  }
  if (item.type === 'single' && given.length !== 1) throw new AppError('VALIDATION', 'Bir variant seçin.');

  const u = await loadUser(ctx, userId);
  const premium = isPremium(u, ctx.now);
  const canonical = [...new Set(given)].map((g) => q.perm[g]);
  const correct = sameSet(canonical, item.answer);
  const text = item.stem + ' ' + (item.statements ?? []).join(' ') + ' ' + item.options.join(' ');
  const minMs = 800 + 25 * text.split(/\s+/).length;
  const tooFast = ms < minMs;
  if (tooFast) s.suspicion++;
  q.answer = { correct, ms: Math.max(0, Math.round(ms)), at: ctx.now, points: correct ? item.points : 0, given: canonical };

  // Spaced repetition is updated in every mode; exam questions are retrieval practice too.
  const [stored] = await ctx.store.getSrs(userId, [q.unitId]);
  const prev = stored ?? newSrsState(q.unitId, ctx.now);
  const grade = toGrade(correct, ms, readingMs(text));
  const examAt = u.examDate ? dayStart(u.examDate) : null;
  const next = { ...schedule(prev, grade, ctx.now, { examAt, random: ctx.random }), lastItemId: item.id };
  await ctx.store.saveSrs(userId, [next]);
  const log: ReviewLog = {
    userId, unitId: q.unitId, itemId: item.id, sessionId, grade, correct, responseMs: q.answer.ms,
    intervalBefore: prev.intervalDays, intervalAfter: next.intervalDays, at: ctx.now,
  };
  await ctx.store.addReviewLogs([log]);

  let appended: QuestionDto | undefined;
  if (s.kind === 'lesson' && !premium && !correct) {
    u.hearts = loseHeart(u.hearts, ctx.now);
    if (u.hearts.current === 0) s.heartsOut = true;
    await ctx.store.saveUser(u);
  }
  const exam = s.kind === 'final' || s.kind === 'mock';
  if (!exam && !correct && !q.requeue && !s.heartsOut) {
    const again = pickItem(ctx, q.unitId, item.id) ?? item;
    const nq = makeQuestion(ctx, s.questions.length, again, true);
    s.questions.push(nq);
    appended = questionDto(ctx, nq);
  }
  await ctx.store.saveSession(s);

  const source = item.source ? item.source.file + (item.source.no ? `, sual ${item.source.no}` : '') : undefined;
  if (exam) return { recorded: true, hearts: null, heartsOut: false };
  return {
    recorded: true, correct,
    correctIndexes: item.answer.map((a) => q.perm.indexOf(a)),
    explanation: item.explanation, ref: item.ref, source,
    hearts: s.kind === 'lesson' ? heartsDto(u, ctx.now) : null,
    heartsOut: s.heartsOut, appended,
  };
}

function reviewEntries(ctx: EngineCtx, s: Session): ReviewEntryDto[] {
  return s.questions.filter((q) => !q.requeue).map((q) => {
    const item = ctx.content.itemById.get(q.itemId)!;
    return {
      qid: q.qid, stem: item.stem, statements: item.type === 'single' ? item.statements : undefined,
      options: q.perm.map((i) => item.options[i]),
      given: (q.answer?.given ?? []).map((g) => q.perm.indexOf(g)),
      correctIndexes: item.answer.map((a) => q.perm.indexOf(a)),
      correct: !!q.answer?.correct, explanation: item.explanation, ref: item.ref,
      topicTitle: ctx.content.topicById.get(item.topicId)?.shortTitle ?? '',
    };
  });
}

export async function complete(ctx: EngineCtx, userId: string, sessionId: string): Promise<CompleteDto> {
  const existing = await ctx.store.getSession(sessionId);
  if (existing && existing.userId === userId && existing.completedAt && existing.result) return existing.result as CompleteDto;
  const s = await loadOpenSession(ctx, userId, sessionId);
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  const premium = isPremium(u, ctx.now);
  const p = await loadProgress(ctx, userId);
  const rankBefore = rankDto(ctx, u, p);

  const first = s.questions.filter((q) => !q.requeue);
  const firstCorrect = first.filter((q) => q.answer?.correct).length;
  const points = first.reduce((a, q) => a + (q.answer?.points ?? 0), 0);
  const maxPoints = first.reduce((a, q) => a + (ctx.content.itemById.get(q.itemId)?.points ?? 1), 0);
  const pct = maxPoints ? Math.round((points / maxPoints) * 100) : 0;
  const exam = s.kind === 'final' || s.kind === 'mock';
  if (!exam && !s.heartsOut && first.some((q) => !q.answer)) throw new AppError('VALIDATION', 'Bütün suallara cavab verin.');

  let xp = 0;
  let passed: boolean | null = null;
  let completed = true;
  let heartEarned = false;
  let target: number | null = null;

  if (s.kind === 'lesson') {
    if (s.heartsOut) {
      completed = false;
    } else {
      const prev = p.lessons.get(s.lessonId!);
      const recent = (prev?.recent ?? []).filter((t) => ctx.now - t < 7 * DAY);
      xp = lessonXp(firstCorrect, first.length, recent.length);
      await ctx.store.saveLessonProgress(userId, {
        lessonId: s.lessonId!, completions: (prev?.completions ?? 0) + 1,
        bestCorrect: Math.max(prev?.bestCorrect ?? 0, firstCorrect), lastCompletedAt: ctx.now, recent: [...recent, ctx.now].slice(-5),
      });
    }
  } else if (s.kind === 'review' || s.kind === 'weak') {
    xp = reviewXp(firstCorrect);
    if (!premium && first.length >= 10 && firstCorrect >= HEARTS_EARN_MIN_CORRECT && canEarnHeart(u.hearts)) {
      u.hearts = earnHeart(u.hearts);
      heartEarned = true;
    }
  } else if (s.kind === 'final') {
    target = FINAL_PASS_PCT;
    passed = pct >= FINAL_PASS_PCT;
    const fin = p.finals.get(s.topicId!);
    const firstPass = passed && !fin?.passedAt;
    xp = finalXp(pct, firstPass);
    await ctx.store.saveTopicFinal(userId, {
      topicId: s.topicId!, bestPct: Math.max(fin?.bestPct ?? 0, pct),
      passedAt: fin?.passedAt ?? (passed ? ctx.now : null),
      lastAttemptAt: fin?.lastAttemptAt ?? s.createdAt, attempts: fin?.attempts ?? 1,
    });
  } else {
    target = targetPercent(cat, u.subgroup);
    passed = pct >= target;
    xp = finalXp(pct, true);
  }

  // Leaderboard eligibility: premium, verified, not banned, plausible timing, under the daily cap.
  const fast = s.suspicion > SUSPICION_LIMIT;
  let lbXp = 0;
  if (xp > 0 && premium && u.emailVerified && !u.leaderboardBanned && !fast) {
    lbXp = Math.max(0, Math.min(xp, XP.dailyLeaderboardCap - u.today.lbXp));
  }
  if (xp > 0) {
    if (lbXp > 0) {
      await ctx.store.addXpEvent({ userId, sessionId, source: s.kind, amount: lbXp, correct: firstCorrect, answered: first.length, leaderboard: true, category: cat, at: ctx.now });
    }
    if (xp - lbXp > 0) {
      await ctx.store.addXpEvent({ userId, sessionId, source: s.kind, amount: xp - lbXp, correct: lbXp > 0 ? 0 : firstCorrect, answered: lbXp > 0 ? 0 : first.length, leaderboard: false, category: cat, at: ctx.now });
    }
  }
  u.xpTotal += xp;
  u.today = { day: dayKey(ctx.now), xp: u.today.xp + xp, lbXp: u.today.lbXp + lbXp };
  const before = visibleStreak(u.streak, ctx.now, premium);
  if (completed) u.streak = touchStreak(u.streak, ctx.now, premium);
  const after = visibleStreak(u.streak, ctx.now, premium);
  await ctx.store.saveUser(u);

  s.completedAt = ctx.now;
  s.xp = xp;
  const p2 = await loadProgress(ctx, userId);
  const rankAfter = rankDto(ctx, u, p2);
  const result: CompleteDto = {
    kind: s.kind, completed, xp, correct: firstCorrect, total: first.length, points, maxPoints, pct, passed,
    targetPercent: target, streak: after, streakIncreased: after > before, heartEarned,
    hearts: heartsDto(u, ctx.now),
    rank: rankAfter ? { title: rankAfter.title, changed: !!rankBefore && rankBefore.code !== rankAfter.code } : null,
    review: s.kind === 'lesson' ? [] : reviewEntries(ctx, s),
    leaderboardCounted: lbXp > 0,
  };
  s.result = result;
  await ctx.store.saveSession(s);
  return result;
}

// ---------------------------------------------------------------- leaderboard and weak topics

export async function getLeaderboard(ctx: EngineCtx, userId: string, period: Period, scope: Scope): Promise<LeaderboardDto> {
  const u = await loadUser(ctx, userId);
  const start = periodStartKey(period, ctx.now);
  const rows = await ctx.store.getLeaderboard(period, start, scope, 100);
  const premium = isPremium(u, ctx.now);
  const entry = premium ? await ctx.store.getLeaderboardEntry(period, start, scope, userId) : null;
  let previewRank: number | null = null;
  if (!premium) {
    const xp = await ctx.store.sumXp(userId, dayStart(start));
    previewRank = xp > 0 ? await ctx.store.rankForXp(period, start, scope, xp) : null;
  }
  return {
    period, scope, periodStart: start, periodEnd: periodEnd(period, start), rows,
    me: entry ? { rank: entry.rank, xp: entry.xp } : null,
    eligible: premium && !u.leaderboardBanned,
    previewRank,
  };
}

export async function getWeakTopics(ctx: EngineCtx, userId: string): Promise<WeakTopicDto[]> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  if (!isPremium(u, ctx.now)) throw new AppError('PREMIUM_REQUIRED', 'Zəif mövzular Premium funksiyasıdır.');
  const srs = new Map((await ctx.store.getSrs(userId)).map((s) => [s.unitId, s]));
  const out: WeakTopicDto[] = [];
  for (const t of ctx.content.topicsFor(cat)) {
    const seen = ctx.content.unitsForTopic(t.id, cat).filter((x) => srs.has(x.id));
    if (seen.length === 0) continue;
    const states = seen.map((x) => srs.get(x.id)!);
    const m = mastery(seen, srs, ctx.now);
    const reps = states.reduce((a, s) => a + s.reps, 0);
    const lapses = states.reduce((a, s) => a + s.lapses, 0);
    const errorRate = reps ? lapses / reps : 0;
    const leeches = states.filter((s) => s.isLeech).length;
    const score = 0.5 * (1 - m) + 0.3 * errorRate + 0.2 * Math.min(1, leeches / 5);
    out.push({ topicId: t.id, title: t.shortTitle, score: Math.round(score * 100) / 100, mastery: Math.round(m * 100), errorRate: Math.round(errorRate * 100) / 100, leeches, seen: seen.length });
  }
  return out.sort((a, b) => b.score - a.score);
}

export async function reportItem(ctx: EngineCtx, userId: string, sessionId: string, qid: number, reason: string, body: string): Promise<void> {
  const s = await ctx.store.getSession(sessionId);
  if (!s || s.userId !== userId) throw new AppError('NOT_FOUND', 'Sessiya tapılmadı.');
  const q = s.questions.find((x) => x.qid === qid);
  if (!q) throw new AppError('NOT_FOUND', 'Sual tapılmadı.');
  if (!['wrong_answer', 'outdated', 'typo', 'unclear', 'other'].includes(reason)) throw new AppError('VALIDATION', 'Səbəb yanlışdır.');
  await ctx.store.addReport({ userId, itemId: q.itemId, reason, body: body.slice(0, 2000), at: ctx.now });
}

/** Grants or extends premium (admin action, and the payment webhook later). Premium starts with two streak freezes. */
export async function grantPremium(ctx: EngineCtx, userId: string, until: number | null): Promise<void> {
  const u = await loadUser(ctx, userId);
  const was = isPremium(u, ctx.now);
  u.premiumUntil = until;
  if (!was && until && until > ctx.now) {
    u.streak = { ...u.streak, freezesLeft: 2, freezeMonth: dayKey(ctx.now).slice(0, 7) };
  }
  await ctx.store.saveUser(u);
}

