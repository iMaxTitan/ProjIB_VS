/**
 * Direct command router — bypasses AI for deterministic button commands.
 * DIRECT_MAP and prefix commands are auto-built from botRegistry metadata.
 * No AI tokens consumed, no API key required for direct commands.
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import { botRegistry } from '@/lib/bot/core/registry';
import { loadPermissions, getEnabledToolsForRole } from '@/lib/bot/core/permissions';
import { isDocumentResult, isFormattedResult } from '@/lib/bot/core/types';
import type { BotTool, DocumentResult, ToolContext } from '@/lib/bot/core/types';
import type { UserProfile } from '@/lib/bot/telegram/types';

export interface DirectResult {
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  document?: DocumentResult;
}

// ── Registry helpers ──────────────────────────────────────────────────────────

/** Tools with directCommand (keyboard buttons, no AI). */
export function getDirectTools(): BotTool[] {
  return botRegistry.getAll().filter(t => t.directCommand);
}

/** Tools with prefixCommand (e.g. /doc). */
export function getPrefixTools(): BotTool[] {
  return botRegistry.getAll().filter(t => t.prefixCommand);
}

// ── Core handler ──────────────────────────────────────────────────────────────

/**
 * Try to handle `text` as a direct command without AI.
 * Returns null if not a recognized direct command → fall through to AI router.
 */
export async function tryDirectCommand(
  text: string,
  profile: UserProfile,
  db: SupabaseClient,
): Promise<DirectResult | null> {
  // Strip emoji variation selectors (U+FE0E/FE0F) — Telegram ReplyKeyboard may append them
  const key = text.toLowerCase().trim().replace(/[\uFE0E\uFE0F]/g, '');

  // 1. Prefix commands (e.g. /doc <query>) — auto from registry prefixCommand
  for (const tool of getPrefixTools()) {
    const { command, argKey, hint } = tool.prefixCommand!;
    if (key.startsWith(command)) {
      const query = text.trim().slice(command.length).trim();
      if (!query) {
        return {
          text: `🔍 Використання: ${command} &lt;запит&gt;\nНаприклад: ${command} ${hint}`,
          parseMode: 'HTML',
        };
      }
      try {
        const ctx: ToolContext = {
          db, userId: profile.user_id, role: profile.role,
          departmentId: profile.department_id, fullName: profile.full_name || 'Невідомий',
          scope: 'own', source: 'telegram',
        };
        const result = await tool.execute({ [argKey]: query }, ctx);
        if (isFormattedResult(result)) {
          return { text: result.text, parseMode: result.parseMode };
        }
        return { text: String(result) };
      } catch (err) {
        logger.error(`[Direct Router] ${command} error:`, err);
        return { text: 'Виникла помилка при пошуку в базі знань.' };
      }
    }
  }

  // 2. Button commands — auto from registry directCommand
  // Telegram sends the full button label text (with emoji) — key matches buttonLabel.toLowerCase()
  const directTool = getDirectTools().find(t => t.directCommand!.buttonLabel.toLowerCase() === key);
  if (!directTool) return null;

  // Check permissions (cached — no extra DB cost)
  const permissions = await loadPermissions(db);
  const enabledTools = getEnabledToolsForRole(permissions, profile.role, botRegistry.getAll());
  const enabledTool = enabledTools.find(t => t.tool.name === directTool.name);

  // Tool not permitted for this role → let AI handle (will return proper error)
  if (!enabledTool) return null;

  const ctx: ToolContext = {
    db,
    userId: profile.user_id,
    role: profile.role,
    departmentId: profile.department_id,
    fullName: profile.full_name || 'Невідомий',
    scope: enabledTool.scope,
    source: 'telegram',
  };

  try {
    const result = await directTool.execute(directTool.directCommand!.args, ctx);

    if (isDocumentResult(result)) {
      return { text: result.caption || 'Документ сформовано.', document: result };
    }
    if (isFormattedResult(result)) {
      return { text: result.text, parseMode: result.parseMode };
    }
    if (typeof result === 'object' && result !== null && 'error' in result) {
      return { text: String((result as { error: unknown }).error) };
    }
    return { text: String(result) };
  } catch (err) {
    logger.error(`[Direct Router] Tool ${directTool.name} error:`, err);
    return { text: 'Виникла помилка при виконанні команди. Спробуйте пізніше.' };
  }
}
