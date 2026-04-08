/**
 * Bot permission system — shared across all channels.
 * Loads role×tool permissions from DB and filters tools accordingly.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import type { BotPermission, BotTool, UserRole, ToolScope } from './types';

// ─── Cache (5 min TTL) ────────────────────────────────────────────────────────

let permissionsCache: BotPermission[] | null = null;
let permissionsCacheTime = 0;
const PERMISSIONS_CACHE_TTL = 5 * 60 * 1000;

// ─── Public API ───────────────────────────────────────────────────────────────

/** Load permissions (cached 5 min). */
export async function loadPermissions(db: PostgrestClient): Promise<BotPermission[]> {
  if (permissionsCache && Date.now() - permissionsCacheTime < PERMISSIONS_CACHE_TTL) {
    return permissionsCache;
  }

  const { data, error } = await db
    .from('bot_permissions')
    .select('*');

  if (error) {
    logger.error('[Permissions] Failed to load:', error);
    return permissionsCache || [];
  }

  permissionsCache = (data || []) as BotPermission[];
  permissionsCacheTime = Date.now();
  return permissionsCache;
}

/** Get enabled tools with their scopes for a given role. */
export function getEnabledToolsForRole(
  permissions: BotPermission[],
  role: UserRole,
  allTools: BotTool[],
): Array<{ tool: BotTool; scope: ToolScope }> {
  const result: Array<{ tool: BotTool; scope: ToolScope }> = [];

  for (const tool of allTools) {
    const perm = permissions.find(p => p.role === role && p.tool_name === tool.name);
    if (perm?.is_enabled) {
      result.push({ tool, scope: perm.scope });
    }
  }

  return result;
}

/** Invalidate permissions cache (call after admin changes). */
export function invalidatePermissionsCache(): void {
  permissionsCache = null;
  permissionsCacheTime = 0;
}
