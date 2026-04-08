/**
 * Серверный кэш справочника сотрудников (15 мин TTL).
 * Используется GET /api/presence/online для обогащения данных.
 * Map кэшируется целиком — не пересоздаётся при каждом вызове.
 */
import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';

export interface CachedEmployee {
  user_id: string;
  full_name: string;
  email: string;
  photo_base64: string | null;
}

let cachedMap: Map<string, CachedEmployee> | null = null;
let loadedAt = 0;
const TTL_MS = 15 * 60_000; // 15 min — employees rarely change

export async function getEmployeesMap(
  db: PostgrestClient
): Promise<Map<string, CachedEmployee>> {
  if (cachedMap && Date.now() - loadedAt < TTL_MS) {
    return cachedMap;
  }

  try {
    const { data, error } = await db
      .from('user_profiles')
      .select('user_id, full_name, email, photo_base64')
      .eq('status', 'active');

    if (error) throw error;
    const list = (data ?? []) as CachedEmployee[];
    cachedMap = new Map(list.map(e => [e.user_id, e]));
    loadedAt = Date.now();
  } catch (err) {
    // graceful degradation — возвращаем stale cache, но логируем
    logger.warn('[EmployeeCache] Failed to refresh, using stale cache', err);
    // Если кэш протух более 1 часа — сбросить
    if (Date.now() - loadedAt > 60 * 60_000) {
      cachedMap = null;
      loadedAt = 0;
    }
  }

  return cachedMap ?? new Map();
}
