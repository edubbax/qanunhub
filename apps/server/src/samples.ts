// A few sample learners on each weekly and monthly board, so the leaderboard is never empty at launch.
// Their scores are modest and fixed per period: real learners overtake them as they earn XP.
import { AVAILABLE_CATEGORIES, SAMPLE_EMAIL_SUFFIX, newUser, periodStartKey, dayStart, seededRandom, type Period } from '@qanunhub/core';
import type { Sql } from './db';

// The hyphen keeps these names out of reach of real usernames ([a-z0-9_.] only), so no one can be blocked by them.
export const SAMPLE_LEARNERS = ['leyla-m', 'orxan-dq', 'nigar-88', 'tural-h', 'aysel-k', 'kamran-e', 'gunel-q', 'samir-i'];

/** Stable ids, so every server instance seeds the same rows. */
const sampleId = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export async function ensureSampleBoards(sql: Sql, now: number): Promise<void> {
  for (const period of ['week', 'month'] as Period[]) {
    const start = periodStartKey(period, now);
    const key = `${period}|${start}`;
    const [done] = await sql`select 1 from sample_seeds where key = ${key}`;
    if (done) continue;
    await sql.begin(async (tx) => {
      // Two server instances may race here; the advisory lock lets one of them seed.
      await tx`select pg_advisory_xact_lock(hashtext(${'samples:' + key}))`;
      const [again] = await tx`select 1 from sample_seeds where key = ${key}`;
      if (again) return;
      const rnd = seededRandom(hash(key));
      const startMs = dayStart(start);
      for (let i = 0; i < SAMPLE_LEARNERS.length; i++) {
        const id = sampleId(i);
        const category = AVAILABLE_CATEGORIES[i % AVAILABLE_CATEGORIES.length];
        const u = newUser(id, `sample${i + 1}${SAMPLE_EMAIL_SUFFIX}`, SAMPLE_LEARNERS[i], startMs);
        await tx`
          insert into users (id, email, nickname, role, category, daily_goal, email_verified, hearts, streak, today, game, created_at)
          values (${id}, ${u.email}, ${u.nickname}, 'user', ${category}, ${u.dailyGoal}, true, ${tx.json(u.hearts as any)},
            ${tx.json(u.streak as any)}, ${tx.json(u.today as any)}, ${tx.json(u.game as any)}, ${new Date(startMs)})
          on conflict (id) do nothing`;
        const xp = Math.round((period === 'week' ? 15 + rnd() * 160 : 60 + rnd() * 520) / 5) * 5;
        const answered = Math.max(3, Math.round(xp / 2.2));
        const correct = Math.round(answered * (0.62 + rnd() * 0.33));
        const reachedAt = new Date(Math.min(now - 60_000, startMs + Math.floor(rnd() * Math.max(1, now - startMs))));
        for (const scope of ['ALL', category]) {
          await tx`
            insert into leaderboard_scores (period, period_start, scope, user_id, xp, correct, answered, reached_at)
            values (${period}, ${start}, ${scope}, ${id}, ${xp}, ${correct}, ${answered}, ${reachedAt})
            on conflict (period, period_start, scope, user_id) do nothing`;
        }
      }
      await tx`insert into sample_seeds (key) values (${key}) on conflict do nothing`;
    });
  }
}
