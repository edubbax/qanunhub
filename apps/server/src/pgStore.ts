// Store implementation on Postgres. One instance per request, bound to that request's transaction.
import type {
  LeaderboardRow, LessonProgress, Period, Report, ReviewLog, Scope, Session, SrsState, Store, TopicFinal, UserRecord, XpEvent,
} from '@qanunhub/core';
import { periodStartKey } from '@qanunhub/core';
import type { Db } from './db';

type Row = Record<string, any>;

const ts = (d: Date | string | null | undefined): number | null => (d == null ? null : new Date(d).getTime());
const dt = (n: number | null | undefined): Date | null => (n == null ? null : new Date(n));
// `date` columns are returned as 'YYYY-MM-DD' strings (see db.ts).
const isoDay = (d: string | null): string | null => (d == null ? null : String(d).slice(0, 10));

export function rowToUser(r: Row): UserRecord {
  return {
    id: r.id, email: r.email, nickname: r.nickname, role: r.role, category: r.category, subgroup: r.subgroup,
    examDate: isoDay(r.exam_date), dailyGoal: r.daily_goal, premiumUntil: ts(r.premium_until), emailVerified: r.email_verified,
    leaderboardBanned: r.leaderboard_banned, createdAt: ts(r.created_at)!, xpTotal: r.xp_total, hearts: r.hearts,
    streak: r.streak, today: r.today, categoryChangedAt: ts(r.category_changed_at),
  };
}

function rowToSrs(r: Row): SrsState {
  return {
    unitId: r.unit_id, phase: r.phase, step: r.step, ease: Number(r.ease), intervalDays: r.interval_days,
    lastGoodInterval: r.last_good_interval, dueAt: ts(r.due_at)!, reps: r.reps, lapses: r.lapses, isLeech: r.is_leech,
    lastGrade: r.last_grade, lastReviewAt: ts(r.last_review_at), lastItemId: r.last_item_id,
  };
}

export class PgStore implements Store {
  constructor(private readonly sql: Db) {}

  async getUser(id: string) {
    const [r] = await this.sql`select * from users where id = ${id}`;
    return r ? rowToUser(r) : null;
  }

  async saveUser(u: UserRecord) {
    await this.sql`
      update users set
        nickname = ${u.nickname}, role = ${u.role}, category = ${u.category}, subgroup = ${u.subgroup},
        exam_date = ${u.examDate}, daily_goal = ${u.dailyGoal}, premium_until = ${dt(u.premiumUntil)},
        email_verified = ${u.emailVerified}, leaderboard_banned = ${u.leaderboardBanned}, xp_total = ${u.xpTotal},
        hearts = ${this.sql.json(u.hearts as any)}, streak = ${this.sql.json(u.streak as any)}, today = ${this.sql.json(u.today as any)},
        category_changed_at = ${dt(u.categoryChangedAt)}
      where id = ${u.id}`;
  }

  async getLessonProgress(userId: string): Promise<LessonProgress[]> {
    const rows = await this.sql`select * from lesson_progress where user_id = ${userId}`;
    return rows.map((r) => ({ lessonId: r.lesson_id, completions: r.completions, bestCorrect: r.best_correct, lastCompletedAt: ts(r.last_completed_at)!, recent: r.recent }));
  }

  async saveLessonProgress(userId: string, p: LessonProgress) {
    await this.sql`
      insert into lesson_progress (user_id, lesson_id, completions, best_correct, last_completed_at, recent)
      values (${userId}, ${p.lessonId}, ${p.completions}, ${p.bestCorrect}, ${dt(p.lastCompletedAt)}, ${this.sql.json(p.recent)})
      on conflict (user_id, lesson_id) do update set completions = excluded.completions, best_correct = excluded.best_correct,
        last_completed_at = excluded.last_completed_at, recent = excluded.recent`;
  }

  async getTopicFinals(userId: string): Promise<TopicFinal[]> {
    const rows = await this.sql`select * from topic_finals where user_id = ${userId}`;
    return rows.map((r) => ({ topicId: r.topic_id, bestPct: r.best_pct, passedAt: ts(r.passed_at), lastAttemptAt: ts(r.last_attempt_at)!, attempts: r.attempts }));
  }

  async saveTopicFinal(userId: string, f: TopicFinal) {
    await this.sql`
      insert into topic_finals (user_id, topic_id, best_pct, passed_at, last_attempt_at, attempts)
      values (${userId}, ${f.topicId}, ${f.bestPct}, ${dt(f.passedAt)}, ${dt(f.lastAttemptAt)}, ${f.attempts})
      on conflict (user_id, topic_id) do update set best_pct = excluded.best_pct, passed_at = excluded.passed_at,
        last_attempt_at = excluded.last_attempt_at, attempts = excluded.attempts`;
  }

  async getSrs(userId: string, unitIds?: string[]) {
    const rows = unitIds
      ? await this.sql`select * from srs_state where user_id = ${userId} and unit_id = any(${unitIds})`
      : await this.sql`select * from srs_state where user_id = ${userId}`;
    return rows.map(rowToSrs);
  }

  async saveSrs(userId: string, states: SrsState[]) {
    for (const s of states) {
      await this.sql`
        insert into srs_state (user_id, unit_id, phase, step, ease, interval_days, last_good_interval, due_at, reps, lapses,
          is_leech, last_grade, last_review_at, last_item_id)
        values (${userId}, ${s.unitId}, ${s.phase}, ${s.step}, ${s.ease}, ${s.intervalDays}, ${s.lastGoodInterval}, ${dt(s.dueAt)},
          ${s.reps}, ${s.lapses}, ${s.isLeech}, ${s.lastGrade}, ${dt(s.lastReviewAt)}, ${s.lastItemId})
        on conflict (user_id, unit_id) do update set phase = excluded.phase, step = excluded.step, ease = excluded.ease,
          interval_days = excluded.interval_days, last_good_interval = excluded.last_good_interval, due_at = excluded.due_at,
          reps = excluded.reps, lapses = excluded.lapses, is_leech = excluded.is_leech, last_grade = excluded.last_grade,
          last_review_at = excluded.last_review_at, last_item_id = excluded.last_item_id`;
    }
  }

  async addReviewLogs(logs: ReviewLog[]) {
    for (const l of logs) {
      await this.sql`
        insert into review_log (user_id, unit_id, item_id, session_id, grade, correct, response_ms, interval_before, interval_after, created_at)
        values (${l.userId}, ${l.unitId}, ${l.itemId}, ${l.sessionId}, ${l.grade}, ${l.correct}, ${l.responseMs}, ${l.intervalBefore},
          ${l.intervalAfter}, ${dt(l.at)})`;
    }
  }

  async getSession(id: string): Promise<Session | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await this.sql`select data from learn_sessions where id = ${id}`;
    return r ? (r.data as Session) : null;
  }

  async saveSession(s: Session) {
    await this.sql`
      insert into learn_sessions (id, user_id, kind, data, created_at, completed_at)
      values (${s.id}, ${s.userId}, ${s.kind}, ${this.sql.json(s as any)}, ${dt(s.createdAt)}, ${dt(s.completedAt)})
      on conflict (id) do update set data = excluded.data, completed_at = excluded.completed_at`;
  }

  async addXpEvent(e: XpEvent) {
    await this.sql`
      insert into xp_events (user_id, session_id, source, amount, correct, answered, leaderboard, category, created_at)
      values (${e.userId}, ${e.sessionId}, ${e.source}, ${e.amount}, ${e.correct}, ${e.answered}, ${e.leaderboard}, ${e.category}, ${dt(e.at)})`;
    if (!e.leaderboard) return;
    for (const period of ['week', 'month'] as Period[]) {
      const start = periodStartKey(period, e.at);
      for (const scope of ['ALL', e.category].filter(Boolean) as string[]) {
        await this.sql`
          insert into leaderboard_scores (period, period_start, scope, user_id, xp, correct, answered, reached_at)
          values (${period}, ${start}, ${scope}, ${e.userId}, ${e.amount}, ${e.correct}, ${e.answered}, ${dt(e.at)})
          on conflict (period, period_start, scope, user_id) do update set xp = leaderboard_scores.xp + excluded.xp,
            correct = leaderboard_scores.correct + excluded.correct, answered = leaderboard_scores.answered + excluded.answered,
            reached_at = excluded.reached_at`;
      }
    }
  }

  async getLeaderboard(period: Period, start: string, scope: Scope, limit: number): Promise<LeaderboardRow[]> {
    const rows = await this.sql`
      select l.user_id, u.nickname, l.xp, l.correct, l.answered, l.reached_at,
        row_number() over (order by l.xp desc, (case when l.answered > 0 then l.correct::float / l.answered else 0 end) desc, l.reached_at asc) as rank
      from leaderboard_scores l join users u on u.id = l.user_id
      where l.period = ${period} and l.period_start = ${start} and l.scope = ${scope} and l.xp > 0 and not u.leaderboard_banned
      order by rank limit ${limit}`;
    return rows.map((r) => ({ userId: r.user_id, nickname: r.nickname, xp: r.xp, correct: r.correct, answered: r.answered, reachedAt: ts(r.reached_at)!, rank: Number(r.rank) }));
  }

  async getLeaderboardEntry(period: Period, start: string, scope: Scope, userId: string): Promise<LeaderboardRow | null> {
    const [r] = await this.sql`
      select * from (
        select l.user_id, u.nickname, l.xp, l.correct, l.answered, l.reached_at,
          row_number() over (order by l.xp desc, (case when l.answered > 0 then l.correct::float / l.answered else 0 end) desc, l.reached_at asc) as rank
        from leaderboard_scores l join users u on u.id = l.user_id
        where l.period = ${period} and l.period_start = ${start} and l.scope = ${scope} and l.xp > 0 and not u.leaderboard_banned
      ) b where user_id = ${userId}`;
    return r ? { userId: r.user_id, nickname: r.nickname, xp: r.xp, correct: r.correct, answered: r.answered, reachedAt: ts(r.reached_at)!, rank: Number(r.rank) } : null;
  }

  async rankForXp(period: Period, start: string, scope: Scope, xp: number) {
    const [r] = await this.sql`
      select count(*)::int as n from leaderboard_scores l join users u on u.id = l.user_id
      where l.period = ${period} and l.period_start = ${start} and l.scope = ${scope} and l.xp > ${xp} and not u.leaderboard_banned`;
    return r.n + 1;
  }

  async sumXp(userId: string, since: number) {
    const [r] = await this.sql`select coalesce(sum(amount), 0)::int as xp from xp_events where user_id = ${userId} and created_at >= ${dt(since)}`;
    return r.xp;
  }

  async addReport(r: Report) {
    await this.sql`insert into reports (user_id, item_id, reason, body, created_at) values (${r.userId}, ${r.itemId}, ${r.reason}, ${r.body}, ${dt(r.at)})`;
  }
}
