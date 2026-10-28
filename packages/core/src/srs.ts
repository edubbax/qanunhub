// Spaced repetition: SM-2 based rule set with learning steps, lapses, leeches and an exam-date cap.
import type { SrsState } from './types';
import { DAY, MINUTE } from './time';

export type Grade = 0 | 1 | 2 | 3; // 0 wrong, 1 hard, 2 good, 3 easy

export const STEPS = [10 * MINUTE, 1 * DAY, 3 * DAY]; // delays after a correct answer while learning
export const RELEARN_DELAY = 10 * MINUTE;
export const EASE = { start: 2.3, min: 1.3, max: 2.8 };
export const MAX_INTERVAL = 120;
export const LEECH_LAPSES = 4;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function newSrsState(unitId: string, now: number): SrsState {
  return {
    unitId, phase: 'learn', step: 0, ease: EASE.start, intervalDays: 0, lastGoodInterval: 0,
    dueAt: now, reps: 0, lapses: 0, isLeech: false, lastGrade: null, lastReviewAt: null, lastItemId: null,
  };
}

/** Derives the grade from the answer itself; learners are never asked to rate difficulty. */
export function toGrade(correct: boolean, ms: number, readMs: number): Grade {
  if (!correct) return 0;
  if (ms > readMs * 1.5) return 1;
  if (ms < readMs * 0.5) return 3;
  return 2;
}

/** Expected reading time for a question, used when per-item timing statistics are missing. */
export function readingMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return 2500 + words * 300;
}

export interface ScheduleOptions {
  examAt?: number | null;
  random?: () => number;
}

export function schedule(prev: SrsState, g: Grade, now: number, opts: ScheduleOptions = {}): SrsState {
  const s: SrsState = { ...prev };
  s.reps++;
  s.lastGrade = g;
  s.lastReviewAt = now;

  if (g === 0) {
    if (s.phase === 'review') {
      s.lastGoodInterval = s.intervalDays;
      s.phase = 'relearn';
    }
    s.lapses++;
    s.ease = clamp(s.ease - 0.2, EASE.min, EASE.max);
    s.step = 1; // the in-session re-ask comes first, the next correct answer moves to +1 day
    s.isLeech = s.lapses >= LEECH_LAPSES;
    s.dueAt = now + RELEARN_DELAY;
    return s;
  }

  if (s.phase !== 'review') {
    if (s.step < STEPS.length) {
      s.dueAt = now + STEPS[s.step];
      s.step++;
      return s;
    }
    s.intervalDays = s.lapses === 0 ? 7 : Math.max(3, Math.round(s.lastGoodInterval * 0.4));
    s.phase = 'review';
  } else {
    const mult = g === 1 ? 1.2 : g === 2 ? s.ease : s.ease * 1.3;
    s.intervalDays = Math.max(s.intervalDays + 1, Math.round(s.intervalDays * mult));
    s.ease = clamp(s.ease + (g === 1 ? -0.15 : g === 3 ? 0.1 : 0), EASE.min, EASE.max);
  }

  let iv = Math.min(s.intervalDays, MAX_INTERVAL);
  if (opts.examAt && opts.examAt > now) {
    const daysLeft = Math.floor((opts.examAt - now) / DAY);
    iv = Math.min(iv, Math.max(1, Math.floor(daysLeft / 2)));
  }
  if (iv >= 4 && opts.random) iv = Math.round(iv * (0.95 + opts.random() * 0.1));
  s.intervalDays = iv;
  s.dueAt = now + iv * DAY;
  return s;
}

/** Probability of recall: 0.9 when the review falls due. Units still in learning count as 0.5. */
export function retrievability(s: SrsState | undefined, now: number): number {
  if (!s || s.lastReviewAt == null) return 0;
  if (s.phase !== 'review') return s.lastGrade === 0 ? 0.3 : 0.5;
  const t = Math.max(0, now - s.lastReviewAt) / DAY;
  return Math.pow(0.9, t / Math.max(1, s.intervalDays));
}

export function isLearned(s: SrsState | undefined, now: number): boolean {
  return !!s && s.phase === 'review' && retrievability(s, now) >= 0.8;
}

export function priority(s: SrsState, now: number, importance: number): number {
  const overdueDays = Math.max(0, now - s.dueAt) / DAY;
  return Math.min(3, overdueDays / Math.max(1, s.intervalDays)) + 0.3 * Math.min(s.lapses, 5) + (s.isLeech ? 0.5 : 0) + 0.2 * importance;
}
