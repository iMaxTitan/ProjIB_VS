'use client';

import { useEffect } from 'react';
import { getSupabaseAccessToken } from '@/lib/supabase';
import { refreshAuthCookie } from '@/lib/auth';
import logger from '@/lib/logger';

const REFRESH_INTERVAL_MS = 40 * 60_000; // 40 мин
const REFRESH_THRESHOLD_MS = 10 * 60_000; // 10 мин до expiry

/**
 * JWT refresh хук. Извлечён из usePresence — теперь не зависит от presence.
 * Проверяет Supabase JWT и обновляет если до expiry < 10 мин.
 * Интервал: 40 мин (JWT=1h, порог=10 мин → безопасный запас).
 */
export function useAuthRefresh(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    async function maybeRefresh() {
      try {
        const token = getSupabaseAccessToken();
        if (!token) return;

        const parts = token.split('.');
        if (parts.length !== 3 || !parts[1]) return;

        const payload = JSON.parse(atob(parts[1]));
        if (typeof payload.exp !== 'number') return;

        if (payload.exp * 1000 - Date.now() < REFRESH_THRESHOLD_MS) {
          logger.log('[AuthRefresh] JWT expiring soon, refreshing...');
          await refreshAuthCookie();
        }
      } catch {
        // Не критично — retry на следующем цикле
      }
    }

    maybeRefresh(); // check сразу при mount
    const id = setInterval(maybeRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
