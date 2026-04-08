import { createPostgrestClient } from '@/lib/shared/postgrest-client';

// Client queries go through authenticated proxy (/api/db → PostgREST).
// The proxy validates auth via httpOnly cookie and uses service-role key.
// Passing '/api/db/rest/v1' makes PostgrestClient set _url = '/api/db'
// so requests become /api/db/{table}?filters — caught by the [...path] route.
export const db = createPostgrestClient('/api/db/rest/v1', '');

// Backward-compat alias — some legacy callers still import { supabase }
export const supabase = db;

const CUSTOM_JWT_STORAGE_KEY = 'db_custom_jwt';
let currentDbJwt: string | null = null;

type MutablePostgrestClient = {
  rest: { headers: Record<string, string> };
  headers: Record<string, string>;
};

function getMutableClient(): MutablePostgrestClient {
  return db as unknown as MutablePostgrestClient;
}

function applyAccessToken(accessToken: string | null): void {
  const mutable = getMutableClient();

  if (accessToken) {
    const authHeader = `Bearer ${accessToken}`;
    mutable.rest.headers = {
      ...mutable.rest.headers,
      Authorization: authHeader,
    };
    mutable.headers = {
      ...mutable.headers,
      Authorization: authHeader,
    };
    db.realtime.setAuth(accessToken).catch(() => {
      // Realtime stub: noop
    });
    db.functions.setAuth(accessToken);
    return;
  }

  delete mutable.rest.headers.Authorization;
  delete mutable.headers.Authorization;
  db.functions.setAuth('');
  db.realtime.setAuth().catch(() => {
    // ignore
  });
}

export async function setDBSession(accessToken: string): Promise<boolean> {
  try {
    if (!accessToken || accessToken.split('.').length !== 3) return false;
    currentDbJwt = accessToken;
    applyAccessToken(accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CUSTOM_JWT_STORAGE_KEY, accessToken);
    }
    return true;
  } catch {
    return false;
  }
}

export async function clearDBSession(): Promise<void> {
  try {
    currentDbJwt = null;
    applyAccessToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CUSTOM_JWT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getDBAccessToken(): string | null {
  if (currentDbJwt) return currentDbJwt;
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(CUSTOM_JWT_STORAGE_KEY);
  if (!token) return null;
  currentDbJwt = token;
  applyAccessToken(token);
  return token;
}
