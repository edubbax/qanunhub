// Shared domain types for QanunHub: content bundle, user state, sessions and API payloads.

export type Category = 'AB' | 'AC' | 'BA' | 'BB';
export const CATEGORIES: Category[] = ['AB', 'AC', 'BA', 'BB'];
/** Categories with prepared material. The rest are listed as coming soon and cannot be chosen yet. */
export const AVAILABLE_CATEGORIES: Category[] = ['AC', 'BA', 'BB'];
export const COMING_SOON_CATEGORIES: Category[] = CATEGORIES.filter((c) => !AVAILABLE_CATEGORIES.includes(c));

// ---------------------------------------------------------------- content

export type ItemType = 'single' | 'multi';
export type ItemStatus = 'draft' | 'review' | 'published' | 'flagged';
/** exam = questions from the official sources (section tests, finals, mock exams); formative = editors' lesson checks. */
export type ItemPool = 'exam' | 'formative';

export interface Topic {
  id: string;
  programNo: string;          // "1", "2.1", "19"
  title: string;
  shortTitle: string;
  order: number;
  categories: Category[];
  free: boolean;              // available on the free plan
  lawTitle: string;
  note?: string;              // scope note shown to the learner, e.g. "BA: yalnız I–II fəsil"
}

/** A sub-topic of a topic: a run of consecutive lessons that ends with a section test. */
export interface Section {
  id: string;
  topicId: string;
  order: number;
  title: string;
}

export interface Lesson {
  id: string;
  topicId: string;
  sectionId?: string;
  order: number;
  title: string;
  refs: string[];             // article refs, e.g. ["m.1", "m.2"]
  categories: Category[];
  estMinutes: number;
}

export type CardKind = 'law' | 'note' | 'qa';

export interface Card {
  id: string;
  lessonId: string;
  order: number;
  kind: CardKind;
  title?: string;
  body: string;               // plain text with line breaks
  ref?: string;
}

export interface Unit {
  id: string;
  topicId: string;
  lessonId: string | null;    // null = topic pool (final tests, mock exams, reviews)
  categories: Category[];
  importance: 1 | 2 | 3;
  pool?: ItemPool;            // missing = exam
}

export interface ItemSource {
  file: string;
  no?: number;
}

export interface Item {
  id: string;
  unitId: string;
  topicId: string;
  lessonId: string | null;
  categories: Category[];
  type: ItemType;             // single = one correct option; multi = choose all correct statements ("açıq tapşırıq")
  stem: string;
  statements?: string[];      // numbered statements for combination / open items
  options: string[];          // for multi items the options are the statements themselves
  answer: number[];           // indexes into options (canonical order)
  points: 1 | 2;
  explanation?: string;
  ref?: string;
  source?: ItemSource;
  status: ItemStatus;
  flags: string[];            // QA flags from the content pipeline
  pool?: ItemPool;            // missing = exam
}

export interface ContentBundle {
  version: string;
  generatedAt: string;
  topics: Topic[];
  sections?: Section[];
  lessons: Lesson[];
  cards: Card[];
  units: Unit[];
  items: Item[];
}

// ---------------------------------------------------------------- user state

export type Role = 'user' | 'editor' | 'admin';

export interface HeartsState {
  current: number;
  day: string;                // Baku day key of the last refill
  lockedUntil: number | null; // epoch ms
  earnedToday: number;
}

export interface StreakState {
  current: number;
  longest: number;
  lastDay: string | null;
  freezesLeft: number;
  freezeMonth: string;        // YYYY-MM the freezes were granted for
}

export interface UserRecord {
  id: string;
  email: string;
  nickname: string;
  role: Role;
  category: Category | null;
  subgroup: string | null;
  examDate: string | null;    // YYYY-MM-DD
  dailyGoal: number;          // minutes
  premiumUntil: number | null;
  emailVerified: boolean;
  leaderboardBanned: boolean;
  createdAt: number;
  xpTotal: number;
  hearts: HeartsState;
  streak: StreakState;
  today: { day: string; xp: number; lbXp: number };
  categoryChangedAt: number | null;
}

export type SrsPhase = 'learn' | 'relearn' | 'review';

export interface SrsState {
  unitId: string;
  phase: SrsPhase;
  step: number;
  ease: number;
  intervalDays: number;
  lastGoodInterval: number;
  dueAt: number;
  reps: number;
  lapses: number;
  isLeech: boolean;
  lastGrade: number | null;
  lastReviewAt: number | null;
  lastItemId: string | null;
}

export interface LessonProgress {
  lessonId: string;
  completions: number;
  bestCorrect: number;
  lastCompletedAt: number;
  recent: number[];           // completion timestamps of the last 7 days (replay XP penalty)
}

export interface TopicFinal {
  topicId: string;
  bestPct: number;
  passedAt: number | null;
  lastAttemptAt: number;
  attempts: number;
}

export interface ReviewLog {
  userId: string;
  unitId: string;
  itemId: string;
  sessionId: string;
  grade: number;
  correct: boolean;
  responseMs: number;
  intervalBefore: number;
  intervalAfter: number;
  at: number;
}

export type SessionKind = 'lesson' | 'review' | 'weak' | 'section' | 'final' | 'mock';

export interface SessionQuestion {
  qid: number;
  itemId: string;
  unitId: string;
  perm: number[];             // displayed index -> canonical option index
  requeue: boolean;           // re-ask of a missed unit inside the same session
  isNew?: boolean;            // first time the learner sees this unit
  answer?: { correct: boolean; ms: number; at: number; points: number; given: number[] };
}

export interface Session {
  id: string;
  userId: string;
  kind: SessionKind;
  lessonId: string | null;
  topicId: string | null;
  sectionId?: string | null;
  createdAt: number;
  expiresAt: number;
  timeLimitSec: number | null;
  questions: SessionQuestion[];
  completedAt: number | null;
  xp: number;
  heartsOut: boolean;
  suspicion: number;
  result: unknown | null;     // CompleteResult once finished
}

export type Period = 'week' | 'month';
export type Scope = 'ALL' | Category;

export interface XpEvent {
  userId: string;
  sessionId: string | null;
  source: string;
  amount: number;
  correct: number;
  answered: number;
  leaderboard: boolean;
  category: Category | null;
  at: number;
}

export interface LeaderboardRow {
  userId: string;
  nickname: string;
  xp: number;
  correct: number;
  answered: number;
  reachedAt: number;
  rank: number;
  sample?: boolean;
}

export interface Report {
  userId: string;
  itemId: string;
  reason: string;
  body: string;
  at: number;
}
