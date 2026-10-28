// In-memory Store. Used by unit tests and by the browser demo (serialised to localStorage).
import type { Store } from './store';
import type {
  LeaderboardRow, LessonProgress, Period, Report, ReviewLog, Scope, Session, SrsState, TopicFinal, UserRecord, XpEvent,
} from './types';
import { periodStartKey } from './time';

interface BoardEntry { xp: number; correct: number; answered: number; reachedAt: number }

export interface MemoryData {
  users: Record<string, UserRecord>;
  lessons: Record<string, Record<string, LessonProgress>>;
  finals: Record<string, Record<string, TopicFinal>>;
  srs: Record<string, Record<string, SrsState>>;
  reviews: ReviewLog[];
  sessions: Record<string, Session>;
  xp: XpEvent[];
  boards: Record<string, Record<string, BoardEntry>>;
  reports: (Report & { id: number; status: string; resolution: string })[];
}

export function emptyMemoryData(): MemoryData {
  return { users: {}, lessons: {}, finals: {}, srs: {}, reviews: [], sessions: {}, xp: [], boards: {}, reports: [] };
}

const boardKey = (period: Period, start: string, scope: Scope) => `${period}|${start}|${scope}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const SAMPLE_EMAIL_SUFFIX = '@sample.local';

export class MemoryStore implements Store {
  data: MemoryData;
  constructor(data: MemoryData = emptyMemoryData()) {
    this.data = data;
  }

  async getUser(id: string) { const u = this.data.users[id]; return u ? clone(u) : null; }
  async saveUser(u: UserRecord) { this.data.users[u.id] = clone(u); }

  async getLessonProgress(userId: string) { return Object.values(this.data.lessons[userId] ?? {}).map(clone); }
  async saveLessonProgress(userId: string, p: LessonProgress) { (this.data.lessons[userId] ??= {})[p.lessonId] = clone(p); }

  async getTopicFinals(userId: string) { return Object.values(this.data.finals[userId] ?? {}).map(clone); }
  async saveTopicFinal(userId: string, f: TopicFinal) { (this.data.finals[userId] ??= {})[f.topicId] = clone(f); }

  async getSrs(userId: string, unitIds?: string[]) {
    const all = this.data.srs[userId] ?? {};
    if (unitIds) return unitIds.map((id) => all[id]).filter(Boolean).map(clone);
    return Object.values(all).map(clone);
  }
  async saveSrs(userId: string, states: SrsState[]) {
    const m = (this.data.srs[userId] ??= {});
    for (const s of states) m[s.unitId] = clone(s);
  }
  async addReviewLogs(logs: ReviewLog[]) {
    this.data.reviews.push(...logs);
    if (this.data.reviews.length > 3000) this.data.reviews.splice(0, this.data.reviews.length - 3000);
  }

  async getSession(id: string) { const s = this.data.sessions[id]; return s ? clone(s) : null; }
  async saveSession(s: Session) {
    this.data.sessions[s.id] = clone(s);
    const ids = Object.keys(this.data.sessions);
    if (ids.length > 60) {
      const old = ids.map((k) => this.data.sessions[k]).filter((x) => x.completedAt).sort((a, b) => a.createdAt - b.createdAt);
      for (const x of old.slice(0, ids.length - 60)) delete this.data.sessions[x.id];
    }
  }

  async addXpEvent(e: XpEvent) {
    this.data.xp.push(clone(e));
    if (this.data.xp.length > 5000) this.data.xp.splice(0, this.data.xp.length - 5000);
    if (!e.leaderboard) return;
    for (const period of ['week', 'month'] as Period[]) {
      const start = periodStartKey(period, e.at);
      for (const scope of ['ALL', e.category].filter(Boolean) as Scope[]) {
        const b = (this.data.boards[boardKey(period, start, scope)] ??= {});
        const cur = b[e.userId] ?? { xp: 0, correct: 0, answered: 0, reachedAt: e.at };
        b[e.userId] = { xp: cur.xp + e.amount, correct: cur.correct + e.correct, answered: cur.answered + e.answered, reachedAt: e.at };
      }
    }
  }

  private sortedBoard(period: Period, start: string, scope: Scope): LeaderboardRow[] {
    const b = this.data.boards[boardKey(period, start, scope)] ?? {};
    const rows = Object.entries(b)
      .filter(([uid, v]) => v.xp > 0 && this.data.users[uid] && !this.data.users[uid].leaderboardBanned)
      .map(([uid, v]) => ({
        userId: uid, nickname: this.data.users[uid].nickname, xp: v.xp, correct: v.correct, answered: v.answered,
        reachedAt: v.reachedAt, rank: 0, sample: this.data.users[uid].email.endsWith(SAMPLE_EMAIL_SUFFIX) || undefined,
      }))
      .sort((a, b2) => b2.xp - a.xp || ratio(b2) - ratio(a) || a.reachedAt - b2.reachedAt);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  async getLeaderboard(period: Period, start: string, scope: Scope, limit: number) {
    return this.sortedBoard(period, start, scope).slice(0, limit);
  }
  async getLeaderboardEntry(period: Period, start: string, scope: Scope, userId: string) {
    return this.sortedBoard(period, start, scope).find((r) => r.userId === userId) ?? null;
  }
  async rankForXp(period: Period, start: string, scope: Scope, xp: number) {
    return this.sortedBoard(period, start, scope).filter((r) => r.xp > xp).length + 1;
  }
  async sumXp(userId: string, since: number) {
    return this.data.xp.filter((e) => e.userId === userId && e.at >= since).reduce((a, e) => a + e.amount, 0);
  }

  async addReport(r: Report) {
    this.data.reports.push({ ...r, id: this.data.reports.length + 1, status: 'open', resolution: '' });
  }
}

function ratio(r: { correct: number; answered: number }) {
  return r.answered ? r.correct / r.answered : 0;
}
