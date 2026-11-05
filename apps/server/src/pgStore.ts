// Store implementation on Postgres. One instance per request, bound to that request's transaction.
import type {
  Certificate, Competition, CompetitionEntry, LeaderboardRow, LessonProgress, Period, Report, ReviewLog, Scope, Session,
  SrsState, Store, TopicFinal, UserRecord, XpEvent,
} from '@qanunhub/core';
import { SAMPLE_EMAIL_SUFFIX, displayRankCode, freshGame, periodStartKey } from '@qanunhub/core';
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
    fullName: r.full_name ?? null, game: r.game ?? freshGame(ts(r.created_at)!),
  };
}

function rowToBoard(r: Row, now: number): LeaderboardRow {
  return {
    userId: r.user_id, nickname: r.nickname, xp: r.xp, correct: r.correct, answered: r.answered, reachedAt: ts(r.reached_at)!,
    rank: Number(r.rank), rankCode: displayRankCode({ premiumUntil: ts(r.premium_until), game: r.game }, now),
    sample: String(r.email ?? '').endsWith(SAMPLE_EMAIL_SUFFIX) || undefined,
  };
}

function rowToCompetition(r: Row): Competition {
  return {
    id: r.id, title: r.title, description: r.description, category: r.category, startsAt: ts(r.starts_at)!, endsAt: ts(r.ends_at)!,
    questionCount: r.question_count, timeLimitSec: r.time_limit_sec, createdAt: ts(r.created_at)!, finishedAt: ts(r.finished_at), winners: r.winners,
  };
}

function rowToEntry(r: Row): CompetitionEntry {
  return {
    competitionId: r.competition_id, userId: r.user_id, nickname: r.nickname, category: r.category, sessionId: r.session_id,
    startedAt: ts(r.started_at)!, finishedAt: ts(r.finished_at), points: r.points, maxPoints: r.max_points, pct: r.pct, durationMs: r.duration_ms,
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
        category_changed_at = ${dt(u.categoryChangedAt)}, full_name = ${u.fullName}, game = ${this.sql.json(u.game as any)}
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
      select l.user_id, u.nickname, u.email, u.premium_until, u.game, l.xp, l.correct, l.answered, l.reached_at,
        row_number() over (order by l.xp desc, (case when l.answered > 0 then l.correct::float / l.answered else 0 end) desc, l.reached_at asc) as rank
      from leaderboard_scores l join users u on u.id = l.user_id
      where l.period = ${period} and l.period_start = ${start} and l.scope = ${scope} and l.xp > 0 and not u.leaderboard_banned
      order by rank limit ${limit}`;
    const now = Date.now();
    return rows.map((r) => rowToBoard(r, now));
  }

  async getLeaderboardEntry(period: Period, start: string, scope: Scope, userId: string): Promise<LeaderboardRow | null> {
    const [r] = await this.sql`
      select * from (
        select l.user_id, u.nickname, u.email, u.premium_until, u.game, l.xp, l.correct, l.answered, l.reached_at,
          row_number() over (order by l.xp desc, (case when l.answered > 0 then l.correct::float / l.answered else 0 end) desc, l.reached_at asc) as rank
        from leaderboard_scores l join users u on u.id = l.user_id
        where l.period = ${period} and l.period_start = ${start} and l.scope = ${scope} and l.xp > 0 and not u.leaderboard_banned
      ) b where user_id = ${userId}`;
    return r ? rowToBoard(r, Date.now()) : null;
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

  async listCompetitions() {
    return (await this.sql`select * from competitions order by starts_at desc limit 200`).map(rowToCompetition);
  }

  async getCompetition(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await this.sql`select * from competitions where id = ${id}`;
    return r ? rowToCompetition(r) : null;
  }

  async saveCompetition(c: Competition) {
    await this.sql`
      insert into competitions (id, title, description, category, starts_at, ends_at, question_count, time_limit_sec, created_at, finished_at, winners)
      values (${c.id}, ${c.title}, ${c.description}, ${c.category}, ${dt(c.startsAt)}, ${dt(c.endsAt)}, ${c.questionCount}, ${c.timeLimitSec},
        ${dt(c.createdAt)}, ${dt(c.finishedAt)}, ${this.sql.json(c.winners as any)})
      on conflict (id) do update set title = excluded.title, description = excluded.description, category = excluded.category,
        starts_at = excluded.starts_at, ends_at = excluded.ends_at, question_count = excluded.question_count,
        time_limit_sec = excluded.time_limit_sec, finished_at = excluded.finished_at, winners = excluded.winners`;
  }

  async getEntry(competitionId: string, userId: string) {
    const [r] = await this.sql`select * from competition_entries where competition_id = ${competitionId} and user_id = ${userId}`;
    return r ? rowToEntry(r) : null;
  }

  async saveEntry(e: CompetitionEntry) {
    await this.sql`
      insert into competition_entries (competition_id, user_id, nickname, category, session_id, started_at, finished_at, points, max_points, pct, duration_ms)
      values (${e.competitionId}, ${e.userId}, ${e.nickname}, ${e.category}, ${e.sessionId}, ${dt(e.startedAt)}, ${dt(e.finishedAt)},
        ${e.points}, ${e.maxPoints}, ${e.pct}, ${Math.round(e.durationMs)})
      on conflict (competition_id, user_id) do update set finished_at = excluded.finished_at, points = excluded.points,
        max_points = excluded.max_points, pct = excluded.pct, duration_ms = excluded.duration_ms`;
  }

  async listEntries(competitionId: string) {
    return (await this.sql`select * from competition_entries where competition_id = ${competitionId} and finished_at is not null`).map(rowToEntry);
  }

  async countEntries(competitionId: string) {
    const [r] = await this.sql`select count(*)::int as n from competition_entries where competition_id = ${competitionId}`;
    return r.n;
  }

  async getCertificate(code: string): Promise<Certificate | null> {
    const [r] = await this.sql`select * from certificates where code = ${code}`;
    return r ? {
      code: r.code, competitionId: r.competition_id, competitionTitle: r.competition_title, userId: r.user_id, name: r.name,
      place: r.place, pct: r.pct, category: r.category, issuedAt: ts(r.issued_at)!,
    } : null;
  }

  async saveCertificate(c: Certificate) {
    await this.sql`
      insert into certificates (code, competition_id, competition_title, user_id, name, place, pct, category, issued_at)
      values (${c.code}, ${c.competitionId}, ${c.competitionTitle}, ${c.userId}, ${c.name}, ${c.place}, ${c.pct}, ${c.category}, ${dt(c.issuedAt)})`;
  }
}
