// Application service: every learner-facing operation. Pure orchestration over Store + ContentIndex,
// so the Postgres server and the in-browser demo behave identically.
import type {
  AnswerDto, AwardDto, CardDto, CertificateDto, CompetitionDto, CompetitionInput, CompetitionStandingsDto, CompleteDto, HeartsDto, HomeDto, LeaderboardDto, MeDto, PathDto, PathSectionDto,
  PathTopicDto, ProfilePatch, QuestionDto, RankDto, ReviewEntryDto, SessionDto, WeakTopicDto,
} from './api';
import { SESSION_TITLES } from './api';
import type { ContentIndex } from './content';
import { AppError } from './errors';
import { EXAM_FORMATS, MOCK_MINUTES, findSubgroup, targetPercent } from './exam';
import {
  HEARTS_EARN_MIN_CORRECT, HEARTS_MAX, XP, canEarnHeart, earnHeart, finalXp, freshHearts, freshStreak,
  isPremium, premiumSettings, lessonXp, loseHeart, normalizeHearts, reviewXp, touchStreak, visibleStreak,
} from './gamification';
import {
  AWARDS, GIZIR, MERIT_FLOOR, MILITARY_RANKS, PENALTY_OUT_OF_STARS, PENALTY_TOO_FAST, addMerit, applyDecay, bumpCounters,
  decayPerDay, freshGame, inactiveDays, meritFor, type CounterKey,
} from './military';
import { isLearned, newSrsState, priority, readingMs, retrievability, schedule, toGrade } from './srs';
import type { Store } from './store';
import { DAY, HOUR, MINUTE, dayKey, dayStart, daysBetween, periodEnd, periodStartKey } from './time';
import { displayRankCode } from './memoryStore';
import { seededRandom } from './random';
import type {
  Category, Certificate, Competition, CompetitionEntry, Item, Lesson, LessonProgress, Period, ReviewLog, Scope, Session, SessionKind, SessionQuestion, SrsState,
  TopicFinal, Unit, UserRecord,
} from './types';
import { AVAILABLE_CATEGORIES, CATEGORIES } from './types';

export interface EngineCtx {
  store: Store;
  content: ContentIndex;
  now: number;
  random: () => number;
  newId: () => string;
  /** When false, learners may switch category at any time (demo and admin use). */
  categoryChangeLimit?: boolean;
}

export const LESSON_QUESTIONS = 10;
/** A rerun that introduces at least this many new units earns full XP (big lessons take several runs). */
export const NEW_UNITS_FOR_FULL_XP = 3;
export const LESSON_REVIEW_TAIL = 3;
export const REVIEW_QUESTIONS = 10;
export const FINAL_QUESTIONS = 20;
export const SECTION_QUESTIONS = 10;
export const FINAL_PASS_PCT = 80;
export const SESSION_TTL = 60 * MINUTE;
export const FREE_FINAL_COOLDOWN = 24 * HOUR;
export const SUSPICION_LIMIT = 3;

/** Section test results share the topic_finals table under this key. */
export const sectionResultKey = (sectionId: string) => `sec:${sectionId}`;

const isExamKind = (k: SessionKind) => k === 'final' || k === 'mock' || k === 'section' || k === 'competition';

/** Share of editors' questions in tests built from both pools (section tests, finals, mock exams, competitions). */
export const FORMATIVE_SHARE = 0.3;

// ---------------------------------------------------------------- users

export function newUser(id: string, email: string, nickname: string, now: number): UserRecord {
  return {
    id, email, nickname, role: 'user', category: null, subgroup: null, examDate: null, dailyGoal: 15,
    premiumUntil: null, emailVerified: false, leaderboardBanned: false, createdAt: now, xpTotal: 0,
    hearts: freshHearts(now), streak: freshStreak(now), today: { day: dayKey(now), xp: 0, lbXp: 0 }, categoryChangedAt: null,
    fullName: null, game: freshGame(now),
  };
}

async function loadUser(ctx: EngineCtx, userId: string): Promise<UserRecord> {
  const u = await ctx.store.getUser(userId);
  if (!u) throw new AppError('UNAUTHORIZED', 'Hesab tapılmadı. Yenidən daxil ol.');
  u.hearts = normalizeHearts(u.hearts, ctx.now);
  const today = dayKey(ctx.now);
  if (u.today.day !== today) u.today = { day: today, xp: 0, lbXp: 0 };
  // Accounts created before ranks existed get a fresh record; then inactivity is charged up to yesterday.
  u.game = u.game ? { ...freshGame(ctx.now), ...u.game } : freshGame(ctx.now);
  u.fullName ??= null;
  u.game = applyDecay(u.game, u.streak, ctx.now);
  return u;
}

function requireCategory(u: UserRecord): Category {
  if (!u.category) throw new AppError('NO_CATEGORY', 'Əvvəlcə kateqoriyanı seç.');
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

function rankDto(ctx: EngineCtx, u: UserRecord): RankDto {
  const g = u.game;
  const level = Math.min(Math.max(g.level, 0), MILITARY_RANKS.length - 1);
  const r = MILITARY_RANKS[level];
  const next = MILITARY_RANKS[level + 1] ?? null;
  const base = {
    merit: g.merit, floorMerit: level === 0 ? MERIT_FLOOR : r.minMerit,
    next: next ? { code: next.code, title: next.title, merit: next.minMerit, streak: next.minStreak } : null,
    inactiveDays: inactiveDays(u.streak, ctx.now), decayPerDay: decayPerDay(g),
  };
  if (!isPremium(u, ctx.now)) {
    // While Premium is closed no officer rank is shown at all, not even as "earned".
    const earned = premiumSettings.available ? { code: r.code, title: r.title } : null;
    return { code: GIZIR.code, title: GIZIR.title, tier: GIZIR.tier, stars: GIZIR.stars, isGizir: true, ...base, earned };
  }
  return { code: r.code, title: r.title, tier: r.tier, stars: r.stars, isGizir: false, ...base, earned: null };
}

function awardsDto(u: UserRecord): AwardDto[] {
  return AWARDS.map((a) => {
    const value = u.game.counters[a.counter] ?? 0;
    const got = u.game.awards[a.id];
    const tier = got?.tier ?? 0;
    const next = a.tiers[tier] ?? null;
    return {
      id: a.id, title: a.title, rule: a.rule.replace('{n}', String(next ?? a.tiers[a.tiers.length - 1])), tier, maxTier: a.tiers.length,
      value, next, earnedAt: got?.at ?? null, shape: a.shape, color: a.color,
    };
  });
}

function meDto(ctx: EngineCtx, u: UserRecord, _p?: Progress): MeDto {
  const premium = isPremium(u, ctx.now);
  return {
    id: u.id, email: u.email, nickname: u.nickname, fullName: u.fullName, role: u.role, category: u.category, subgroup: u.subgroup,
    examDate: u.examDate, dailyGoal: u.dailyGoal, premium, premiumUntil: u.premiumUntil, emailVerified: u.emailVerified,
    xpTotal: u.xpTotal, todayXp: u.today.xp, hearts: heartsDto(u, ctx.now), streak: visibleStreak(u.streak, ctx.now, premium),
    longestStreak: u.streak.longest, freezesLeft: premium ? u.streak.freezesLeft : 0, rank: rankDto(ctx, u), awards: awardsDto(u),
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
    const done = new Set(states.filter((s) => s.state === 'done').map((s) => s.lesson.id));
    const fin = p.finals.get(t.id);
    const unitCount = ctx.content.unitsForTopic(t.id, cat).length;
    const cooldown = !isPremium(u, ctx.now) && fin ? fin.lastAttemptAt + FREE_FINAL_COOLDOWN : null;
    const sections: PathSectionDto[] = ctx.content.sectionsFor(t.id, cat).map((sec) => {
      const lessons = ctx.content.sectionLessons(sec.id, cat);
      const res = p.finals.get(sectionResultKey(sec.id));
      const sectionDone = lessons.filter((l) => done.has(l.id)).length;
      return {
        id: sec.id, title: sec.title, order: sec.order, lessonIds: lessons.map((l) => l.id), doneLessons: sectionDone,
        test: {
          available: !locked && sectionDone === lessons.length,
          passed: !!res?.passedAt,
          bestPct: res?.bestPct ?? 0,
          questionCount: Math.min(SECTION_QUESTIONS, ((x) => x.exam.length + x.formative.length)(sectionPools(ctx, lessons, cat))),
        },
      };
    });
    return {
      id: t.id, programNo: t.programNo, title: t.title, shortTitle: t.shortTitle, note: t.note, free: t.free, locked,
      comingSoon: states.length === 0,
      sections,
      lessons: states.map(({ lesson, state }) => {
        const units = ctx.content.lessonUnits(lesson.id);
        return {
          id: lesson.id, sectionId: ctx.content.sectionIdOf(lesson), title: lesson.title, order: lesson.order, refs: lesson.refs,
          estMinutes: lesson.estMinutes, unitCount: units.length, seen: units.filter((x) => p.srs.has(x.id)).length,
          state: locked ? 'locked' as const : state,
        };
      }),
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
    if (!AVAILABLE_CATEGORIES.includes(patch.category)) {
      throw new AppError('VALIDATION', `${patch.category} kateqoriyası üçün materiallar hazırlanır, tezliklə əlavə olunacaq.`);
    }
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
  if (patch.fullName !== undefined) {
    const name = patch.fullName?.trim().replace(/\s+/g, ' ') ?? '';
    if (name && !/^[\p{L}][\p{L}\s'.-]{2,59}$/u.test(name)) throw new AppError('VALIDATION', 'Ad və soyad 3–60 hərf olmalıdır.');
    u.fullName = name || null;
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
  const exam = isExamKind(s.kind);
  const maxPoints = s.questions.filter((q) => !q.requeue).reduce((a, q) => a + (ctx.content.itemById.get(q.itemId)?.points ?? 1), 0);
  return {
    id: s.id, kind: s.kind, title, subtitle, cards,
    questions: s.questions.map((q) => questionDto(ctx, q)),
    examMode: exam, timeLimitSec: s.timeLimitSec, expiresAt: s.expiresAt,
    hearts: s.kind === 'lesson' ? heartsDto(u, ctx.now) : null,
    maxPoints,
    targetPercent: s.kind === 'final' || s.kind === 'section' ? FINAL_PASS_PCT : s.kind === 'mock' ? targetPercent(u.category, u.subgroup) : null,
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
    throw new AppError('HEARTS_LOCKED', 'Paqonundakı ulduzlar bitib. Bərpa olunana qədər təkrar edə bilərsən.', { lockedUntil: u.hearts.lockedUntil });
  }
  const p = await loadProgress(ctx, userId);
  const state = lessonStates(ctx, lesson.topicId, cat, p.lessons).find((s) => s.lesson.id === lessonId);
  if (state?.state === 'locked') throw new AppError('LESSON_LOCKED', 'Əvvəlki dərsi bitir, sonra bu dərs açılacaq.');

  const units = ctx.content.lessonUnits(lessonId);
  const ordered = [
    ...shuffle(units.filter((x) => !p.srs.has(x.id)), ctx.random),
    ...units.filter((x) => p.srs.has(x.id)).sort((a, b) => retrievability(p.srs.get(a.id), ctx.now) - retrievability(p.srs.get(b.id), ctx.now)),
  ].slice(0, LESSON_QUESTIONS);
  const tail = dueUnits(ctx, cat, p.srs, new Set(units.map((x) => x.id))).slice(0, LESSON_REVIEW_TAIL);

  const s = newSession(ctx, u, 'lesson', { lessonId, topicId: lesson.topicId });
  for (const unit of [...shuffle(ordered, ctx.random), ...tail]) {
    const item = pickItem(ctx, unit.id, p.srs.get(unit.id)?.lastItemId ?? null);
    if (item) s.questions.push({ ...makeQuestion(ctx, s.questions.length, item, false), isNew: !p.srs.has(unit.id) });
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
  const units = mixPools(ctx.content.unitsForTopic(topicId, cat, 'exam'), ctx.content.unitsForTopic(topicId, cat, 'formative'), FINAL_QUESTIONS, ctx.random);
  const s = newSession(ctx, u, 'final', { topicId });
  for (const unit of shuffle(units, ctx.random)) {
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

function sectionPools(ctx: EngineCtx, lessons: Lesson[], cat: Category): { exam: Unit[]; formative: Unit[] } {
  const of = (pool: 'exam' | 'formative') => lessons.flatMap((l) => ctx.content.unitsForLesson(l.id, pool)).filter((x) => x.categories.includes(cat));
  return { exam: of('exam'), formative: of('formative') };
}

/** Up to `n` units spread across topics in proportion to their size, as the real test covers the whole programme. */
function spread(units: Unit[], n: number, random: () => number): Unit[] {
  if (n <= 0) return [];
  const byTopic = new Map<string, Unit[]>();
  for (const x of shuffle(units, random)) {
    const a = byTopic.get(x.topicId) ?? [];
    a.push(x);
    byTopic.set(x.topicId, a);
  }
  const picked: Unit[] = [];
  const used = new Set<string>();
  for (const [, list] of byTopic) {
    const share = Math.max(1, Math.round((list.length / (units.length || 1)) * n));
    for (const x of list.slice(0, share)) if (picked.length < n) { picked.push(x); used.add(x.id); }
  }
  for (const x of shuffle(units, random)) {
    if (picked.length >= n) break;
    if (!used.has(x.id)) { picked.push(x); used.add(x.id); }
  }
  return picked;
}

/**
 * `n` units mixing source questions with the editors' ones (FORMATIVE_SHARE of them); when one pool runs
 * short the other fills in.
 */
function mixPools(exam: Unit[], formative: Unit[], n: number, random: () => number): Unit[] {
  const wantFormative = Math.min(formative.length, Math.round(n * FORMATIVE_SHARE));
  const fromExam = spread(exam, n - wantFormative, random);
  const fromFormative = spread(formative, n - fromExam.length, random);
  return shuffle([...fromExam, ...fromFormative], random);
}

export async function startSection(ctx: EngineCtx, userId: string, sectionId: string): Promise<SessionDto> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  const section = ctx.content.sectionById.get(sectionId);
  const lessons = section ? ctx.content.sectionLessons(sectionId, cat) : [];
  if (!section || lessons.length === 0) throw new AppError('NOT_FOUND', 'Bölmə tapılmadı.');
  if (!topicAccessible(ctx, section.topicId, u)) throw new AppError('PREMIUM_REQUIRED', 'Bu mövzu Premium planına daxildir.');
  const p = await loadProgress(ctx, userId);
  if (lessons.some((l) => (p.lessons.get(l.id)?.completions ?? 0) === 0)) {
    throw new AppError('FINAL_LOCKED', 'Bölmə testi bölmənin bütün dərsləri bitəndə açılır.');
  }
  const pools = sectionPools(ctx, lessons, cat);
  const units = mixPools(pools.exam, pools.formative, SECTION_QUESTIONS, ctx.random);
  const s = newSession(ctx, u, 'section', { topicId: section.topicId, sectionId });
  for (const unit of shuffle(units, ctx.random)) {
    const item = pickItem(ctx, unit.id, null);
    if (item) s.questions.push(makeQuestion(ctx, s.questions.length, item, false));
  }
  if (s.questions.length === 0) throw new AppError('NOT_FOUND', 'Bu bölmədə hələ sual yoxdur.');
  s.timeLimitSec = s.questions.length * 60;
  s.expiresAt = ctx.now + s.timeLimitSec * 1000 + 5 * MINUTE;
  await ctx.store.saveSession(s);
  const topic = ctx.content.topicById.get(section.topicId)!;
  return sessionDto(ctx, s, u, `Bölmə testi: ${section.title}`, `${topic.shortTitle} · ${s.questions.length} sual · keçid ${FINAL_PASS_PCT}%`, []);
}

export async function startMock(ctx: EngineCtx, userId: string): Promise<SessionDto> {
  const u = await loadUser(ctx, userId);
  const cat = requireCategory(u);
  if (!isPremium(u, ctx.now)) throw new AppError('PREMIUM_REQUIRED', 'Sınaq imtahanı Premium funksiyasıdır.');
  const fmt = EXAM_FORMATS[cat];
  const hasType = (type: Item['type']) => (x: Unit) => ctx.content.itemsForUnit(x.id).some((i) => i.type === type);
  // Open tasks come from the sources only; closed questions mix sources with the editors' questions.
  const openPicked = spread(ctx.content.unitsForCategory(cat, 'exam').filter(hasType('multi')), fmt.lawOpen, ctx.random);
  const closedNeeded = fmt.lawClosed + (fmt.lawOpen - openPicked.length);
  const used = new Set(openPicked.map((x) => x.id));
  const picked = mixPools(
    ctx.content.unitsForCategory(cat, 'exam').filter(hasType('single')).filter((x) => !used.has(x.id)),
    ctx.content.unitsForCategory(cat, 'formative').filter(hasType('single')),
    closedNeeded, ctx.random,
  );
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
  if (s.heartsOut) throw new AppError('SESSION_CLOSED', 'Ulduzlar bitdiyi üçün dərs dayandı.');
  const q = s.questions.find((x) => x.qid === qid);
  if (!q) throw new AppError('NOT_FOUND', 'Sual tapılmadı.');
  if (q.answer) throw new AppError('ALREADY_ANSWERED', 'Bu suala artıq cavab verilib.');
  const item = ctx.content.itemById.get(q.itemId);
  if (!item) throw new AppError('NOT_FOUND', 'Sual artıq mövcud deyil.');
  if (!Array.isArray(given) || given.some((g) => !Number.isInteger(g) || g < 0 || g >= q.perm.length)) {
    throw new AppError('VALIDATION', 'Cavab formatı yanlışdır.');
  }
  if (item.type === 'single' && given.length !== 1) throw new AppError('VALIDATION', 'Bir variant seç.');

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
  const exam = isExamKind(s.kind);
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
  const levelBefore = u.game.level;
  const counters: Partial<Record<CounterKey, number>> = {};

  const first = s.questions.filter((q) => !q.requeue);
  const firstCorrect = first.filter((q) => q.answer?.correct).length;
  const points = first.reduce((a, q) => a + (q.answer?.points ?? 0), 0);
  const maxPoints = first.reduce((a, q) => a + (ctx.content.itemById.get(q.itemId)?.points ?? 1), 0);
  const pct = maxPoints ? Math.round((points / maxPoints) * 100) : 0;
  const exam = isExamKind(s.kind);
  if (!exam && !s.heartsOut && first.some((q) => !q.answer)) throw new AppError('VALIDATION', 'Bütün suallara cavab ver.');

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
      const newUnits = first.filter((q) => q.isNew).length;
      xp = lessonXp(firstCorrect, first.length, newUnits >= NEW_UNITS_FOR_FULL_XP ? 0 : recent.length);
      counters.lessons = 1;
      if (first.length > 0 && firstCorrect === first.length) counters.perfectLessons = 1;
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
  } else if (s.kind === 'section') {
    target = FINAL_PASS_PCT;
    passed = pct >= FINAL_PASS_PCT;
    const key = sectionResultKey(s.sectionId!);
    const res = p.finals.get(key);
    xp = Math.round(finalXp(pct, passed && !res?.passedAt) / 2);
    if (passed && !res?.passedAt) counters.sectionsPassed = 1;
    await ctx.store.saveTopicFinal(userId, {
      topicId: key, bestPct: Math.max(res?.bestPct ?? 0, pct), passedAt: res?.passedAt ?? (passed ? ctx.now : null),
      lastAttemptAt: ctx.now, attempts: (res?.attempts ?? 0) + 1,
    });
  } else if (s.kind === 'final') {
    target = FINAL_PASS_PCT;
    passed = pct >= FINAL_PASS_PCT;
    const fin = p.finals.get(s.topicId!);
    const firstPass = passed && !fin?.passedAt;
    xp = finalXp(pct, firstPass);
    if (firstPass) counters.finalsPassed = 1;
    if (pct === 100) counters.finals100 = 1;
    await ctx.store.saveTopicFinal(userId, {
      topicId: s.topicId!, bestPct: Math.max(fin?.bestPct ?? 0, pct),
      passedAt: fin?.passedAt ?? (passed ? ctx.now : null),
      lastAttemptAt: fin?.lastAttemptAt ?? s.createdAt, attempts: fin?.attempts ?? 1,
    });
  } else if (s.kind === 'competition') {
    xp = finalXp(pct, true);
    await finishEntry(ctx, s, u, points, maxPoints, pct);
  } else {
    target = targetPercent(cat, u.subgroup);
    passed = pct >= target;
    xp = finalXp(pct, true);
    if (passed) counters.mocksPassed = 1;
    if (pct >= 90) counters.mocks90 = 1;
  }
  counters.correct = firstCorrect;

  // Leaderboard eligibility: verified email, not banned, plausible timing, under the daily cap. Every plan takes part.
  const fast = s.suspicion > SUSPICION_LIMIT;
  let lbXp = 0;
  if (xp > 0 && u.emailVerified && !u.leaderboardBanned && !fast) {
    lbXp = Math.max(0, Math.min(xp, XP.dailyLeaderboardCap - u.today.lbXp));
  }
  const lbStatus: CompleteDto['leaderboard'] = lbXp > 0 ? 'counted' : xp <= 0 ? 'no_xp'
    : !u.emailVerified ? 'unverified' : u.leaderboardBanned ? 'banned' : fast ? 'too_fast' : 'daily_cap';
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

  // Rank: merit from XP (more with a longer streak), minus penalties for running out of stars or rushing.
  let meritDelta = completed && xp > 0 ? meritFor(xp, after) : 0;
  if (s.heartsOut) meritDelta -= PENALTY_OUT_OF_STARS;
  if (fast) meritDelta -= PENALTY_TOO_FAST;
  u.game = addMerit(u.game, meritDelta, after);
  const bumped = bumpCounters(u.game, counters, ctx.now, { bestStreak: u.streak.longest });
  u.game = bumped.game;
  await ctx.store.saveUser(u);

  s.completedAt = ctx.now;
  s.xp = xp;
  const rankAfter = rankDto(ctx, u);
  const result: CompleteDto = {
    kind: s.kind, completed, xp, correct: firstCorrect, total: first.length, points, maxPoints, pct, passed,
    targetPercent: target, streak: after, streakIncreased: after > before, heartEarned,
    hearts: heartsDto(u, ctx.now),
    rank: {
      code: rankAfter.code, title: rankAfter.title, merit: u.game.merit, meritDelta, isGizir: rankAfter.isGizir,
      change: rankAfter.isGizir || u.game.level === levelBefore ? null : u.game.level > levelBefore ? 'up' : 'down',
    },
    awards: bumped.gained,
    review: s.kind === 'lesson' ? [] : reviewEntries(ctx, s),
    leaderboardCounted: lbXp > 0,
    leaderboard: lbStatus,
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
  const eligible = u.emailVerified && !u.leaderboardBanned;
  const entry = eligible ? await ctx.store.getLeaderboardEntry(period, start, scope, userId) : null;
  let previewRank: number | null = null;
  if (!eligible) {
    const xp = await ctx.store.sumXp(userId, dayStart(start));
    previewRank = xp > 0 ? await ctx.store.rankForXp(period, start, scope, xp) : null;
  }
  return {
    period, scope, periodStart: start, periodEnd: periodEnd(period, start), rows,
    me: entry ? { rank: entry.rank, xp: entry.xp } : null,
    eligible,
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


// ---------------------------------------------------------------- competitions

export const COMPETITION_DEFAULTS = { questionCount: 20, timeLimitSec: 20 * 60 };

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function competitionStatus(c: Competition, now: number): CompetitionDto['status'] {
  if (c.finishedAt || now >= c.endsAt) return 'finished';
  return now < c.startsAt ? 'upcoming' : 'active';
}

/** Best score first, then the faster attempt, then whoever finished earlier. */
function standings(entries: CompetitionEntry[]): CompetitionEntry[] {
  return [...entries].sort((a, b) => b.points - a.points || b.pct - a.pct || a.durationMs - b.durationMs || (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
}

function certificateCode(random: () => number): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += abc[Math.floor(random() * abc.length)];
  return `QH-${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Closes a competition whose time is up: picks the top three, issues certificates and awards. */
async function settleCompetition(ctx: EngineCtx, c: Competition): Promise<Competition> {
  if (c.finishedAt || ctx.now < c.endsAt) return c;
  const ranked = standings(await ctx.store.listEntries(c.id));
  const winners: Competition['winners'] = [];
  for (const [i, e] of ranked.slice(0, 3).entries()) {
    const u = await ctx.store.getUser(e.userId);
    const name = u?.fullName || e.nickname;
    const code = certificateCode(ctx.random);
    const cert: Certificate = {
      code, competitionId: c.id, competitionTitle: c.title, userId: e.userId, name, place: i + 1, pct: e.pct,
      category: c.category ?? e.category, issuedAt: ctx.now,
    };
    await ctx.store.saveCertificate(cert);
    winners.push({ place: i + 1, userId: e.userId, nickname: e.nickname, name, points: e.points, maxPoints: e.maxPoints, pct: e.pct, durationMs: e.durationMs, certificateCode: code });
    if (u) {
      u.game = u.game ? { ...freshGame(ctx.now), ...u.game } : freshGame(ctx.now);
      u.game = bumpCounters(u.game, { competitionPodiums: 1, ...(i === 0 ? { competitionsWon: 1 } : {}) }, ctx.now).game;
      await ctx.store.saveUser(u);
    }
  }
  const done = { ...c, finishedAt: Math.max(c.endsAt, ctx.now), winners };
  await ctx.store.saveCompetition(done);
  return done;
}

async function competitionDto(ctx: EngineCtx, c: Competition, u: UserRecord | null): Promise<CompetitionDto> {
  const status = competitionStatus(c, ctx.now);
  const entry = u ? await ctx.store.getEntry(c.id, u.id) : null;
  let place: number | null = null;
  if (entry?.finishedAt) place = standings(await ctx.store.listEntries(c.id)).findIndex((e) => e.userId === entry.userId) + 1 || null;
  let reason: string | null = null;
  if (status === 'upcoming') reason = 'Yarış hələ başlamayıb.';
  else if (status === 'finished') reason = 'Yarış başa çatıb.';
  else if (!u?.category) reason = 'Əvvəlcə kateqoriyanı seç.';
  else if (c.category && c.category !== u.category) reason = `Bu yarış ${c.category} kateqoriyası üçündür.`;
  else if (!u.emailVerified) reason = 'Yarışda iştirak üçün email ünvanını təsdiqlə.';
  else if (entry) reason = 'Bu yarışda artıq iştirak etmisən.';
  const mine = c.winners.find((w) => w.userId === u?.id);
  return {
    id: c.id, title: c.title, description: c.description, category: c.category, startsAt: c.startsAt, endsAt: c.endsAt, status,
    questionCount: c.questionCount, timeLimitSec: c.timeLimitSec, participants: await ctx.store.countEntries(c.id),
    canStart: reason === null, reason,
    my: entry?.finishedAt ? { pct: entry.pct, points: entry.points, maxPoints: entry.maxPoints, durationMs: entry.durationMs, place, certificateCode: mine?.certificateCode ?? null } : null,
    winners: c.winners.map((w) => ({ place: w.place, nickname: w.nickname, pct: w.pct, durationMs: w.durationMs, ...(w.userId === u?.id ? { certificateCode: w.certificateCode } : {}) })),
  };
}

export async function listCompetitions(ctx: EngineCtx, userId: string): Promise<CompetitionDto[]> {
  const u = await loadUser(ctx, userId);
  const all = await ctx.store.listCompetitions();
  const out: CompetitionDto[] = [];
  for (const c of all) out.push(await competitionDto(ctx, await settleCompetition(ctx, c), u));
  const order = { active: 0, upcoming: 1, finished: 2 };
  return out.sort((a, b) => order[a.status] - order[b.status] || (a.status === 'finished' ? b.endsAt - a.endsAt : a.startsAt - b.startsAt));
}

export async function getStandings(ctx: EngineCtx, userId: string, competitionId: string): Promise<CompetitionStandingsDto> {
  const u = await loadUser(ctx, userId);
  const raw = await ctx.store.getCompetition(competitionId);
  if (!raw) throw new AppError('NOT_FOUND', 'Yarış tapılmadı.');
  const c = await settleCompetition(ctx, raw);
  const ranked = standings(await ctx.store.listEntries(c.id));
  const rows = [];
  for (const [i, e] of ranked.entries()) {
    if (i >= 100 && e.userId !== userId) continue;
    const other = e.userId === userId ? u : await ctx.store.getUser(e.userId);
    rows.push({
      place: i + 1, nickname: e.nickname, pct: e.pct, points: e.points, maxPoints: e.maxPoints, durationMs: e.durationMs,
      me: e.userId === userId, rankCode: other ? displayRankCode(other, ctx.now) : undefined,
    });
  }
  return { competition: await competitionDto(ctx, c, u), rows };
}

export async function startCompetition(ctx: EngineCtx, userId: string, competitionId: string): Promise<SessionDto> {
  const u = await loadUser(ctx, userId);
  const raw = await ctx.store.getCompetition(competitionId);
  if (!raw) throw new AppError('NOT_FOUND', 'Yarış tapılmadı.');
  const c = await settleCompetition(ctx, raw);
  const dto = await competitionDto(ctx, c, u);
  if (!dto.canStart) throw new AppError('COMPETITION_CLOSED', dto.reason ?? 'Yarışa başlamaq olmur.');
  const cat = requireCategory(u);
  // Everyone in a category gets the same questions; only the order of questions and options differs.
  const fair = seededRandom(hashSeed(`${c.id}|${cat}`));
  const single = (x: Unit) => ctx.content.itemsForUnit(x.id).some((i) => i.type === 'single');
  const units = mixPools(ctx.content.unitsForCategory(cat, 'exam').filter(single), ctx.content.unitsForCategory(cat, 'formative').filter(single), c.questionCount, fair);
  const s = newSession(ctx, u, 'competition', { competitionId: c.id });
  for (const unit of shuffle(units, ctx.random)) {
    const items = ctx.content.itemsForUnit(unit.id).filter((i) => i.type === 'single');
    const item = items[Math.floor(fair() * items.length)];
    if (item) s.questions.push(makeQuestion(ctx, s.questions.length, item, false));
  }
  if (s.questions.length === 0) throw new AppError('NOT_FOUND', 'Yarış üçün sual tapılmadı.');
  s.timeLimitSec = c.timeLimitSec;
  s.expiresAt = ctx.now + c.timeLimitSec * 1000 + 2 * MINUTE;
  await ctx.store.saveSession(s);
  await ctx.store.saveEntry({
    competitionId: c.id, userId, nickname: u.nickname, category: cat, sessionId: s.id, startedAt: ctx.now, finishedAt: null,
    points: 0, maxPoints: 0, pct: 0, durationMs: 0,
  });
  return sessionDto(ctx, s, u, c.title, `${s.questions.length} sual · ${Math.round(c.timeLimitSec / 60)} dəq · bir cəhd`, []);
}

/** Records the result of a competition attempt; called from complete(). */
async function finishEntry(ctx: EngineCtx, s: Session, u: UserRecord, points: number, maxPoints: number, pct: number) {
  const e = await ctx.store.getEntry(s.competitionId!, u.id);
  if (!e || e.finishedAt) return;
  const limit = (s.timeLimitSec ?? 0) * 1000;
  await ctx.store.saveEntry({ ...e, finishedAt: ctx.now, points, maxPoints, pct, durationMs: Math.min(ctx.now - s.createdAt, limit || Infinity) });
}

export async function getCertificate(ctx: EngineCtx, code: string): Promise<CertificateDto> {
  const c = await ctx.store.getCertificate(code.trim().toUpperCase());
  if (!c) throw new AppError('NOT_FOUND', 'Bu kodla sertifikat tapılmadı.');
  return { code: c.code, name: c.name, competitionTitle: c.competitionTitle, place: c.place, pct: c.pct, category: c.category, issuedAt: c.issuedAt };
}

// Admin

function validCompetition(input: CompetitionInput): CompetitionInput {
  const title = input.title?.trim() ?? '';
  if (title.length < 3 || title.length > 120) throw new AppError('VALIDATION', 'Yarışın adı 3–120 simvol olmalıdır.');
  if (!(input.endsAt > input.startsAt)) throw new AppError('VALIDATION', 'Bitmə vaxtı başlanğıcdan sonra olmalıdır.');
  if (!Number.isInteger(input.questionCount) || input.questionCount < 5 || input.questionCount > 60) throw new AppError('VALIDATION', 'Sual sayı 5–60 arasında olmalıdır.');
  if (!Number.isInteger(input.timeLimitSec) || input.timeLimitSec < 60 || input.timeLimitSec > 3 * 3600) throw new AppError('VALIDATION', 'Vaxt limiti 1–180 dəqiqə olmalıdır.');
  if (input.category !== null && !AVAILABLE_CATEGORIES.includes(input.category)) throw new AppError('VALIDATION', 'Kateqoriya yanlışdır.');
  return { ...input, title, description: (input.description ?? '').trim().slice(0, 600) };
}

export async function createCompetition(ctx: EngineCtx, input: CompetitionInput): Promise<Competition> {
  const v = validCompetition(input);
  const c: Competition = { id: ctx.newId(), ...v, createdAt: ctx.now, finishedAt: null, winners: [] };
  await ctx.store.saveCompetition(c);
  return c;
}

/** Ends a competition now (admin), so winners and certificates are issued immediately. */
export async function finishCompetitionNow(ctx: EngineCtx, competitionId: string): Promise<Competition> {
  const c = await ctx.store.getCompetition(competitionId);
  if (!c) throw new AppError('NOT_FOUND', 'Yarış tapılmadı.');
  if (c.finishedAt) return c;
  return settleCompetition(ctx, { ...c, endsAt: Math.min(c.endsAt, ctx.now), startsAt: Math.min(c.startsAt, ctx.now) });
}

/** Admin view: every competition with its winners and their certificate codes. */
export async function adminCompetitions(ctx: EngineCtx): Promise<(Competition & { status: CompetitionDto['status']; participants: number })[]> {
  const out = [];
  for (const raw of await ctx.store.listCompetitions()) {
    const c = await settleCompetition(ctx, raw);
    out.push({ ...c, status: competitionStatus(c, ctx.now), participants: await ctx.store.countEntries(c.id) });
  }
  return out;
}

/** Counts a confirmed problem report towards the "Diqqətli göz" award. */
export async function recordConfirmedReport(ctx: EngineCtx, userId: string): Promise<void> {
  const u = await ctx.store.getUser(userId);
  if (!u) return;
  u.game = u.game ? { ...freshGame(ctx.now), ...u.game } : freshGame(ctx.now);
  u.game = bumpCounters(u.game, { reportsConfirmed: 1 }, ctx.now).game;
  await ctx.store.saveUser(u);
}
