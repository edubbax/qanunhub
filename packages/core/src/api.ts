// Data transfer objects shared by the server, the HTTP client and the in-browser demo.
import type { RankTier } from './military';
import type { CardKind, Category, ItemFormat, ItemType, LeaderboardRow, Period, Role, Scope, SessionKind } from './types';

export interface HeartsDto {
  current: number;
  max: number;
  lockedUntil: number | null;
  canEarn: boolean;
}

export interface RankDto {
  code: string;
  title: string;
  tier: RankTier;
  stars: number;
  isGizir: boolean;           // free plan: every learner is Gizir
  merit: number;
  /** Merit of the current rank and of the next one, for the progress bar. */
  floorMerit: number;
  next: { code: string; title: string; merit: number; streak: number } | null;
  inactiveDays: number;
  decayPerDay: number;
  /** The rank a free learner has earned and will wear on Premium. */
  earned: { code: string; title: string } | null;
}

export interface AwardDto {
  id: string;
  title: string;
  rule: string;               // what earns the next degree
  tier: number;               // degrees earned, 0 = not yet
  maxTier: number;
  value: number;
  next: number | null;        // threshold of the next degree
  earnedAt: number | null;
  shape: 'medal' | 'order' | 'badge';
  color: 'gold' | 'silver' | 'bronze' | 'maroon';
}

export interface MeDto {
  id: string;
  email: string;
  nickname: string;
  fullName: string | null;
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
  rank: RankDto;
  awards: AwardDto[];
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
  drillCount: number;         // number drills open to the learner
}

export type LessonState = 'locked' | 'available' | 'done';

export interface PathLessonDto {
  id: string;
  sectionId: string;
  title: string;
  order: number;
  refs: string[];
  estMinutes: number;
  unitCount: number;
  seen: number;               // units of this lesson the learner has already met
  state: LessonState;
}

export interface TestStateDto {
  available: boolean;
  passed: boolean;
  bestPct: number;
  questionCount: number;
}

export interface PathSectionDto {
  id: string;
  title: string;
  order: number;
  lessonIds: string[];
  doneLessons: number;
  test: TestStateDto;
}

export interface PathTopicDto {
  id: string;
  programNo: string;
  title: string;
  shortTitle: string;
  note?: string;
  free: boolean;
  locked: boolean;            // premium required
  comingSoon: boolean;        // in the programme, material not ready yet
  sections: PathSectionDto[];
  lessons: PathLessonDto[];
  doneLessons: number;
  mastery: number;            // 0..100
  final: TestStateDto & { nextAttemptAt: number | null };
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
  facts?: string[];
  heat?: 0 | 1 | 2 | 3;
  examCount?: number;
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
  format?: ItemFormat;
}

export interface SessionDto {
  id: string;
  kind: SessionKind;
  title: string;
  subtitle: string;
  cards: CardDto[];
  questions: QuestionDto[];
  examMode: boolean;          // section test, final and mock: no feedback until the end
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
  rank: { code: string; title: string; change: 'up' | 'down' | null; merit: number; meritDelta: number; isGizir: boolean };
  awards: { id: string; title: string; tier: number }[];
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
  fullName?: string | null;
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
  drill: 'Rəqəm məşqi',
  section: 'Bölmə testi',
  competition: 'Yarış',
  final: 'Mövzu final testi',
  mock: 'Sınaq imtahanı',
};

export type CompetitionStatus = 'upcoming' | 'active' | 'finished';

export interface CompetitionDto {
  id: string;
  title: string;
  description: string;
  category: Category | null;
  startsAt: number;
  endsAt: number;
  status: CompetitionStatus;
  questionCount: number;
  timeLimitSec: number;
  participants: number;
  /** Can the learner start it now; otherwise `reason` says why. */
  canStart: boolean;
  reason: string | null;
  my: { pct: number; points: number; maxPoints: number; durationMs: number; place: number | null; certificateCode: string | null } | null;
  winners: { place: number; nickname: string; pct: number; durationMs: number; certificateCode?: string }[];
}

export interface StandingRowDto {
  place: number;
  nickname: string;
  pct: number;
  points: number;
  maxPoints: number;
  durationMs: number;
  me: boolean;
  rankCode?: string;
}

export interface CompetitionStandingsDto {
  competition: CompetitionDto;
  rows: StandingRowDto[];
}

export interface CertificateDto {
  code: string;
  name: string;
  competitionTitle: string;
  place: number;
  pct: number;
  category: Category | null;
  issuedAt: number;
}

export interface CompetitionInput {
  title: string;
  description: string;
  category: Category | null;
  startsAt: number;
  endsAt: number;
  questionCount: number;
  timeLimitSec: number;
}
