/**
 * Серверный кэш справочника сотрудников (5 мин TTL).
 * Используется GET /api/presence/online для обогащения данных.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CachedEmployee {
  user_id: string;
  full_name: string;
  email: string;
  photo_base64: string | null;
}

let cache: CachedEmployee[] = [];
let loadedAt = 0;
const TTL_MS = 5 * 60_000; // 5 min

export async function getEmployeesMap(
  db: SupabaseClient
): Promise<Map<string, CachedEmployee>> {
  if (Date.now() - loadedAt < TTL_MS && cache.length > 0) {
    return toMap(cache);
  }

  try {
    const { data, error } = await db
      .from('user_profiles')
      .select('user_id, full_name, email, photo_base64')
      .eq('status', 'active');

    if (error) throw error;
    cache = (data ?? []) as CachedEmployee[];
    loadedAt = Date.now();
  } catch (err) {
    // graceful degradation — возвращаем stale cache, но логируем
    if (typeof console !== 'undefined') {
      console.warn('[EmployeeCache] Failed to refresh, using stale cache', err);
    }
  }

  return toMap(cache);
}

function toMap(list: CachedEmployee[]): Map<string, CachedEmployee> {
  return new Map(list.map(e => [e.user_id, e]));
}
