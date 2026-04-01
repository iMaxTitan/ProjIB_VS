/**
 * Authenticated PostgREST proxy.
 *
 * Browser → /api/db/{table}?filters → this route → PostgREST (internal) → PostgreSQL
 *
 * - Validates auth via httpOnly cookie (same as all API routes)
 * - Forwards request to PostgREST with service-role key
 * - Browser never sees PostgREST URL or credentials
 * - Rate-limited per IP
 */
import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/shared/api/request-guards';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

/** Headers to forward from client to PostgREST. */
const FORWARD_HEADERS = [
  'accept',
  'content-type',
  'prefer',
  'range',
  'range-unit',
] as const;

/** Headers to return from PostgREST to client. */
const RETURN_HEADERS = [
  'content-type',
  'content-range',
  'x-total-count',
] as const;

function getPostgrestUrl(): string {
  return config.db.serverUrl;
}

function getServiceKey(): string {
  return config.db.serviceRoleKey;
}

function buildHeaders(request: NextRequest): Record<string, string> {
  const key = getServiceKey();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };

  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  return headers;
}

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
  method: string,
): Promise<NextResponse> {
  // Auth check
  if (!isRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const rateKey = `db:${getRequesterKey(request)}`;
  const rl = checkRateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { path } = await params;
  const pathStr = path.join('/');

  // Build target URL — pass raw query string to preserve PostgREST filter syntax
  const base = getPostgrestUrl().replace(/\/$/, '');
  const rawQs = request.nextUrl.search; // includes leading '?'
  const prefix = config.db.direct ? '' : '/rest/v1';
  const targetUrl = `${base}${prefix}/${pathStr}${rawQs}`;

  const headers = buildHeaders(request);

  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const body = await request.text();
      if (body) init.body = body;
    } catch { /* empty body */ }
  }

  try {
    const res = await fetch(targetUrl, init);

    // Build response headers
    const responseHeaders: Record<string, string> = {};
    for (const name of RETURN_HEADERS) {
      const value = res.headers.get(name);
      if (value) responseHeaders[name] = value;
    }

    const responseBody = await res.arrayBuffer();
    return new NextResponse(responseBody, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    logger.error('[db-proxy] PostgREST request failed:', {
      path: pathStr,
      method,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Database request failed' },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx.params, 'GET');
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx.params, 'POST');
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx.params, 'PATCH');
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx.params, 'DELETE');
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx.params, 'HEAD');
}
