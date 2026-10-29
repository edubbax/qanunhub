// Military ranks and awards. Premium learners climb from Leytenant to Ordu generalı with merit earned from
// XP and streaks, and slide back towards Kiçik leytenant when they stop training. Free learners are Gizir.
import { addDays, dayKey } from './time';
import type { GameState, StreakState } from './types';

export type RankTier = 'nco' | 'junior' | 'senior' | 'general' | 'army';

export interface MilitaryRank {
  code: string;
  title: string;
  tier: RankTier;
  /** Stars on the shoulder board. */
  stars: number;
  /** Merit needed to be promoted to (and to keep) this rank. */
  minMerit: number;
  /** Current streak needed at the moment of promotion (general ranks). */
  minStreak: number;
}

export const GIZIR: MilitaryRank = { code: 'gizir', title: 'Gizir', tier: 'nco', stars: 2, minMerit: 0, minStreak: 0 };

/** Ordered from the lowest. Index 1 (Leytenant) is where a new premium learner starts. */
export const MILITARY_RANKS: MilitaryRank[] = [
  { code: 'kl', title: 'Kiçik leytenant', tier: 'junior', stars: 1, minMerit: -Infinity, minStreak: 0 },
  // New premium learners start with 0 merit, so a few days away (or one bad session) does not cost Leytenant at once.
  { code: 'l', title: 'Leytenant', tier: 'junior', stars: 2, minMerit: -250, minStreak: 0 },
  { code: 'bl', title: 'Baş leytenant', tier: 'junior', stars: 3, minMerit: 400, minStreak: 0 },
  { code: 'kapitan', title: 'Kapitan', tier: 'junior', stars: 4, minMerit: 1000, minStreak: 0 },
  { code: 'mayor', title: 'Mayor', tier: 'senior', stars: 1, minMerit: 2000, minStreak: 0 },
  { code: 'pl', title: 'Polkovnik-leytenant', tier: 'senior', stars: 2, minMerit: 3500, minStreak: 0 },
  { code: 'polkovnik', title: 'Polkovnik', tier: 'senior', stars: 3, minMerit: 5500, minStreak: 0 },
  { code: 'gm', title: 'General-mayor', tier: 'general', stars: 1, minMerit: 8000, minStreak: 14 },
  { code: 'gl', title: 'General-leytenant', tier: 'general', stars: 2, minMerit: 11500, minStreak: 21 },
  { code: 'gp', title: 'General-polkovnik', tier: 'general', stars: 3, minMerit: 16000, minStreak: 30 },
  { code: 'og', title: 'Ordu generalı', tier: 'army', stars: 1, minMerit: 22000, minStreak: 45 },
];

export const START_LEVEL = 1;
export const MERIT_FLOOR = -600;
/** Merit lost for every day without training: 5% of the merit, at least 80 points. */
export const DECAY_SHARE = 0.05;
export const DECAY_MIN = 80;
/** "Məsuliyyətsizlik": running out of stars in a lesson, or answering faster than the text can be read. */
export const PENALTY_OUT_OF_STARS = 40;
export const PENALTY_TOO_FAST = 60;

export function rankByCode(code: string): MilitaryRank | null {
  return code === GIZIR.code ? GIZIR : MILITARY_RANKS.find((r) => r.code === code) ?? null;
}

export function freshGame(now: number): GameState {
  return { merit: 0, level: START_LEVEL, decayedThrough: dayKey(now), counters: {}, awards: {} };
}

/** Streak multiplier for merit: x1 without a streak, up to x2 with a 30-day streak. */
export function meritFor(xp: number, streak: number): number {
  return Math.round(xp * (1 + Math.min(Math.max(streak, 0), 30) / 30));
}

/** Moves the learner up while merit and streak allow it, and down while merit is below the current rank. */
export function settleLevel(g: GameState, streak: number): GameState {
  let level = Math.min(Math.max(g.level, 0), MILITARY_RANKS.length - 1);
  while (level > 0 && g.merit < MILITARY_RANKS[level].minMerit) level--;
  while (level < MILITARY_RANKS.length - 1) {
    const next = MILITARY_RANKS[level + 1];
    if (g.merit >= next.minMerit && streak >= next.minStreak) level++;
    else break;
  }
  return level === g.level ? g : { ...g, level };
}

export function addMerit(g: GameState, amount: number, streak: number): GameState {
  return settleLevel({ ...g, merit: Math.max(MERIT_FLOOR, g.merit + amount) }, streak);
}

/** Days since the last training day, not counting today. */
export function inactiveDays(streak: StreakState, now: number): number {
  if (!streak.lastDay) return 0;
  const today = dayKey(now);
  let n = 0;
  for (let d = addDays(streak.lastDay, 1); d < today && n < 400; d = addDays(d, 1)) n++;
  return n;
}

/** Applies the daily decay for every missed day since the last time it was applied. Idempotent within a day. */
export function applyDecay(g: GameState, streak: StreakState, now: number): GameState {
  const yesterday = addDays(dayKey(now), -1);
  if (!streak.lastDay || g.decayedThrough >= yesterday) return g;
  let start = addDays(streak.lastDay, 1);
  if (addDays(g.decayedThrough, 1) > start) start = addDays(g.decayedThrough, 1);
  let merit = g.merit;
  let days = 0;
  for (let d = start; d <= yesterday && days < 400; d = addDays(d, 1)) {
    merit = Math.max(MERIT_FLOOR, merit - Math.max(DECAY_MIN, Math.round(Math.max(merit, 0) * DECAY_SHARE)));
    days++;
  }
  const next = { ...g, merit, decayedThrough: yesterday };
  return days ? settleLevel(next, 0) : next;
}

export function decayPerDay(g: GameState): number {
  return Math.max(DECAY_MIN, Math.round(Math.max(g.merit, 0) * DECAY_SHARE));
}

// ---------------------------------------------------------------- awards

export type CounterKey =
  | 'lessons' | 'perfectLessons' | 'sectionsPassed' | 'finalsPassed' | 'finals100' | 'mocksPassed' | 'mocks90'
  | 'correct' | 'competitionsWon' | 'competitionPodiums' | 'reportsConfirmed' | 'bestStreak';

export interface AwardDef {
  id: string;
  title: string;
  /** What earns it; `{n}` is replaced by the threshold of the next degree. */
  rule: string;
  counter: CounterKey;
  /** Thresholds of the I, II, III ... degree. */
  tiers: number[];
  /** Visual: medal (round), order (star), badge (shield). */
  shape: 'medal' | 'order' | 'badge';
  color: 'gold' | 'silver' | 'bronze' | 'maroon';
}

export const AWARDS: AwardDef[] = [
  { id: 'lesson', title: 'Təlim nişanı', rule: '{n} dərsi başa vur', counter: 'lessons', tiers: [1, 25, 100], shape: 'badge', color: 'maroon' },
  { id: 'perfect', title: 'Dəqiq atıcı', rule: '{n} dərsi səhvsiz bitir', counter: 'perfectLessons', tiers: [1, 10, 50], shape: 'badge', color: 'silver' },
  { id: 'section', title: 'Bölmə nişanı', rule: '{n} bölmə testindən keç', counter: 'sectionsPassed', tiers: [1, 10, 30], shape: 'badge', color: 'bronze' },
  { id: 'final', title: 'Mövzu medalı', rule: '{n} mövzunun final testindən keç', counter: 'finalsPassed', tiers: [1, 5, 12], shape: 'medal', color: 'silver' },
  { id: 'final100', title: 'Əla qiymət ordeni', rule: 'Final testini {n} dəfə 100% nəticə ilə keç', counter: 'finals100', tiers: [1, 5], shape: 'order', color: 'gold' },
  { id: 'mock', title: 'Sınaq qəhrəmanı', rule: 'Sınaq imtahanında {n} dəfə keçid balı topla', counter: 'mocksPassed', tiers: [1, 5, 15], shape: 'medal', color: 'gold' },
  { id: 'mock90', title: 'Qızıl sınaq', rule: 'Sınaq imtahanında {n} dəfə 90%-dən yuxarı nəticə göstər', counter: 'mocks90', tiers: [1, 5], shape: 'order', color: 'gold' },
  { id: 'streak', title: 'Dəmir iradə', rule: '{n} gün ardıcıl məşq et', counter: 'bestStreak', tiers: [7, 30, 100], shape: 'medal', color: 'bronze' },
  { id: 'correct', title: 'Bilik xəzinəsi', rule: '{n} suala düzgün cavab ver', counter: 'correct', tiers: [100, 1000, 5000], shape: 'medal', color: 'maroon' },
  { id: 'podium', title: 'Yarış prizyoru', rule: 'Yarışda {n} dəfə ilk üçlüyə düş', counter: 'competitionPodiums', tiers: [1, 5], shape: 'medal', color: 'silver' },
  { id: 'champion', title: 'Yarış qalibi', rule: 'Yarışda {n} dəfə birinci yeri tut', counter: 'competitionsWon', tiers: [1, 3], shape: 'order', color: 'gold' },
  { id: 'report', title: 'Diqqətli göz', rule: 'Sualdakı {n} səhvi tap və bildir', counter: 'reportsConfirmed', tiers: [1, 5], shape: 'badge', color: 'maroon' },
];

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export interface AwardGain {
  id: string;
  title: string;
  tier: number;
}

/** Adds to counters and returns the awards (or higher degrees) that were reached by this change. */
export function bumpCounters(g: GameState, add: Partial<Record<CounterKey, number>>, now: number, set?: Partial<Record<CounterKey, number>>): { game: GameState; gained: AwardGain[] } {
  const counters = { ...g.counters };
  for (const [k, v] of Object.entries(add)) counters[k as CounterKey] = (counters[k as CounterKey] ?? 0) + (v ?? 0);
  for (const [k, v] of Object.entries(set ?? {})) counters[k as CounterKey] = Math.max(counters[k as CounterKey] ?? 0, v ?? 0);
  const awards = { ...g.awards };
  const gained: AwardGain[] = [];
  for (const a of AWARDS) {
    const value = counters[a.counter] ?? 0;
    const tier = a.tiers.filter((t) => value >= t).length;
    const had = awards[a.id]?.tier ?? 0;
    if (tier > had) {
      awards[a.id] = { tier, at: now };
      gained.push({ id: a.id, title: a.title, tier });
    }
  }
  return { game: { ...g, counters, awards }, gained };
}
