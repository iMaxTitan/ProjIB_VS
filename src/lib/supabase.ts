import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

const CUSTOM_JWT_STORAGE_KEY = 'supabase_custom_jwt';
let currentSupabaseJwt: string | null = null;

type MutableSupabaseClient = {
  rest: { headers: Record<string, string> };
  headers: Record<string, string>;
};

function getMutableClient(): MutableSupabaseClient {
  return supabase as unknown as MutableSupabaseClient;
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
    supabase.realtime.setAuth(accessToken).catch(() => {
      // Realtime auth will retry on next heartbeat.
    });
    supabase.functions.setAuth(accessToken);
    return;
  }

  delete mutable.rest.headers.Authorization;
  delete mutable.headers.Authorization;
  supabase.functions.setAuth('');
  supabase.realtime.setAuth().catch(() => {
    // ignore
  });
}

export async function setSupabaseSession(accessToken: string): Promise<boolean> {
  try {
    if (!accessToken || accessToken.split('.').length !== 3) return false;
    currentSupabaseJwt = accessToken;
    applyAccessToken(accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CUSTOM_JWT_STORAGE_KEY, accessToken);
    }
    return true;
  } catch {
    return false;
  }
}

export async function clearSupabaseSession(): Promise<void> {
  try {
    currentSupabaseJwt = null;
    applyAccessToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CUSTOM_JWT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getSupabaseAccessToken(): string | null {
  if (currentSupabaseJwt) return currentSupabaseJwt;
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(CUSTOM_JWT_STORAGE_KEY);
  if (!token) return null;
  currentSupabaseJwt = token;
  applyAccessToken(token);
  return token;
}
