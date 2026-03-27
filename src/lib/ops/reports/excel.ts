/**
 * Excel report generator — orchestration.
 * Data fetching: excel-data.ts | Sheet builders: excel-builders.ts
 */

import ExcelJS from 'exceljs';
import { getMonthlyReportData as fetchMonthlyReportData } from './excel-data';
import {
  addSummarySheet,
  addQuarterlyPlansSheet,
  addTasksSheet,
  addEmployeesSheet,
} from './excel-builders';

export type {
  MonthlyReportData,
  QuarterlyPlanReportItem,
  TaskReportItem,
  EmployeeReportItem,
} from './excel-data';

export class ExcelReportGenerator {
  static getMonthlyReportData = fetchMonthlyReportData;

  static async generateExcel(data: import('./excel-data').MonthlyReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProjIB System';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Сводка');
    addSummarySheet(summarySheet, data);

    if (data.quarterlyPlans.length > 0) {
      const quarterlySheet = workbook.addWorksheet('Квартальные планы');
      addQuarterlyPlansSheet(quarterlySheet, data.quarterlyPlans);
    }

    if (data.tasks.length > 0) {
      const tasksSheet = workbook.addWorksheet('Задачи');
      addTasksSheet(tasksSheet, data.tasks);
    }

    if (data.employees.length > 0) {
      const employeesSheet = workbook.addWorksheet('Сотрудники');
      addEmployeesSheet(employeesSheet, data.employees);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
