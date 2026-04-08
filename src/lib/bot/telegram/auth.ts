/**
 * Telegram bot authentication and permission resolution.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import type { TelegramUser, UserProfile } from './types';

export interface BasicUser {
  telegramUser: TelegramUser;
  profile: UserProfile;
}

/**
 * Resolve telegram chat_id → basic user (no API key required).
 * Single query to user_profiles (telegram fields merged).
 */
export async function resolveUserBasic(db: PostgrestClient, chatId: number): Promise<BasicUser | null> {
  const { data } = await db
    .from('user_profiles')
    .select('user_id, full_name, role, department_id, status, telegram_chat_id, telegram_username, telegram_is_active')
    .eq('telegram_chat_id', chatId)
    .eq('telegram_is_active', true)
    .single();

  if (!data || data.status !== 'active') return null;

  const telegramUser: TelegramUser = {
    user_id: data.user_id,
    telegram_chat_id: data.telegram_chat_id,
    telegram_username: data.telegram_username,
    telegram_is_active: data.telegram_is_active,
  };

  return {
    telegramUser,
    profile: data as unknown as UserProfile,
  };
}

/** No-op — last_update_id field removed (webhooks don't need it). */
export async function updateLastUpdateId(_db: PostgrestClient, _tgUserId: string, _updateId: number): Promise<void> {
  // No-op: using webhooks, not polling
}

/** Verify a linking code from user_profiles. Returns user_id on success, null on failure. */
export async function verifyCode(
  db: PostgrestClient,
  code: string,
  chatId: number,
  username: string | null,
): Promise<string | null> {
  // Find matching user with a valid, unexpired code
  const { data: profile } = await db
    .from('user_profiles')
    .select('user_id, telegram_verify_code_attempts')
    .eq('telegram_verify_code', code.toUpperCase())
    .gt('telegram_verify_code_expires_at', new Date().toISOString())
    .single();

  if (!profile) return null;

  if ((profile.telegram_verify_code_attempts ?? 0) >= 5) {
    // Max attempts — clear the code
    await db
      .from('user_profiles')
      .update({ telegram_verify_code: null, telegram_verify_code_expires_at: null, telegram_verify_code_attempts: 0 })
      .eq('user_id', profile.user_id);
    return null;
  }

  // Increment attempts first
  await db
    .from('user_profiles')
    .update({ telegram_verify_code_attempts: (profile.telegram_verify_code_attempts ?? 0) + 1 })
    .eq('user_id', profile.user_id);

  // Link Telegram and clear code
  await db
    .from('user_profiles')
    .update({
      telegram_chat_id: chatId,
      telegram_username: username,
      telegram_is_active: true,
      telegram_linked_at: new Date().toISOString(),
      telegram_verify_code: null,
      telegram_verify_code_expires_at: null,
      telegram_verify_code_attempts: 0,
    })
    .eq('user_id', profile.user_id);

  return profile.user_id;
}
