// Hearts, XP, streaks and ranks (plan section C).
import type { HeartsState, StreakState, UserRecord } from './types';
import { HOUR, addDays, dayKey, monthKey } from './time';

// ---------------------------------------------------------------- hearts (free plan only)

export const HEARTS_MAX = 3;
export const HEARTS_LOCK_MS = 4 * HOUR;
export const HEARTS_EARN_PER_DAY = 2;
export const HEARTS_EARN_MIN_CORRECT = 8; // out of a 10-question review

export function freshHearts(now: number): HeartsState {
  return { current: HEARTS_MAX, day: dayKey(now), lockedUntil: null, earnedToday: 0 };
}

/** Applies the daily refill and an expired lockout. */
export function normalizeHearts(h: HeartsState, now: number): HeartsState {
  const today = dayKey(now);
  let next = { ...h };
  if (next.lockedUntil && next.lockedUntil <= now) next = { ...next, current: HEARTS_MAX, lockedUntil: null };
  if (next.day !== today) next = { ...next, day: today, earnedToday: 0, current: next.lockedUntil ? next.current : HEARTS_MAX };
  return next;
}

export function loseHeart(h: HeartsState, now: number): HeartsState {
  const current = Math.max(0, h.current - 1);
  return { ...h, current, lockedUntil: current === 0 ? now + HEARTS_LOCK_MS : h.lockedUntil };
}

export function canEarnHeart(h: HeartsState): boolean {
  return h.current < HEARTS_MAX && h.earnedToday < HEARTS_EARN_PER_DAY;
}

export function earnHeart(h: HeartsState): HeartsState {
  if (!canEarnHeart(h)) return h;
  return { ...h, current: h.current + 1, lockedUntil: null, earnedToday: h.earnedToday + 1 };
}

// ---------------------------------------------------------------- XP

export const XP = {
  lessonBase: 10,
  lessonPerCorrect: 1,
  lessonPerCorrectMax: 8,
  lessonPerfect: 5,
  reviewBase: 5,
  reviewPerCorrect: 1,
  finalBase: 20,
  reportConfirmed: 20,
  dailyLeaderboardCap: 600,
};

/** XP for a finished lesson. `completions` is how many times the lesson was finished in the last 7 days before this one. */
export function lessonXp(firstTryCorrect: number, total: number, completions: number): number {
  const base = XP.lessonBase + Math.min(firstTryCorrect, XP.lessonPerCorrectMax) * XP.lessonPerCorrect + (total > 0 && firstTryCorrect === total ? XP.lessonPerfect : 0);
  if (completions === 0) return base;
  if (completions === 1) return Math.round(base / 2);
  return 0;
}

export function reviewXp(correct: number): number {
  return XP.reviewBase + correct * XP.reviewPerCorrect;
}

export function finalXp(pct: number, firstPass: boolean): number {
  const full = XP.finalBase + Math.round(pct / 5);
  return firstPass ? full : Math.round(full / 2);
}

// ---------------------------------------------------------------- streak

export const STREAK_FREEZES_PER_MONTH = 2;

export function freshStreak(now: number): StreakState {
  return { current: 0, longest: 0, lastDay: null, freezesLeft: 0, freezeMonth: monthKey(now) };
}

/** Called when a learner finishes a lesson or review session. Premium learners get monthly freezes that cover missed days. */
export function touchStreak(s: StreakState, now: number, premium: boolean): StreakState {
  const today = dayKey(now);
  let next = { ...s };
  const month = monthKey(now);
  if (next.freezeMonth !== month) next = { ...next, freezeMonth: month, freezesLeft: premium ? STREAK_FREEZES_PER_MONTH : 0 };
  if (next.lastDay === today) return next;
  if (next.lastDay === null) {
    next.current = 1;
  } else {
    let missed = 0;
    let d = addDays(next.lastDay, 1);
    while (d < today && missed < 400) { missed++; d = addDays(d, 1); }
    if (missed === 0) next.current += 1;
    else if (premium && missed <= next.freezesLeft) { next.freezesLeft -= missed; next.current += 1; }
    else next.current = 1;
  }
  next.lastDay = today;
  next.longest = Math.max(next.longest, next.current);
  return next;
}

/** The streak the learner sees today: 0 if yesterday was missed and no freeze can cover it. */
export function visibleStreak(s: StreakState, now: number, premium: boolean): number {
  if (!s.lastDay) return 0;
  const today = dayKey(now);
  if (s.lastDay === today || s.lastDay === addDays(today, -1)) return s.current;
  let missed = 0;
  let d = addDays(s.lastDay, 1);
  while (d < today && missed < 400) { missed++; d = addDays(d, 1); }
  return premium && missed <= s.freezesLeft ? s.current : 0;
}

// ---------------------------------------------------------------- ranks (premium)

export interface RankDef {
  code: string;
  title: string;
  minPassedPct: number;
  minXp: number;
  minRetention?: number;
}

/** Ranks follow the civil-service qualification grades ("ixtisas dərəcələri"), 7th up to "ali". */
export const RANKS: RankDef[] = [
  { code: 'd7', title: '7-ci dərəcəli', minPassedPct: 0, minXp: 0 },
  { code: 'd6', title: '6-cı dərəcəli', minPassedPct: 5, minXp: 300 },
  { code: 'd5', title: '5-ci dərəcəli', minPassedPct: 15, minXp: 1000 },
  { code: 'd4', title: '4-cü dərəcəli', minPassedPct: 30, minXp: 2000 },
  { code: 'd3', title: '3-cü dərəcəli', minPassedPct: 45, minXp: 3000 },
  { code: 'd2', title: '2-ci dərəcəli', minPassedPct: 60, minXp: 4500 },
  { code: 'd1', title: '1-ci dərəcəli', minPassedPct: 80, minXp: 6000 },
  { code: 'ali', title: 'Ali dərəcəli', minPassedPct: 100, minXp: 7000, minRetention: 0.85 },
];

export function computeRank(passedPct: number, xpTotal: number, retention: number): { current: RankDef; next: RankDef | null; index: number } {
  let index = 0;
  RANKS.forEach((r, i) => {
    if (passedPct >= r.minPassedPct && xpTotal >= r.minXp && (r.minRetention == null || retention >= r.minRetention)) index = i;
  });
  return { current: RANKS[index], next: RANKS[index + 1] ?? null, index };
}

export function isPremium(u: Pick<UserRecord, 'premiumUntil'>, now: number): boolean {
  return !!u.premiumUntil && u.premiumUntil > now;
}
