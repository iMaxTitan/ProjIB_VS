/**
 * Single bot tool registry — shared across all channels (Telegram, Teams, …).
 * Import `botRegistry` wherever you need access to bot tools.
 */

import { ToolRegistry } from './tool-registry';
import { kbSearchTool } from '@/lib/kb/bot-adapter';
import { getKpiTool } from '@/lib/ops/kpi/bot-adapter';
import { getActivityTool } from '@/lib/ops/activity/bot-adapter';
import { getPlansTool, getHoursTool } from '@/lib/ops/plans/bot-adapter';
import { getEmployeeReportTool, generateReportTool, generateQuarterlyTool } from '@/lib/ops/reports/bot-adapter';

export const botRegistry = new ToolRegistry();

[
  kbSearchTool,
  getKpiTool,
  getActivityTool,
  getHoursTool,
  getPlansTool,
  getEmployeeReportTool,
  generateReportTool,
  generateQuarterlyTool,
].forEach(tool => botRegistry.register(tool));
