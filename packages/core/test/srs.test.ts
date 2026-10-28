import { describe, expect, it } from 'vitest';
import { DAY, MINUTE, newSrsState, retrievability, schedule } from '../src';

const T0 = Date.UTC(2026, 10, 2, 8); // 2 Nov 2026

describe('schedule', () => {
  it('follows the learning steps and then grows by ease (plan table D.4)', () => {
    let s = newSrsState('u', T0);
    s = schedule(s, 2, T0);
    expect(s.dueAt - T0).toBe(10 * MINUTE);
    s = schedule(s, 2, T0 + 10 * MINUTE);
    expect(s.dueAt - (T0 + 10 * MINUTE)).toBe(DAY);
    s = schedule(s, 2, T0 + 1 * DAY);
    expect(s.dueAt - (T0 + DAY)).toBe(3 * DAY);
    s = schedule(s, 2, T0 + 4 * DAY);
    expect(s.phase).toBe('review');
    expect(s.intervalDays).toBe(7);
    s = schedule(s, 2, T0 + 11 * DAY);
    expect(s.intervalDays).toBe(16);
    expect(s.ease).toBeCloseTo(2.3);
  });

  it('brings a missed unit back after 10 minutes and shortens the interval', () => {
    let s = newSrsState('u', T0);
    for (const t of [0, 10 * MINUTE, DAY, 4 * DAY, 11 * DAY]) s = schedule(s, 2, T0 + t);
    expect(s.intervalDays).toBe(16);
    const lapseAt = T0 + 27 * DAY;
    s = schedule(s, 0, lapseAt);
    expect(s.phase).toBe('relearn');
    expect(s.dueAt - lapseAt).toBe(10 * MINUTE);
    expect(s.ease).toBeCloseTo(2.1);
    s = schedule(s, 2, lapseAt + 10 * MINUTE);
    expect(s.dueAt - (lapseAt + 10 * MINUTE)).toBe(DAY);
    s = schedule(s, 2, lapseAt + DAY);
    expect(s.dueAt - (lapseAt + DAY)).toBe(3 * DAY);
    s = schedule(s, 2, lapseAt + 4 * DAY);
    expect(s.phase).toBe('review');
    expect(s.intervalDays).toBe(6); // max(3, round(16 * 0.4))
  });

  it('marks a unit as a leech after four lapses', () => {
    let s = newSrsState('u', T0);
    for (let i = 0; i < 4; i++) s = schedule(s, 0, T0 + i * DAY);
    expect(s.isLeech).toBe(true);
  });

  it('caps intervals so every unit is seen twice before the exam', () => {
    let s = newSrsState('u', T0);
    for (const t of [0, 10 * MINUTE, DAY, 4 * DAY]) s = schedule(s, 2, T0 + t);
    const examAt = T0 + 40 * DAY;
    s = schedule(s, 2, T0 + 11 * DAY, { examAt });
    expect(s.intervalDays).toBe(14); // floor(29 / 2)
    s = schedule(s, 2, T0 + 25 * DAY, { examAt });
    expect(s.intervalDays).toBe(7);
  });

  it('estimates recall at 0.9 when a review falls due', () => {
    let s = newSrsState('u', T0);
    for (const t of [0, 10 * MINUTE, DAY, 4 * DAY]) s = schedule(s, 2, T0 + t);
    expect(retrievability(s, s.dueAt)).toBeCloseTo(0.9);
  });
});
