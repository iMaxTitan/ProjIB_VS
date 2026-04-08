/**
 * Teams direct command router — deterministic button commands without AI.
 * DIRECT_MAP and prefix commands are auto-built from botRegistry metadata.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import { botRegistry } from '@/lib/bot/core/registry';
import { isDocumentResult, isFormattedResult, type DocumentResult, type ToolContext } from '@/lib/bot/core/types';
import type { TeamsUserProfile } from './types';

export interface TeamsDirectResult {
  text: string;
  isHtml?: boolean;
  document?: DocumentResult;
}

// ── Registry helpers ──────────────────────────────────────────────────────────

/**
 * Teams sends button value without emoji prefix (value = label.toLowerCase() stripped of emoji).
 * "📄 Мій звіт" → "мій звіт"
 */
function teamsKey(buttonLabel: string): string {
  return buttonLabel.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase();
}

/**
 * Suggested actions (quick-reply chips).
 * Single "Довідка" hub — expands to full tool menu in welcome card.
 */
export function getTeamsSuggestedActions(): string[] {
  return ['ℹ️ Довідка'];
}

// ── Core handler ──────────────────────────────────────────────────────────────

/**
 * Try to handle text as a direct command (no AI).
 * Returns null if not a recognized direct command → fall through to AI router.
 */
export async function tryDirectTeamsCommand(
  text: string,
  profile: TeamsUserProfile,
  db: PostgrestClient,
): Promise<TeamsDirectResult | null> {
  const key = text.toLowerCase().trim();
  const allTools = botRegistry.getAll();

  // 1. Prefix commands (e.g. /doc <query>) — auto from registry prefixCommand
  for (const tool of allTools.filter(t => t.prefixCommand)) {
    const { command, argKey, hint } = tool.prefixCommand!;
    if (key.startsWith(command)) {
      const query = text.trim().slice(command.length).trim();
      if (!query) {
        return {
          text: `🔍 Використання: ${command} &lt;запит&gt;\nНаприклад: ${command} ${hint}`,
          isHtml: true,
        };
      }
      const ctx: ToolContext = {
        db, userId: profile.user_id, role: profile.role,
        departmentId: profile.department_id, fullName: profile.full_name || 'Невідомий',
        scope: 'own', source: 'teams',
      };
      try {
        const result = await tool.execute({ [argKey]: query }, ctx);
        if (isFormattedResult(result)) {
          return { text: result.text, isHtml: true };
        }
        return { text: String(result) };
      } catch (err) {
        logger.error(`[Teams Direct Router] ${command} error:`, err);
        return { text: 'Виникла помилка при пошуку в базі знань.' };
      }
    }
  }

  // 2. Button commands — auto from registry directCommand
  // Teams sends value = stripped emoji label lowercase (e.g. "мій звіт")
  const directTool = allTools.find(t => t.directCommand && teamsKey(t.directCommand.buttonLabel) === key);
  if (!directTool) return null;

  const ctx: ToolContext = {
    db,
    userId: profile.user_id,
    role: profile.role,
    departmentId: profile.department_id,
    fullName: profile.full_name || 'Невідомий',
    scope: 'all', // Teams uses server key
    source: 'teams',
  };

  try {
    const result = await directTool.execute(directTool.directCommand!.args, ctx);

    if (isDocumentResult(result)) {
      return { text: result.caption || 'Документ сформовано.', document: result };
    }
    if (isFormattedResult(result)) {
      return { text: result.text, isHtml: true };
    }
    if (typeof result === 'object' && result !== null && 'error' in result) {
      return { text: String((result as { error: unknown }).error) };
    }
    return { text: String(result) };
  } catch (err) {
    logger.error(`[Teams Direct Router] Tool ${directTool.name} error:`, err);
    return { text: 'Виникла помилка при виконанні команди. Спробуйте пізніше.' };
  }
}
