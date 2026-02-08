'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { UserInfo } from '@/types/azure';
import logger from '@/lib/logger';

export interface PresenceUser {
    user_id: string;
    displayName: string;
    email: string;
    photo_base64?: string | null;
    online_at: string;
}

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Объединяет данные из двух источников (DB + WebSocket).
 * DB - базовый слой, WS - перезаписывает совпадения (более свежие данные).
 */
function mergeUsers(dbUsers: PresenceUser[], wsUsers: PresenceUser[]): PresenceUser[] {
    const map = new Map<string, PresenceUser>();
    dbUsers.forEach(u => map.set(u.user_id, u));
    wsUsers.forEach(u => map.set(u.user_id, u));
    return Array.from(map.values());
}

function toPresenceUser(entry: unknown): PresenceUser | null {
    if (!entry || typeof entry !== 'object') return null;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.user_id !== 'string') return null;
    if (typeof candidate.displayName !== 'string') return null;
    if (typeof candidate.email !== 'string') return null;
    if (typeof candidate.online_at !== 'string') return null;
    return {
        user_id: candidate.user_id,
        displayName: candidate.displayName,
        email: candidate.email,
        photo_base64: typeof candidate.photo_base64 === 'string' ? candidate.photo_base64 : null,
        online_at: candidate.online_at,
    };
}

/**
 * Хук для отслеживания присутствия пользователей на сайте в реальном времени.
 * Двойной механизм: WebSocket (Supabase Realtime) + HTTP heartbeat (fallback).
 */
export function usePresence(user: UserInfo | null) {
    const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
    const wsUsersRef = useRef<PresenceUser[]>([]);
    const dbUsersRef = useRef<PresenceUser[]>([]);

    // Обновляет activeUsers из обоих источников
    const updateMerged = useCallback(() => {
        const merged = mergeUsers(dbUsersRef.current, wsUsersRef.current);
        setActiveUsers(prev => {
            // Обновляем только если реально изменился список
            if (prev.length === merged.length &&
                prev.every((u, i) => u.user_id === merged[i]?.user_id)) {
                return prev;
            }
            return merged;
        });
    }, []);

    // 1. WebSocket Presence (Supabase Realtime)
    useEffect(() => {
        const userId = user?.user_id;
        if (!userId) return;

        const channel = supabase.channel('online-users', {
            config: { presence: { key: userId } },
        });

        const handleSync = () => {
            const state = channel.presenceState();
            const users: PresenceUser[] = [];
            Object.keys(state).forEach((key) => {
                const entries = state[key];
                if (!Array.isArray(entries) || entries.length === 0) {
                    return;
                }
                const firstUser = toPresenceUser(entries[0]);
                if (firstUser) users.push(firstUser);
            });
            if (IS_DEV) logger.log(`[Presence WS] ${users.length} users`);
            wsUsersRef.current = users;
            updateMerged();
        };

        channel
            .on('presence', { event: 'sync' }, handleSync)
            .subscribe(async (status) => {
                if (IS_DEV) logger.log(`[Presence WS] ${status}`);
                if (status === 'SUBSCRIBED') {
                    let photoPayload = user?.photo_base64 || user?.photo;
                    if (photoPayload && photoPayload.length > 4096) photoPayload = undefined;

                    try {
                        await channel.track({
                            user_id: userId,
                            displayName: user?.displayName,
                            email: user?.email,
                            photo_base64: photoPayload,
                            online_at: new Date().toISOString(),
                        });
                    } catch (err: unknown) {
                        logger.warn('[Presence WS] Track failed', err);
                    }
                }
            });

        return () => {
            channel.unsubscribe();
        };
    }, [user?.user_id, updateMerged]);

    // 2. HTTP Heartbeat & Polling (Fallback for corporate networks)
    useEffect(() => {
        const userId = user?.user_id;
        if (!userId) return;

        const sendHeartbeat = async () => {
            try {
                const { error } = await supabase
                    .from('user_profiles')
                    .update({ last_seen_at: new Date().toISOString() })
                    .eq('user_id', userId);

                if (error) logger.warn('[Presence HTTP] Heartbeat failed', error);
            } catch (err: unknown) {
                logger.warn('[Presence HTTP] Heartbeat error', err);
            }
        };

        const fetchActiveFromDb = async () => {
            try {
                const threshold = new Date(Date.now() - 150_000).toISOString();

                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('user_id, full_name, email, photo_base64, last_seen_at')
                    .gt('last_seen_at', threshold);

                if (error) {
                    logger.warn('[Presence HTTP] Fetch failed', error);
                    return;
                }

                dbUsersRef.current = (data || []).map(u => ({
                    user_id: u.user_id,
                    displayName: u.full_name || u.email || 'User',
                    email: u.email,
                    photo_base64: u.photo_base64 || undefined,
                    online_at: u.last_seen_at || new Date().toISOString()
                }));

                updateMerged();
            } catch (err: unknown) {
                logger.warn('[Presence HTTP] Polling error', err);
            }
        };

        sendHeartbeat();
        fetchActiveFromDb();

        const hbInterval = setInterval(sendHeartbeat, 50_000);
        const pollInterval = setInterval(fetchActiveFromDb, 60_000);

        return () => {
            clearInterval(hbInterval);
            clearInterval(pollInterval);
        };
    }, [user?.user_id, updateMerged]);

    return activeUsers;
}


