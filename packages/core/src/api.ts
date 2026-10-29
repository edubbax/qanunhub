// Data transfer objects shared by the server, the HTTP client and the in-browser demo.
import type { CardKind, Category, ItemType, LeaderboardRow, Period, Role, Scope, SessionKind } from './types';

export interface HeartsDto {
  current: number;
  max: number;
  lockedUntil: number | null;
  canEarn: boolean;
}

export interface RankDto {
  code: string;
  title: string;
  nextTitle: string | null;
  passedPct: number;
  nextPassedPct: number | null;
  nextXp: number | null;
}

export interface MeDto {
  id: string;
  email: string;
  nickname: string;
  role: Role;
  category: Category | null;
  subgroup: string | null;
  examDate: string | null;
  dailyGoal: number;
  premium: boolean;
  premiumUntil: number | null;
  emailVerified: boolean;
  xpTotal: number;
  todayXp: number;
  hearts: HeartsDto | null;   // null for premium learners
  streak: number;
  longestStreak: number;
  freezesLeft: number;
  rank: RankDto | null;       // null on the free plan
}

export interface HomeDto {
  me: MeDto;
  dueCount: number;
  nextLesson: { id: string; title: string; topicId: string; topicTitle: string } | null;
  readiness: number;          // 0..100, importance-weighted recall over the category
  targetPercent: number;
  examDaysLeft: number | null;
  topicsTotal: number;
  topicsPassed: number;
  learnedUnits: number;
  totalUnits: number;
}

export type LessonState = 'locked' | 'available' | 'done';

export interface PathLessonDto {
  id: string;
  title: string;
  order: number;
  refs: string[];
  estMinutes: number;
  unitCount: number;
  seen: number;               // units of this lesson the learner has already met
  state: LessonState;
}

export interface PathTopicDto {
  id: string;
  programNo: string;
  title: string;
  shortTitle: string;
  note?: string;
  free: boolean;
  locked: boolean;            // premium required
  lessons: PathLessonDto[];
  doneLessons: number;
  mastery: number;            // 0..100
  final: { available: boolean; passed: boolean; bestPct: number; nextAttemptAt: number | null; questionCount: number };
}

export interface PathDto {
  category: Category;
  topics: PathTopicDto[];
}

export interface CardDto {
  id: string;
  kind: CardKind;
  title?: string;
  body: string;
  ref?: string;
}

export interface QuestionDto {
  qid: number;
  type: ItemType;
  stem: string;
  statements?: string[];
  options: string[];
  points: number;
  requeue: boolean;
  topicTitle: string;
}

export interface SessionDto {
  id: string;
  kind: SessionKind;
  title: string;
  subtitle: string;
  cards: CardDto[];
  questions: QuestionDto[];
  examMode: boolean;          // final and mock: no feedback until the end
  timeLimitSec: number | null;
  expiresAt: number;
  hearts: HeartsDto | null;
  maxPoints: number;
  targetPercent: number | null;
  notice?: string;
}

export interface AnswerDto {
  recorded: boolean;
  correct?: boolean;
  correctIndexes?: number[];
  explanation?: string;
  ref?: string;
  source?: string;
  hearts: HeartsDto | null;
  heartsOut: boolean;
  appended?: QuestionDto;
}

export interface ReviewEntryDto {
  qid: number;
  stem: string;
  statements?: string[];
  options: string[];
  given: number[];
  correctIndexes: number[];
  correct: boolean;
  explanation?: string;
  ref?: string;
  topicTitle: string;
}

export interface CompleteDto {
  kind: SessionKind;
  completed: boolean;         // false when a lesson ended because hearts ran out
  xp: number;
  correct: number;
  total: number;
  points: number;
  maxPoints: number;
  pct: number;
  passed: boolean | null;
  targetPercent: number | null;
  streak: number;
  streakIncreased: boolean;
  heartEarned: boolean;
  hearts: HeartsDto | null;
  rank: { title: string; changed: boolean } | null;
  review: ReviewEntryDto[];
  leaderboardCounted: boolean;
  /** Why XP did or did not reach the leaderboard. */
  leaderboard: 'counted' | 'no_xp' | 'not_premium' | 'unverified' | 'banned' | 'too_fast' | 'daily_cap';
}

export interface LeaderboardDto {
  period: Period;
  scope: Scope;
  periodStart: string;
  periodEnd: number;
  rows: LeaderboardRow[];
  me: { rank: number; xp: number } | null;
  eligible: boolean;
  previewRank: number | null; // where a free learner would stand with premium
}

export interface WeakTopicDto {
  topicId: string;
  title: string;
  score: number;              // 0..1, higher = weaker
  mastery: number;            // 0..100
  errorRate: number;          // 0..1
  leeches: number;
  seen: number;
}

export interface ProfilePatch {
  category?: Category;
  subgroup?: string | null;
  examDate?: string | null;
  dailyGoal?: number;
  nickname?: string;
}

export const SESSION_TITLES: Record<SessionKind, string> = {
  lesson: 'Dərs',
  review: 'Təkrar',
  weak: 'Gücləndirmə',
  final: 'Mövzu final testi',
  mock: 'Sınaq imtahanı',
};
