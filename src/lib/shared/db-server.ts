/**
 * Server-side PostgREST client singleton (service-role).
 * Shared across all API routes — eliminates 7+ duplicate client instances.
 */
import { createPostgrestClient, PostgrestClient } from '@/lib/shared/postgrest-client';
import { config } from '@/lib/shared/config';

let _serverDb: PostgrestClient | null = null;

export function getServerDb(): PostgrestClient {
  if (_serverDb) return _serverDb;
  const url = config.db.serverUrl;
  const key = config.db.serviceRoleKey;
  _serverDb = createPostgrestClient(url, key, { auth: { persistSession: false } });
  return _serverDb;
}
