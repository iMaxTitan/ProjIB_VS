/**
 * ToolRegistry — class-based registry (not singleton).
 * Each bot (Telegram, Teams) creates its own instance.
 */

import type { BotTool } from './types';

export class ToolRegistry {
  private registry = new Map<string, BotTool>();

  register(tool: BotTool): void {
    this.registry.set(tool.name, tool);
  }

  getAll(): BotTool[] {
    return Array.from(this.registry.values());
  }

  getByName(name: string): BotTool | undefined {
    return this.registry.get(name);
  }

  getNames(): string[] {
    return Array.from(this.registry.keys());
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }
}
