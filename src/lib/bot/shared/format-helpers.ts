/**
 * Telegram-specific formatting helpers.
 * esc() is HTML-specific for Telegram parse_mode=HTML.
 * All platform-agnostic helpers are re-exported from format-base.ts.
 */

/** Escape HTML special chars for Telegram HTML parse mode */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Re-export platform-agnostic helpers
export { fmtHours, fmtPct, kpiIcon, monthName, periodLabel, shortName, miniBar } from '@/lib/bot/shared/format-base';
