/**
 * Platform-agnostic formatting helpers.
 * No HTML/Markdown escaping here — that's platform-specific (esc() in each bot's format-helpers.ts).
 */

/** Format hours: integer → "8", decimal → "8.5" */
export function fmtHours(h: number): string {
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}

/** Format percentage: "44.0%" */
export function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

/** KPI status emoji based on thresholds */
export function kpiIcon(kpi: number): string {
  if (kpi >= 130) return '🟡';
  if (kpi >= 100) return '🟢';
  if (kpi >= 70)  return '🟠';
  return '🔴';
}

const MONTHS_UA = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];

export function monthName(m: number): string {
  return MONTHS_UA[m - 1] || String(m);
}

export function periodLabel(type: string, value?: number, year?: number): string {
  if (type === 'month' && value) return `${monthName(value)} ${year || ''}`.trim();
  if (type === 'quarter' && value) return `${value}-й квартал ${year || ''}`.trim();
  return `${year || ''} рік`.trim();
}

/** Shorten a name: "Іванов Максим Володимирович" → "Іванов М.В." */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  const surname = parts[0];
  const initials = parts.slice(1).map(p => p[0]?.toUpperCase() + '.').join('');
  return `${surname} ${initials}`;
}

/** Build a simple progress bar: ▓▓▓▓░░░░░░ 40% */
export function miniBar(ratio: number, width = 10): string {
  const filled = Math.min(width, Math.max(0, Math.round(ratio * width)));
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}
