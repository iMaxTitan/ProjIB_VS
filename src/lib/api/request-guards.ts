import { NextRequest } from 'next/server';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

interface JwtPayload {
  exp?: number;
  iss?: string;
  aud?: string;
  oid?: string;
  sub?: string;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

function pruneExpired(now: number): void {
  for (const [key, value] of Array.from(buckets.entries())) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

function normalizeIssuer(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, '');
}

function isAllowedIssuer(issuer: string, tenantId: string): boolean {
  const normalizedIssuer = normalizeIssuer(issuer);
  const normalizedTenant = tenantId.trim().toLowerCase();
  const allowedIssuers = new Set([
    `https://login.microsoftonline.com/${normalizedTenant}/v2.0`,
    `https://login.microsoftonline.com/${normalizedTenant}`,
    `https://sts.windows.net/${normalizedTenant}`,
  ]);

  return allowedIssuers.has(normalizedIssuer);
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

  const payload = decodeJwtPayload(authToken);
  if (!payload) return false;

  // Token must be non-expired.
  if (!payload.exp) return false;
  if (payload.exp * 1000 <= Date.now()) return false;

  // Validate tenant issuer, allowing common Azure AD variants.
  const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
  if (tenantId && payload.iss) {
    if (!isAllowedIssuer(payload.iss, tenantId)) return false;
  }

  // Note: audience check is intentionally omitted because tokens can be issued
  // for Microsoft Graph scopes rather than the app client_id.
  return true;
}

/** Extracts Azure AD oid from JWT token in cookie. NOTE: This is NOT the DB user_id! */
export function getAzureOidFromToken(request: NextRequest): string | null {
  const authToken = request.cookies.get('auth_token')?.value;
  if (!authToken) return null;

  const payload = decodeJwtPayload(authToken);
  if (!payload) return null;

  return payload.oid || payload.sub || null;
}

/** @deprecated Use getDbUserId — this returns Azure AD oid, not DB user_id */
export const getUserIdFromToken = getAzureOidFromToken;

/** Extracts DB user_id from httpOnly cookie set at login (/api/auth/token) */
export function getDbUserId(request: NextRequest): string | null {
  return request.cookies.get('x-user-id')?.value || null;
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
