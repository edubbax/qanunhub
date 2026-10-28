// Calendar helpers in Baku time (UTC+4, no daylight saving since 2016).

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const BAKU_OFFSET = 4 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

function bakuDate(ts: number): Date {
  return new Date(ts + BAKU_OFFSET);
}

/** "YYYY-MM-DD" of the Baku calendar day containing ts. */
export function dayKey(ts: number): string {
  const d = bakuDate(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function monthKey(ts: number): string {
  return dayKey(ts).slice(0, 7);
}

/** Epoch ms of 00:00 Baku time for the given day key. */
export function dayStart(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - BAKU_OFFSET;
}

export function addDays(key: string, days: number): string {
  return dayKey(dayStart(key) + days * DAY + HOUR);
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((dayStart(toKey) - dayStart(fromKey)) / DAY);
}

/** Monday (Baku) of the week containing ts, as a day key. */
export function weekStartKey(ts: number): string {
  const d = bakuDate(ts);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(dayKey(ts), -dow);
}

export function monthStartKey(ts: number): string {
  return monthKey(ts) + '-01';
}

export function periodStartKey(period: 'week' | 'month', ts: number): string {
  return period === 'week' ? weekStartKey(ts) : monthStartKey(ts);
}

export function periodEnd(period: 'week' | 'month', startKey: string): number {
  if (period === 'week') return dayStart(addDays(startKey, 7));
  const [y, m] = startKey.split('-').map(Number);
  return Date.UTC(y, m, 1) - BAKU_OFFSET;
}
