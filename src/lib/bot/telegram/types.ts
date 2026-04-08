import type { PostgrestClient } from '@/lib/shared/postgrest-client';

// --- Tool system ---

export type ToolScope = 'own' | 'department' | 'all';
export type UserRole = 'employee' | 'head' | 'chief';

export interface ToolContext {
  db: PostgrestClient;
  userId: string;
  role: UserRole;
  departmentId: string | null;
  fullName: string;
  scope: ToolScope;
}

export interface BotTool {
  name: string;
  label: string;
  description: string;
  supportedScopes: ToolScope[];
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

/**
 * Special result type for tools that produce files (e.g. reports).
 * When ai-router detects this, it sends the document via sendDocument
 * instead of feeding it back to the AI loop.
 */
export interface DocumentResult {
  __type: 'document';
  buffer: Buffer;
  filename: string;
  caption?: string;
}

export function isDocumentResult(v: unknown): v is DocumentResult {
  return typeof v === 'object' && v !== null && (v as DocumentResult).__type === 'document';
}

/**
 * Special result type for tools that produce pre-formatted text.
 * When ai-router detects this, it sends the text directly via sendMessage
 * with the specified parseMode, bypassing AI formatting.
 */
export interface FormattedResult {
  __type: 'formatted';
  text: string;
  parseMode: 'HTML' | 'Markdown';
}

export function isFormattedResult(v: unknown): v is FormattedResult {
  return typeof v === 'object' && v !== null && (v as FormattedResult).__type === 'formatted';
}

// --- Telegram API types ---

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; username?: string; first_name?: string };
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string; // audio/ogg
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_name?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string };
  chat: { id: number; type: string };
  text?: string;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  date: number;
}

// --- DB types ---

/** Telegram channel fields — now stored in user_profiles */
export interface TelegramUser {
  user_id: string;
  telegram_chat_id: number;
  telegram_username: string | null;
  telegram_is_active: boolean;
}

export interface TelegramPermission {
  id: string;
  role: UserRole;
  tool_name: string;
  is_enabled: boolean;
  scope: ToolScope;
  updated_at: string;
}

export interface UserProfile {
  user_id: string;
  full_name: string | null;
  role: UserRole;
  department_id: string | null;
  status: string;
}
