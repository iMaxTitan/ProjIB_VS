/**
 * Bot module — AI assistant across all channels.
 *
 * Structure:
 *   core/      — registry, router, types, permissions
 *   tools/     — bot tool implementations (thin adapters to domain modules)
 *   telegram/  — Telegram channel adapter
 *   teams/     — Microsoft Teams channel adapter
 */

export { botRegistry } from './core/registry';
export { runBotRouter } from './core/router';
export type { BotTool, ToolContext, FormattedResult, DocumentResult } from './core/types';
export { loadPermissions, getEnabledToolsForRole } from './core/permissions';
