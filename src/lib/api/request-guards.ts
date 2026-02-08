import { NextRequest } from 'next/server';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

function pruneExpired(now: number): void {
  for (const [key, value] of Array.from(buckets.entries())) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getRequesterKey(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown-ip';
  const userAgent = request.headers.get('user-agent') || 'unknown-ua';
  return `${ip}:${userAgent.slice(0, 64)}`;
}

export function isRequestAuthorized(request: NextRequest): boolean {
  const authToken = request.cookies.get('auth_token')?.value;
  const hasAuthToken = Boolean(authToken && authToken !== 'undefined' && authToken !== 'null');
  if (!hasAuthToken || !authToken) return false;

  try {
    const parts = authToken.split('.');
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (!payload.exp) return true;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSec: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}
