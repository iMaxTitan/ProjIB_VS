import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';
import { getRequesterKey, checkRateLimit } from '@/lib/api/request-guards';

function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) return forwardedProto.includes('https');
  return request.nextUrl.protocol === 'https:';
}

function isLikelyJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every(Boolean);
}

function isFetchFailedError(error: unknown): boolean {
  return error instanceof TypeError && error.message.toLowerCase().includes('fetch failed');
}

function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const [local, domain] = value.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length <= 2 ? `${local[0] || '*'}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

function getEmailCandidates(email: string | null): string[] {
  if (!email) return [];
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return [normalized];

  const candidates = new Set<string>([normalized]);
  if (domain === 'atbmarket.com') candidates.add(`${local}@atb.ua`);
  if (domain === 'atb.ua') candidates.add(`${local}@atbmarket.com`);
  return Array.from(candidates);
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10000,
  retries = 1
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(input, init, timeoutMs);
    } catch (error: unknown) {
      lastError = error;
      if (!isFetchFailedError(error) || attempt === retries) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

type UserLookupResult = {
  user_id: string;
  email: string | null;
  role: string | null;
  department_id: string | null;
} | null;

async function lookupUserViaRest(email: string): Promise<UserLookupResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };

  const viewUrl = new URL(`${url}/rest/v1/v_user_details`);
  viewUrl.searchParams.set('select', 'user_id,email,role,department_id');
  viewUrl.searchParams.set('email', `eq.${email}`);
  viewUrl.searchParams.set('limit', '1');

  const viewRes = await fetchWithRetry(viewUrl, { method: 'GET', headers }, 10000, 1);
  if (viewRes.ok) {
    const rows = (await viewRes.json()) as Array<UserLookupResult>;
    if (rows[0]?.user_id) return rows[0];
  }

  const tableUrl = new URL(`${url}/rest/v1/user_profiles`);
  tableUrl.searchParams.set('select', 'user_id,email,role,department_id');
  tableUrl.searchParams.set('email', `eq.${email}`);
  tableUrl.searchParams.set('status', 'eq.active');
  tableUrl.searchParams.set('limit', '1');

  const tableRes = await fetchWithRetry(tableUrl, { method: 'GET', headers }, 10000, 1);
  if (!tableRes.ok) return null;
  const rows = (await tableRes.json()) as Array<UserLookupResult>;
  return rows[0]?.user_id ? rows[0] : null;
}

/** Извлекает email из Azure AD JWT (без верификации подписи). */
function getEmailFromJwt(token: string): string | null {
  try {
    const [, payloadBase64] = token.split('.');
    if (!payloadBase64) return null;
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
    const email: unknown = payload.preferred_username ?? payload.upn ?? payload.email ?? payload.unique_name;
    return typeof email === 'string' ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Создаёт кастомный Supabase JWT (HS256) для переданного пользователя. */
async function createSupabaseJwt(user: {
  user_id: string;
  role: string;
  department_id: string | null;
  email: string;
}): Promise<string | null> {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) return null;

  const secret = new TextEncoder().encode(jwtSecret);

  return new SignJWT({
    sub: user.user_id,
    role: 'authenticated',
    aud: 'authenticated',
    iss: 'supabase',
    user_metadata: {
      app_role: user.role,
      department_id: user.department_id,
      email: user.email,
    },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

/** Lazy-singleton admin-клиент Supabase (service_role). */
let _adminClient: ReturnType<typeof createClient> | null = null;
function getAdminClient() {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _adminClient = createClient(url, key, {
      global: {
        fetch: async (input, init) => fetchWithRetry(input, init, 10000, 1),
      },
    });
  }
  return _adminClient;
}

const AUTH_RATE_LIMIT = 10;
const AUTH_RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(getRequesterKey(request), AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  try {
    let body: { code?: string; token?: string; email?: string } = {};
    try {
      body = await request.json();
    } catch {
      // empty body
    }

    const code = body.code;
    const accessTokenFromClient = body.token;

    if (!code && !accessTokenFromClient) {
      return NextResponse.json({ message: 'Code or token is required' }, { status: 400 });
    }

    let cookieValue = '';
    let idToken: string | undefined;

    if (code) {
      const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID;
      const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
      const redirectUri = process.env.NEXT_PUBLIC_BASE_URL + '/auth/callback';
      const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

      if (!clientId || !tenantId || !redirectUri || !clientSecret) {
        throw new Error('Missing required environment variables');
      }

      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const params = new URLSearchParams({
        client_id: clientId,
        scope: 'openid profile email',
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        client_secret: clientSecret,
      });

      const response = await fetchWithTimeout(
        tokenUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        },
        15000
      );

      if (!response.ok) {
        throw new Error(`Failed to exchange code for token: ${response.statusText}`);
      }

      const data = await response.json();
      cookieValue = data.access_token;
      idToken = data.id_token;
    } else if (accessTokenFromClient) {
      cookieValue = accessTokenFromClient;
    }

    if (!cookieValue || !isLikelyJwt(cookieValue)) {
      return NextResponse.json({ message: 'Invalid token format' }, { status: 400 });
    }

    // --- Supabase JWT generation (Phase 2 security hardening) ---
    let resolvedUserId: string | null = null;
    let supabaseToken: string | null = null;
    let supabaseTokenIssue:
      | 'email_missing'
      | 'admin_not_configured'
      | 'jwt_secret_missing'
      | 'user_not_found'
      | 'lookup_failed'
      | null = null;

    const jwtEmail = getEmailFromJwt(idToken || '') || getEmailFromJwt(cookieValue);
    const email = jwtEmail || (body.email ? body.email.toLowerCase() : null);
    const emailCandidates = getEmailCandidates(email);
    const admin = getAdminClient();

    console.log('[auth/token] token parsed:', {
      resolvedEmail: maskEmail(email),
      emailCandidates: emailCandidates.map(maskEmail),
      hasAdmin: !!admin,
      hasJwtSecret: !!process.env.SUPABASE_JWT_SECRET,
    });

    if (emailCandidates.length > 0 && admin && process.env.SUPABASE_JWT_SECRET) {
      let userData:
        | {
            user_id: string;
            email: string | null;
            role: string | null;
            department_id: string | null;
          }
        | null = null;

      let hadFetchFailed = false;

      for (const candidate of emailCandidates) {
        const viewLookup = await admin
          .from('v_user_details')
          .select('user_id, email, role, department_id')
          .ilike('email', candidate)
          .maybeSingle();

        if (isFetchFailedError(viewLookup.error)) hadFetchFailed = true;

        console.log('[auth/token] v_user_details lookup:', {
          email: maskEmail(candidate),
          found: !!viewLookup.data?.user_id,
          hasError: !!viewLookup.error,
          errorType: isFetchFailedError(viewLookup.error) ? 'fetch_failed' : viewLookup.error ? 'query_error' : null,
        });

        if (viewLookup.data?.user_id) {
          userData = {
            user_id: viewLookup.data.user_id as string,
            email: (viewLookup.data.email as string | null) ?? candidate,
            role: (viewLookup.data.role as string | null) ?? 'employee',
            department_id: (viewLookup.data.department_id as string | null) ?? null,
          };
          break;
        }
      }

      if (!userData) {
        for (const candidate of emailCandidates) {
          const tableLookup = await admin
            .from('user_profiles')
            .select('user_id, email, role, department_id')
            .ilike('email', candidate)
            .eq('status', 'active')
            .maybeSingle();

          if (isFetchFailedError(tableLookup.error)) hadFetchFailed = true;

          console.log('[auth/token] user_profiles fallback lookup:', {
            email: maskEmail(candidate),
            found: !!tableLookup.data?.user_id,
            hasError: !!tableLookup.error,
            errorType: isFetchFailedError(tableLookup.error) ? 'fetch_failed' : tableLookup.error ? 'query_error' : null,
          });

          if (tableLookup.data?.user_id) {
            userData = {
              user_id: tableLookup.data.user_id as string,
              email: (tableLookup.data.email as string | null) ?? candidate,
              role: (tableLookup.data.role as string | null) ?? 'employee',
              department_id: (tableLookup.data.department_id as string | null) ?? null,
            };
            break;
          }
        }
      }

      if (!userData && hadFetchFailed) {
        try {
          for (const candidate of emailCandidates) {
            const restUser = await lookupUserViaRest(candidate);
            console.log('[auth/token] REST fallback lookup:', {
              email: maskEmail(candidate),
              found: !!restUser?.user_id,
            });
            if (restUser?.user_id) {
              userData = restUser;
              break;
            }
          }
        } catch (restError: unknown) {
          supabaseTokenIssue = 'lookup_failed';
          console.log('[auth/token] REST fallback failed:', {
            email: maskEmail(emailCandidates[0]),
            errorType: isFetchFailedError(restError) ? 'fetch_failed' : 'other',
          });
        }
      }

      if (userData?.user_id) {
        resolvedUserId = userData.user_id;
        supabaseToken = await createSupabaseJwt({
          user_id: userData.user_id,
          role: userData.role || 'employee',
          department_id: userData.department_id,
          email: userData.email || emailCandidates[0],
        });
        console.log('[auth/token] supabaseToken generated:', !!supabaseToken);
      } else {
        if (!supabaseTokenIssue) supabaseTokenIssue = 'user_not_found';
        console.log('[auth/token] user not found for JWT generation:', { emails: emailCandidates.map(maskEmail) });
      }
    } else {
      if (emailCandidates.length === 0) supabaseTokenIssue = 'email_missing';
      else if (!admin) supabaseTokenIssue = 'admin_not_configured';
      else if (!process.env.SUPABASE_JWT_SECRET) supabaseTokenIssue = 'jwt_secret_missing';

      console.log('[auth/token] skip JWT generation:', {
        hasEmail: emailCandidates.length > 0,
        hasAdmin: !!admin,
        hasJwtSecret: !!process.env.SUPABASE_JWT_SECRET,
      });
    }

    const res = NextResponse.json(
      {
        message: 'Token set',
        ...(supabaseToken ? { supabaseToken } : {}),
        ...(supabaseTokenIssue ? { supabaseTokenIssue } : {}),
      },
      { status: 200 }
    );
    res.cookies.set({
      name: 'auth_token',
      value: cookieValue,
      httpOnly: true,
      secure: isHttpsRequest(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    // DB user_id в httpOnly cookie — для безопасной идентификации в API routes
    if (resolvedUserId) {
      res.cookies.set({
        name: 'x-user-id',
        value: resolvedUserId,
        httpOnly: true,
        secure: isHttpsRequest(request),
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return res;
  } catch (error: unknown) {
    console.error('[auth/token] unhandled error', {
      errorType: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
