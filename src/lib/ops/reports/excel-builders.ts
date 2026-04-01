/**
 * Excel report — worksheet builders and styling helpers.
 * Extracted from excel.ts to keep the orchestrator under the 300-line limit.
 */

import ExcelJS from 'exceljs';
import type { MonthlyReportData, QuarterlyPlanReportItem, TaskReportItem, EmployeeReportItem } from './excel-data';

const COLORS = {
  header: 'FF4472C4',
  headerText: 'FFFFFFFF',
  completed: 'FF70AD47',
  active: 'FFFFC000',
  failed: 'FFFF0000',
};

// ── Private helpers ────────────────────────────────────────────────────────────

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: COLORS.headerText } };
  row.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.header }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
}

function styleStatusCell(cell: ExcelJS.Cell, status: string): void {
  switch (status) {
    case 'done':
    case 'completed': cell.font = { color: { argb: COLORS.completed } }; break;
    case 'active':    cell.font = { color: { argb: COLORS.active } }; break;
    case 'failed':    cell.font = { color: { argb: COLORS.failed } }; break;
  }
}

function autoFitColumns(sheet: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function translateStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'draft': 'Черновик',
    'submitted': 'На рассмотрении',
    'approved': 'Утверждён',
    'active': 'В работе',
    'done': 'Выполнено',
    'completed': 'Выполнено',
    'failed': 'Не выполнено',
    'returned': 'Возвращён'
  };
  return statusMap[status] || status;
}

// ── Sheet builders ─────────────────────────────────────────────────────────────

export function addSummarySheet(sheet: ExcelJS.Worksheet, data: MonthlyReportData): void {
  sheet.mergeCells('A1:D1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Ежемесячный отчет: ${data.period.monthName} ${data.period.year}`;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center' };

  sheet.getCell('A3').value = 'Отдел:';
  sheet.getCell('B3').value = data.department.name;
  sheet.getCell('A3').font = { bold: true };
  sheet.getCell('A4').value = 'Период:';
  sheet.getCell('B4').value = `${data.period.monthName} ${data.period.year}`;
  sheet.getCell('A4').font = { bold: true };

  const statsStart = 6;
  const stats: [string, number | string][] = [
    ['Всего планов', data.summary.totalPlans],
    ['Выполнено', data.summary.completedPlans],
    ['В работе', data.summary.activePlans],
    ['Не выполнено', data.summary.failedPlans],
    ['Процент выполнения', `${data.summary.completionRate}%`],
    ['Плановые часы', data.summary.totalHoursPlanned],
    ['Фактические часы', data.summary.totalHoursSpent],
  ];

  stats.forEach((stat, index) => {
    const row = statsStart + index;
    sheet.getCell(`A${row}`).value = stat[0];
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).value = stat[1];
    if (stat[0] === 'Выполнено') {
      sheet.getCell(`B${row}`).font = { color: { argb: COLORS.completed } };
    } else if (stat[0] === 'Не выполнено' && Number(stat[1]) > 0) {
      sheet.getCell(`B${row}`).font = { color: { argb: COLORS.failed } };
    }
  });

  sheet.getColumn('A').width = 25;
  sheet.getColumn('B').width = 20;
  sheet.getColumn('C').width = 15;
  sheet.getColumn('D').width = 15;
}

export function addQuarterlyPlansSheet(sheet: ExcelJS.Worksheet, plans: QuarterlyPlanReportItem[]): void {
  const headers = ['Квартал', 'Цель', 'Ожидаемый результат', 'Статус', 'Процесс', '% выполнения'];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  plans.forEach(plan => {
    const row = sheet.addRow([
      `Q${plan.quarter}`,
      plan.goal,
      plan.expected_result,
      translateStatus(plan.status),
      plan.process_name,
      `${plan.completion_percentage}%`
    ]);
    styleStatusCell(row.getCell(4), plan.status);
  });

  autoFitColumns(sheet, [10, 30, 30, 15, 25, 12]);
}

export function addTasksSheet(sheet: ExcelJS.Worksheet, tasks: TaskReportItem[]): void {
  const headers = ['Дата', 'Описание', 'Часы', 'Сотрудник', 'План'];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  tasks.forEach(task => {
    sheet.addRow([
      formatDate(task.completed_at),
      task.description,
      task.spent_hours,
      task.employee_name,
      task.plan_name
    ]);
  });

  autoFitColumns(sheet, [12, 45, 10, 25, 35]);
}

export function addEmployeesSheet(sheet: ExcelJS.Worksheet, employees: EmployeeReportItem[]): void {
  const headers = ['Сотрудник', 'Всего часов', 'Кол-во задач', 'Кол-во планов'];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  const sorted = [...employees].sort((a, b) => b.total_hours - a.total_hours);
  sorted.forEach(emp => {
    sheet.addRow([emp.full_name, emp.total_hours, emp.tasks_count, emp.plans_count]);
  });

  autoFitColumns(sheet, [35, 15, 15, 15]);
}
