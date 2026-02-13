/**
 * In-memory presence store.
 * Хранит userId → timestamp последнего heartbeat.
 * Работает ТОЛЬКО в single-process режиме (PM2 instances: 1).
 */

const onlineStore = new Map<string, number>();
const DEFAULT_TTL_MS = 180_000; // 3 min

// HMR-safe: сохраняем ссылку на таймер в globalThis
const g = globalThis as unknown as { __presenceCleanupTimer?: ReturnType<typeof setInterval> };

export function touchPresence(userId: string): void {
  onlineStore.set(userId, Date.now());
  startCleanupIfNeeded();
}

export function removePresence(userId: string): void {
  onlineStore.delete(userId);
}

/** Возвращает Map<userId, timestampMs> для всех online пользователей */
export function getOnlineEntries(ttlMs = DEFAULT_TTL_MS): Map<string, number> {
  const threshold = Date.now() - ttlMs;
  const result = new Map<string, number>();
  onlineStore.forEach((ts, id) => {
    if (ts > threshold) result.set(id, ts);
  });
  return result;
}

export function seedStore(entries: { user_id: string; last_seen_at: string }[]): void {
  for (const e of entries) {
    const ts = new Date(e.last_seen_at).getTime();
    if (!Number.isNaN(ts)) onlineStore.set(e.user_id, ts);
  }
}

export function getStoreSize(): number {
  return onlineStore.size;
}

function startCleanupIfNeeded(): void {
  if (g.__presenceCleanupTimer) return;
  g.__presenceCleanupTimer = setInterval(() => {
    const threshold = Date.now() - DEFAULT_TTL_MS;
    const toDelete: string[] = [];
    onlineStore.forEach((ts, id) => {
      if (ts <= threshold) toDelete.push(id);
    });
    toDelete.forEach(id => onlineStore.delete(id));
    if (onlineStore.size === 0 && g.__presenceCleanupTimer) {
      clearInterval(g.__presenceCleanupTimer);
      g.__presenceCleanupTimer = undefined;
    }
  }, 60_000);
  if (typeof g.__presenceCleanupTimer === 'object' && 'unref' in g.__presenceCleanupTimer) {
    (g.__presenceCleanupTimer as NodeJS.Timeout).unref();
  }
}
