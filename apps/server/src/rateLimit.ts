// Fixed-window rate limiter kept in memory. Enough for a single instance; move to Redis when scaling out.
import { AppError } from '@qanunhub/core';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > limit) throw new AppError('RATE_LIMITED', 'Çox sayda sorğu göndərildi. Bir az sonra yenidən cəhd edin.', { retryAt: b.resetAt });
}

export function resetRateLimits() {
  buckets.clear();
}
