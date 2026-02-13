/**
 * One-time seed при старте сервера.
 * Загружает недавно активных пользователей из БД в onlineStore.
 * Promise dedup — при 10 параллельных запросах DB query выполнится один раз.
 * При ошибке — retry на следующем запросе (seedPromise сбрасывается).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedStore } from './store';

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(db: SupabaseClient): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = doSeed(db);
  return seedPromise;
}

async function doSeed(db: SupabaseClient): Promise<void> {
  try {
    const threshold = new Date(Date.now() - 180_000).toISOString();
    const { data } = await db
      .from('user_profiles')
      .select('user_id, last_seen_at')
      .gt('last_seen_at', threshold);

    if (data?.length) {
      seedStore(data as { user_id: string; last_seen_at: string }[]);
    }
  } catch {
    // DB down — сбрасываем промис для retry на следующем запросе
    seedPromise = null;
  }
}
