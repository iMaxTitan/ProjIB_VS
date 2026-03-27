/**
 * Teams-specific formatting helpers.
 * Teams uses a limited Markdown dialect (not full CommonMark).
 * Computed helpers (kpiIcon, monthName, etc.) re-exported from bot-core.
 */

/** Escape Markdown special chars for Teams */
export function esc(s: string): string {
  return s.replace(/([*_`\[\]()])/g, '\\$1');
}

/**
 * Convert Telegram HTML to Teams Markdown.
 * Used when a tool returns FormattedResult with parseMode='HTML'.
 */
export function htmlToTeamsMarkdown(html: string): string {
  return html
    .replace(/<b>([\s\S]*?)<\/b>/g, '**$1**')
    .replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<i>([\s\S]*?)<\/i>/g, '_$1_')
    .replace(/<em>([\s\S]*?)<\/em>/g, '_$1_')
    .replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<pre>([\s\S]*?)<\/pre>/g, '\n```\n$1\n```\n')
    .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, '[$2]($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Re-export platform-agnostic helpers
export { fmtHours, fmtPct, kpiIcon, monthName, periodLabel, shortName, miniBar } from '@/lib/bot/shared/format-base';
