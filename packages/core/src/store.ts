// Persistence port used by the engine. The server implements it on Postgres, the demo in memory.
import type {
  LeaderboardRow, LessonProgress, Period, Report, ReviewLog, Scope, Session, SrsState, TopicFinal, UserRecord, XpEvent,
} from './types';

export interface Store {
  getUser(id: string): Promise<UserRecord | null>;
  saveUser(u: UserRecord): Promise<void>;

  getLessonProgress(userId: string): Promise<LessonProgress[]>;
  saveLessonProgress(userId: string, p: LessonProgress): Promise<void>;

  getTopicFinals(userId: string): Promise<TopicFinal[]>;
  saveTopicFinal(userId: string, f: TopicFinal): Promise<void>;

  /** All states of a learner, or only the given units. */
  getSrs(userId: string, unitIds?: string[]): Promise<SrsState[]>;
  saveSrs(userId: string, states: SrsState[]): Promise<void>;
  addReviewLogs(logs: ReviewLog[]): Promise<void>;

  getSession(id: string): Promise<Session | null>;
  saveSession(s: Session): Promise<void>;

  /** Records XP; when `e.leaderboard` is set it also adds to the week and month boards for ALL and e.category. */
  addXpEvent(e: XpEvent): Promise<void>;
  getLeaderboard(period: Period, periodStart: string, scope: Scope, limit: number): Promise<LeaderboardRow[]>;
  getLeaderboardEntry(period: Period, periodStart: string, scope: Scope, userId: string): Promise<LeaderboardRow | null>;
  /** Rank a given XP score would have on a board (used for the free-plan preview). */
  rankForXp(period: Period, periodStart: string, scope: Scope, xp: number): Promise<number>;
  /** All XP a learner earned since `since`, eligible for boards or not. */
  sumXp(userId: string, since: number): Promise<number>;

  addReport(r: Report): Promise<void>;
}
