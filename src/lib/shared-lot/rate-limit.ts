/**
 * Simple in-memory rate limiter (best-effort per server instance).
 * Key should include token prefix + IP for shared-lot public APIs.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 80;

export function checkSharedLotRateLimit(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_REQUESTS) return false;
  b.count += 1;
  return true;
}

export function rateLimitKey(ip: string, tokenPrefix: string): string {
  return `${ip}:${tokenPrefix}`;
}
