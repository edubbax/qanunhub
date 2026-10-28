import { describe, expect, it } from 'vitest';
import {
  DAY, HOUR, computeRank, dayKey, earnHeart, freshHearts, freshStreak, lessonXp, loseHeart, normalizeHearts,
  periodEnd, periodStartKey, touchStreak, visibleStreak, weekStartKey,
} from '../src';

// 2 Nov 2026 is a Monday. 19:30 UTC is already 23:30 in Baku.
const MON = Date.UTC(2026, 10, 2, 8);

describe('time (Baku)', () => {
  it('uses UTC+4 day boundaries', () => {
    expect(dayKey(Date.UTC(2026, 10, 2, 19, 59))).toBe('2026-11-02');
    expect(dayKey(Date.UTC(2026, 10, 2, 20, 0))).toBe('2026-11-03');
  });
  it('starts weeks on Monday', () => {
    expect(weekStartKey(MON + 3 * DAY)).toBe('2026-11-02');
    expect(weekStartKey(MON - DAY)).toBe('2026-10-26');
    expect(periodStartKey('month', MON)).toBe('2026-11-01');
    expect(periodEnd('week', '2026-11-02')).toBe(Date.UTC(2026, 10, 8, 20));
  });
});

describe('hearts', () => {
  it('locks for 4 hours after the third mistake, then refills', () => {
    let h = freshHearts(MON);
    h = loseHeart(h, MON);
    h = loseHeart(h, MON);
    expect(h.lockedUntil).toBeNull();
    h = loseHeart(h, MON);
    expect(h.current).toBe(0);
    expect(h.lockedUntil).toBe(MON + 4 * HOUR);
    expect(normalizeHearts(h, MON + 3 * HOUR).current).toBe(0);
    expect(normalizeHearts(h, MON + 4 * HOUR).current).toBe(3);
  });
  it('refills partly used hearts on a new day and caps earned hearts at two', () => {
    let h = loseHeart(freshHearts(MON), MON);
    expect(normalizeHearts(h, MON + DAY).current).toBe(3);
    h = loseHeart(loseHeart(loseHeart(freshHearts(MON), MON), MON), MON);
    h = earnHeart(h);
    expect(h.current).toBe(1);
    expect(h.lockedUntil).toBeNull();
    h = earnHeart(loseHeart(h, MON));
    expect(h.earnedToday).toBe(2);
    expect(earnHeart(loseHeart(h, MON)).earnedToday).toBe(2);
  });
});

describe('xp', () => {
  it('halves the first replay within a week and gives nothing after', () => {
    expect(lessonXp(8, 8, 0)).toBe(23);
    expect(lessonXp(6, 8, 0)).toBe(16);
    expect(lessonXp(8, 8, 1)).toBe(12);
    expect(lessonXp(8, 8, 2)).toBe(0);
  });
});

describe('streak', () => {
  it('counts consecutive Baku days and resets after a gap', () => {
    let s = freshStreak(MON);
    s = touchStreak(s, MON, false);
    s = touchStreak(s, MON + HOUR, false);
    expect(s.current).toBe(1);
    s = touchStreak(s, MON + DAY, false);
    expect(s.current).toBe(2);
    expect(visibleStreak(s, MON + 3 * DAY, false)).toBe(0);
    s = touchStreak(s, MON + 3 * DAY, false);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(2);
  });
  it('lets premium freezes cover a missed day', () => {
    let s = { ...freshStreak(MON), freezesLeft: 2 };
    s = touchStreak(s, MON, true);
    s = touchStreak(s, MON + 2 * DAY, true);
    expect(s.current).toBe(2);
    expect(s.freezesLeft).toBe(1);
  });
});

describe('ranks', () => {
  it('needs both passed topics and XP', () => {
    expect(computeRank(0, 0, 0).current.code).toBe('d7');
    expect(computeRank(50, 1500, 0.5).current.code).toBe('d5');
    expect(computeRank(100, 9000, 0.8).current.code).toBe('d1');
    expect(computeRank(100, 9000, 0.9).current.code).toBe('ali');
  });
});
