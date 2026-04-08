/**
 * One-time seed при старте сервера.
 * Загружает недавно активных пользователей из БД в onlineStore.
 * Promise dedup — при 10 параллельных запросах DB query выполнится один раз.
 * При ошибке — retry на следующем запросе (seedPromise сбрасывается).
 */
import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import { seedStore } from './store';

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(db: PostgrestClient): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = doSeed(db);
  return seedPromise;
}

async function doSeed(db: PostgrestClient): Promise<void> {
  try {
    // last_seen_at frozen (не обновляется при heartbeat) → берём всех кто логинился за последние 24ч
    const threshold = new Date(Date.now() - 86_400_000).toISOString();
    const { data } = await db
      .from('user_profiles')
      .select('user_id, last_seen_at')
      .gt('last_seen_at', threshold);

    if (data?.length) {
      // last_seen_at frozen → подставляем текущее время чтобы cleanup не удалил сразу.
      // Реально offline users истекут через 3 мин (TTL) без heartbeat.
      const now = new Date().toISOString();
      seedStore(data.map(u => ({ user_id: u.user_id, last_seen_at: now })));
    }
  } catch {
    // DB down — сбрасываем промис для retry на следующем запросе
    seedPromise = null;
  }
}
