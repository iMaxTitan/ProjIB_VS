'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { UserInfo } from '@/types/azure';
import logger from '@/lib/shared/logger';

export interface PresenceUser {
    user_id: string;
    displayName: string;
    email: string;
    photo_base64?: string | null;
    online_at: string;
}

const HEARTBEAT_INTERVAL_MS = 90_000; // 90 сек
const POLL_INTERVAL_MS = 90_000;      // 90 сек
const POLL_OFFSET_MS = 45_000;        // сдвиг от heartbeat

/**
 * Хук для отслеживания присутствия пользователей.
 * Серверный in-memory store: heartbeat + polling через API.
 * Без WebSocket, без прямых DB запросов.
 */
export function usePresence(user: UserInfo | null): PresenceUser[] {
    const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
    const usersRef = useRef<PresenceUser[]>([]);

    const updateUsers = useCallback((users: PresenceUser[]) => {
        const prev = usersRef.current;
        if (prev.length === users.length &&
            prev.every((u, i) => u.user_id === users[i]?.user_id)) {
            return;
        }
        usersRef.current = users;
        setActiveUsers(users);
    }, []);

    // Heartbeat: POST /api/presence/heartbeat каждые 60с
    useEffect(() => {
        if (!user?.user_id) return;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        async function sendHeartbeat(isRetry = false) {
            try {
                const res = await fetch('/api/presence/heartbeat', {
                    method: 'POST',
                    credentials: 'include',
                });
                if (!res.ok) {
                    logger.warn('[Presence] Heartbeat failed:', res.status);
                    if (!isRetry && res.status !== 429) {
                        retryTimer = setTimeout(() => sendHeartbeat(true), 10_000);
                    }
                }
            } catch (err: unknown) {
                logger.warn('[Presence] Heartbeat error:', err);
                if (!isRetry) {
                    retryTimer = setTimeout(() => sendHeartbeat(true), 10_000);
                }
            }
        }

        sendHeartbeat();
        const id = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        return () => {
            clearInterval(id);
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [user?.user_id]);

    // Poll: GET /api/presence/online каждые 60с (со сдвигом 30с от heartbeat)
    useEffect(() => {
        if (!user?.user_id) return;

        let pollTimer: ReturnType<typeof setInterval> | null = null;

        async function fetchOnline() {
            try {
                const res = await fetch('/api/presence/online', {
                    credentials: 'include',
                });
                if (!res.ok) {
                    logger.warn('[Presence] Poll failed:', res.status);
                    return;
                }
                const contentType = res.headers.get('content-type') || '';
                if (!contentType.toLowerCase().includes('application/json')) {
                    logger.warn('[Presence] Poll returned non-JSON response:', {
                        status: res.status,
                        contentType,
                    });
                    return;
                }

                const data = await res.json();
                if (Array.isArray(data?.users)) {
                    updateUsers(data.users as PresenceUser[]);
                }
            } catch (err: unknown) {
                logger.warn('[Presence] Poll error:', err);
            }
        }

        // Сдвиг 30с чтобы heartbeat и poll не совпадали
        const offsetTimer = setTimeout(() => {
            fetchOnline();
            pollTimer = setInterval(fetchOnline, POLL_INTERVAL_MS);
        }, POLL_OFFSET_MS);

        return () => {
            clearTimeout(offsetTimer);
            if (pollTimer) clearInterval(pollTimer);
        };
    }, [user?.user_id, updateUsers]);

    return activeUsers;
}
