/**
 * Voice Bot — логування сесій у БД.
 * Зберігає дані розмов (тривалість, транскрипт, джерело).
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceSessionInput {
  userId: string | null;
  conversationId: string;
  durationSeconds: number;
  transcript: unknown;
  source: string;
}

export interface VoiceSessionRow {
  id: string;
  user_id: string;
  conversation_id: string;
  duration_seconds: number;
  transcript: unknown;
  source: string;
  created_at: string;
  /** Joined from user_profiles */
  full_name?: string;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function logVoiceSession(
  db: SupabaseClient,
  session: VoiceSessionInput,
): Promise<void> {
  const { error } = await db.from('voice_sessions').insert({
    user_id: session.userId,
    conversation_id: session.conversationId,
    duration_seconds: session.durationSeconds,
    transcript: session.transcript,
    source: session.source,
  });
  if (error) {
    logger.error('[voice/session] insert error:', error.message);
  } else {
    logger.info('[voice/session] logged:', session.conversationId, `${session.durationSeconds}s`);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getVoiceSessions(
  db: SupabaseClient,
  options: { limit?: number; userId?: string } = {},
): Promise<VoiceSessionRow[]> {
  const { limit = 50, userId } = options;

  let query = db
    .from('voice_sessions')
    .select('*, user_profiles!voice_sessions_user_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[voice/session] fetch error:', error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const profile = row.user_profiles as Record<string, string> | null;
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      conversation_id: row.conversation_id as string,
      duration_seconds: row.duration_seconds as number,
      transcript: row.transcript,
      source: row.source as string,
      created_at: row.created_at as string,
      full_name: profile?.full_name,
    };
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getVoiceStats(
  db: SupabaseClient,
): Promise<{ total: number; today: number; avgDuration: number }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await db
    .from('voice_sessions')
    .select('duration_seconds, created_at');

  if (error || !data) {
    logger.error('[voice/session] stats error:', error?.message);
    return { total: 0, today: 0, avgDuration: 0 };
  }

  const total = data.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const today = (data as any[]).filter(
    (r: { created_at: string }) => new Date(r.created_at) >= todayStart,
  ).length;
  const avgDuration = total > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? Math.round((data as any[]).reduce((sum: number, r: { duration_seconds: number }) => sum + (r.duration_seconds || 0), 0) / total)
    : 0;

  return { total, today, avgDuration };
}
