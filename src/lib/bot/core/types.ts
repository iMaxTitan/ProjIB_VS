/**
 * Shared types for all bots (Telegram, Teams, etc.)
 * Platform-specific types live in telegram/types.ts, teams/types.ts, etc.
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';

export type ToolScope = 'own' | 'department' | 'all';
export type UserRole = 'chief' | 'head' | 'analyst' | 'employee' | 'kb_user';

export type BotSource = 'telegram' | 'teams';

export interface ToolContext {
  db: SupabaseClient;
  userId: string;
  role: UserRole;
  departmentId: string | null;
  fullName: string;
  scope: ToolScope;
  /** Platform that triggered this tool call. Used for analytics logging. */
  source?: BotSource;
}

export interface BotTool {
  name: string;
  label: string;
  description: string;
  supportedScopes: ToolScope[];
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;

  /** Button command — invoke directly without AI, with fixed args. Shown as keyboard button. */
  directCommand?: {
    buttonLabel: string;           // e.g. "📄 Мій звіт"
    args: Record<string, unknown>; // fixed args passed to execute()
  };

  /** Prefix command — invoke directly without AI, passing user text as an arg. e.g. /doc <query> */
  prefixCommand?: {
    command: string; // e.g. '/doc'
    argKey: string;  // e.g. 'query' — key in args for the text after the prefix
    hint: string;    // e.g. 'вимоги до паролів' — shown in help
  };
}

export interface DocumentResult {
  __type: 'document';
  buffer: Buffer;
  filename: string;
  caption?: string;
}

export function isDocumentResult(v: unknown): v is DocumentResult {
  return typeof v === 'object' && v !== null && (v as DocumentResult).__type === 'document';
}

export interface FormattedResult {
  __type: 'formatted';
  text: string;
  parseMode: 'HTML' | 'Markdown';
}

export function isFormattedResult(v: unknown): v is FormattedResult {
  return typeof v === 'object' && v !== null && (v as FormattedResult).__type === 'formatted';
}

/** Bot permission record (stored in telegram_bot_permissions table). */
export interface BotPermission {
  id: string;
  role: UserRole;
  tool_name: string;
  is_enabled: boolean;
  scope: ToolScope;
  updated_at: string;
}
