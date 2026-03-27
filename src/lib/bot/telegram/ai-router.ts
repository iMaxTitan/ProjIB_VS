/**
 * Telegram AI Router — thin adapter over the shared bot-core router.
 * Resolves user permissions, builds tool scope map, then delegates to runBotRouter.
 */

import { botRegistry } from '@/lib/bot/core/registry';
import { loadPermissions, getEnabledToolsForRole } from '@/lib/bot/core/permissions';
import type { BasicUser } from './auth';
import type { DocumentResult } from '@/lib/bot/core/types';
import { runBotRouter } from '@/lib/bot/core/router';

export interface AIRouterResult {
  text: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  toolsUsed: string[];
  document?: DocumentResult;
  parseMode?: 'HTML' | 'Markdown';
  aiProvider?: string;
  aiModel?: string;
}

const ZERO_TOKENS = { totalTokens: 0, promptTokens: 0, completionTokens: 0 };

export async function processMessage(
  user: BasicUser,
  messageText: string,
): Promise<AIRouterResult> {
  const db = (await import('@/lib/shared/db-server')).getServerDb();

  const permissions = await loadPermissions(db);
  const allTools = botRegistry.getAll();
  const enabledTools = getEnabledToolsForRole(permissions, user.profile.role, allTools);

  if (enabledTools.length === 0) {
    return { text: 'У вас немає доступних інструментів. Зверніться до адміністратора.', ...ZERO_TOKENS, toolsUsed: [] };
  }

  const tools = enabledTools.map(t => t.tool);
  const toolScopes = new Map(enabledTools.map(t => [t.tool.name, t.scope]));

  return runBotRouter({
    userId: user.profile.user_id,
    role: user.profile.role,
    departmentId: user.profile.department_id,
    fullName: user.profile.full_name || 'Невідомий',
    message: messageText,
    conversationId: user.profile.user_id, // 1:1 private chat
    db,
    tools,
    toolScopes,
    botIdentity: 'асистент системи CS Platform',
    source: 'telegram',
  });
}
