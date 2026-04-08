/**
 * Teams AI Router — thin adapter over the shared bot-core router.
 * Uses server-side AI key (AI_PROVIDER / OPENAI_API_KEY / ANTHROPIC_API_KEY env vars).
 */

import { botRegistry } from '@/lib/bot/core/registry';
import { loadPermissions, getEnabledToolsForRole } from '@/lib/bot/core/permissions';
import type { DocumentResult, ToolScope, UserRole } from '@/lib/bot/core/types';
import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import { runBotRouter } from '@/lib/bot/core/router';

export interface TeamsRouterResult {
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  document?: DocumentResult;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  aiModel: string;
  aiProvider: string;
}

export async function processTeamsMessage(
  userId: string,
  role: UserRole,
  departmentId: string | null,
  fullName: string,
  messageText: string,
  conversationId: string,
  db: PostgrestClient,
): Promise<TeamsRouterResult> {
  // Filter tools by role permissions (is_enabled). Scope is based on role.
  const permissions = await loadPermissions(db);
  const enabledTools = getEnabledToolsForRole(permissions, role, botRegistry.getAll());
  const tools = enabledTools.map(t => t.tool);

  if (tools.length === 0) {
    return { text: 'У вас немає доступних інструментів. Зверніться до адміністратора.', promptTokens: 0, completionTokens: 0, totalTokens: 0, aiModel: '', aiProvider: '' };
  }

  // Scope based on role — key type doesn't override data access rules
  const scopeForRole: ToolScope = role === 'chief' ? 'all' : role === 'head' ? 'department' : 'own';
  const toolScopes = new Map(tools.map(t => [t.name, scopeForRole]));

  const result = await runBotRouter({
    userId,
    role,
    departmentId,
    fullName,
    message: messageText,
    conversationId: userId, // memory keyed by user, not Teams conversation
    db,
    tools,
    toolScopes,
    botIdentity: 'Jarvise, корпоративний асистент АТБ',
    source: 'teams',
  });

  return {
    text: result.text,
    parseMode: result.parseMode,
    document: result.document,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    aiModel: result.aiModel,
    aiProvider: result.aiProvider,
  };
}
