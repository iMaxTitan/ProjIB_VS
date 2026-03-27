import logger from '@/lib/shared/logger';

export const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** Count Mon-Fri working days in a given month. */
export function getWorkingDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export const safeNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const getTimestamp = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
};

/**
 * Generate and download a company/employee PDF report.
 * Pure async — caller handles loading/error state.
 */
export async function generateReportFile(
  type: 'company' | 'employee',
  id: string,
  name: string,
  format: 'pdf' | 'docx',
  year: number,
  month: number,
): Promise<void> {
  const response = await fetch('/api/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id, year, month, format }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    const errorMsg = errorData.details
      ? `${errorData.error}: ${errorData.details}`
      : errorData.error || 'Ошибка генерации отчета';
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const contentDisposition = response.headers.get('Content-Disposition');
  let fileName = `report_${name}_${month}_${year}.${format}`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match) try { fileName = decodeURIComponent(match[1]); } catch { fileName = match[1]; }
  }

  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Generate and download a quarterly plan/report PDF.
 * Pure async — caller handles loading/error state.
 */
export async function generateQuarterlyDocumentFile(
  year: number,
  quarter: number,
  docType: 'quarterly_plan' | 'quarterly_report',
  format: 'pdf' | 'docx' = 'pdf',
): Promise<void> {
  const response = await fetch('/api/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: docType, year, quarter, format }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Ошибка генерации документа');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const contentDisposition = response.headers.get('Content-Disposition');
  let fileName = `${docType === 'quarterly_report' ? 'Отчет' : 'План'}_Q${quarter}.${format}`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match) try { fileName = decodeURIComponent(match[1]); } catch { fileName = match[1]; }
  }

  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  logger.info(`[reports] Generated ${docType} Q${quarter} ${year}`);
}
