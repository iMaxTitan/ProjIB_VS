import ExcelJS from 'exceljs';
import { supabase } from '../supabase';
import logger from '@/lib/logger';

/**
 * Типы данных для ежемесячного отчета
 */
export interface MonthlyReportData {
  period: {
    year: number;
    month: number;
    monthName: string;
  };
  department: {
    id: string;
    name: string;
    code: string;
  };
  summary: {
    totalPlans: number;
    completedPlans: number;
    activePlans: number;
    failedPlans: number;
    completionRate: number;
    totalHoursPlanned: number;
    totalHoursSpent: number;
  };
  quarterlyPlans: QuarterlyPlanReportItem[];
  tasks: TaskReportItem[];
  employees: EmployeeReportItem[];
}

export interface QuarterlyPlanReportItem {
  quarterly_id: string;
  quarter: number;
  goal: string;
  expected_result: string;
  status: string;
  process_name: string;
  completion_percentage: number;
}

export interface TaskReportItem {
  task_id: string;
  description: string;
  spent_hours: number;
  completed_at: string;
  employee_name: string;
  plan_name: string;
}

export interface EmployeeReportItem {
  user_id: string;
  full_name: string;
  total_hours: number;
  tasks_count: number;
  plans_count: number;
}

/**
 * Названия месяцев для отчетов
 */
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

/**
 * Цвета для стилизации Excel
 */
const COLORS = {
  header: 'FF4472C4',
  headerText: 'FFFFFFFF',
  completed: 'FF70AD47',
  active: 'FFFFC000',
  failed: 'FFFF0000',
};

/**
 * Генератор Excel отчетов.
 * Создает ежемесячные отчеты с данными из Supabase.
 */
export class ExcelReportGenerator {
  /**
   * Получает данные для ежемесячного отчета из базы данных
   */
  static async getMonthlyReportData(
    year: number,
    month: number,
    departmentId?: string
  ): Promise<MonthlyReportData | null> {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Последний день месяца

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Получаем данные отдела
      let departmentData = null;
      if (departmentId) {
        const { data } = await supabase
          .from('departments')
          .select('*')
          .eq('department_id', departmentId)
          .single();
        departmentData = data;
      }

      // Получаем месячные планы за период
      let monthlyQuery = supabase
        .from('monthly_plans')
        .select('*')
        .eq('year', year)
        .eq('month', month);

      if (departmentId) {
        monthlyQuery = monthlyQuery.eq('department_id', departmentId);
      }

      const { data: monthlyPlans, error: monthlyError } = await monthlyQuery;
      if (monthlyError) {
        logger.error('[ExcelReportGenerator] Ошибка получения месячных планов:', monthlyError);
        throw monthlyError;
      }

      // Получаем квартальные планы (по quarterly_id из месячных)
      const quarterlyIds = Array.from(new Set(
        (monthlyPlans || [])
          .map(mp => mp.quarterly_id)
          .filter(Boolean)
      ));

      let quarterlyPlans: QuarterlyPlanReportItem[] = [];
      if (quarterlyIds.length > 0) {
        const { data } = await supabase
          .from('v_quarterly_reports')
          .select('*')
          .in('quarterly_id', quarterlyIds);

        quarterlyPlans = (data || []).map(qp => ({
          quarterly_id: qp.quarterly_id,
          quarter: qp.quarter,
          goal: qp.goal || '',
          expected_result: qp.expected_result || '',
          status: qp.status || '',
          process_name: qp.process_name || '',
          completion_percentage: qp.completion_percentage || 0
        }));
      }

      // Получаем задачи за период (daily_tasks)
      const { data: tasks } = await supabase
        .from('daily_tasks')
        .select(`
          daily_task_id,
          description,
          spent_hours,
          task_date,
          user_id,
          monthly_plan_id
        `)
        .gte('task_date', startDateStr)
        .lte('task_date', endDateStr);

      // Получаем информацию о пользователях
      const userIds = Array.from(new Set((tasks || []).map(t => t.user_id).filter(Boolean)));
      let usersMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('user_profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        usersMap = (users || []).reduce((acc, u) => {
          acc[u.user_id] = u.full_name || 'Неизвестно';
          return acc;
        }, {} as Record<string, string>);
      }

      // Получаем информацию о планах для задач
      const planIds = Array.from(new Set((tasks || []).map(t => t.monthly_plan_id).filter(Boolean)));
      let plansMap: Record<string, string> = {};
      if (planIds.length > 0) {
        const { data: plans } = await supabase
          .from('monthly_plans')
          .select('monthly_plan_id, description')
          .in('monthly_plan_id', planIds);
        plansMap = (plans || []).reduce((acc, p) => {
          acc[p.monthly_plan_id] = p.description || '';
          return acc;
        }, {} as Record<string, string>);
      }

      // Формируем данные по задачам
      const taskItems: TaskReportItem[] = (tasks || []).map(t => ({
        task_id: t.daily_task_id,
        description: t.description || '',
        spent_hours: Number(t.spent_hours) || 0,
        completed_at: t.task_date || '',
        employee_name: usersMap[t.user_id] || 'Неизвестно',
        plan_name: plansMap[t.monthly_plan_id] || ''
      }));

      // Статистика по сотрудникам
      const employeeStats = new Map<string, EmployeeReportItem>();
      const employeePlans = new Map<string, Set<string>>();

      (tasks || []).forEach(task => {
        const userId = task.user_id;
        if (!userId) return;

        const existing = employeeStats.get(userId) || {
          user_id: userId,
          full_name: usersMap[userId] || 'Неизвестно',
          total_hours: 0,
          tasks_count: 0,
          plans_count: 0
        };

        existing.total_hours += Number(task.spent_hours) || 0;
        existing.tasks_count += 1;
        employeeStats.set(userId, existing);

        // Подсчет уникальных планов
        if (!employeePlans.has(userId)) {
          employeePlans.set(userId, new Set());
        }
        if (task.monthly_plan_id) {
          employeePlans.get(userId)!.add(task.monthly_plan_id);
        }
      });

      // Обновляем количество планов
      employeePlans.forEach((plans, userId) => {
        const emp = employeeStats.get(userId);
        if (emp) emp.plans_count = plans.size;
      });

      // Подсчет статистики по месячным планам
      const completedPlans = (monthlyPlans || []).filter(p => p.status === 'completed').length;
      const activePlans = (monthlyPlans || []).filter(p => p.status === 'active').length;
      const failedPlans = (monthlyPlans || []).filter(p => p.status === 'failed').length;
      const totalPlans = (monthlyPlans || []).length;

      const totalHoursPlanned = (monthlyPlans || []).reduce(
        (sum, p) => sum + (Number(p.planned_hours) || 0),
        0
      );
      const totalHoursSpent = taskItems.reduce(
        (sum, t) => sum + t.spent_hours,
        0
      );

      return {
        period: {
          year,
          month,
          monthName: MONTH_NAMES[month - 1]
        },
        department: departmentData ? {
          id: departmentData.department_id,
          name: departmentData.department_name,
          code: departmentData.department_code || 'DEPT'
        } : {
          id: 'all',
          name: 'Все отделы',
          code: 'ALL'
        },
        summary: {
          totalPlans,
          completedPlans,
          activePlans,
          failedPlans,
          completionRate: totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0,
          totalHoursPlanned,
          totalHoursSpent
        },
        quarterlyPlans,
        tasks: taskItems,
        employees: Array.from(employeeStats.values())
      };
    } catch (error: unknown) {
      logger.error('[ExcelReportGenerator] Ошибка получения данных:', error);
      return null;
    }
  }

  /**
   * Генерирует Excel файл из данных отчета
   */
  static async generateExcel(data: MonthlyReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProjIB System';
    workbook.created = new Date();

    // === Лист 1: Сводка ===
    const summarySheet = workbook.addWorksheet('Сводка');
    this.addSummarySheet(summarySheet, data);

    // === Лист 2: Квартальные планы ===
    if (data.quarterlyPlans.length > 0) {
      const quarterlySheet = workbook.addWorksheet('Квартальные планы');
      this.addQuarterlyPlansSheet(quarterlySheet, data.quarterlyPlans);
    }

    // === Лист 3: Задачи ===
    if (data.tasks.length > 0) {
      const tasksSheet = workbook.addWorksheet('Задачи');
      this.addTasksSheet(tasksSheet, data.tasks);
    }

    // === Лист 4: Сотрудники ===
    if (data.employees.length > 0) {
      const employeesSheet = workbook.addWorksheet('Сотрудники');
      this.addEmployeesSheet(employeesSheet, data.employees);
    }

    // Генерируем Buffer
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Добавляет лист сводки
   */
  private static addSummarySheet(sheet: ExcelJS.Worksheet, data: MonthlyReportData): void {
    // Заголовок
    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Ежемесячный отчет: ${data.period.monthName} ${data.period.year}`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    // Информация об отделе
    sheet.getCell('A3').value = 'Отдел:';
    sheet.getCell('B3').value = data.department.name;
    sheet.getCell('A3').font = { bold: true };

    sheet.getCell('A4').value = 'Период:';
    sheet.getCell('B4').value = `${data.period.monthName} ${data.period.year}`;
    sheet.getCell('A4').font = { bold: true };

    // Статистика
    const statsStart = 6;
    const stats = [
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
      sheet.getCell(`A${row}`).value = stat[0] as string;
      sheet.getCell(`A${row}`).font = { bold: true };
      sheet.getCell(`B${row}`).value = stat[1];

      // Цветовая индикация для ключевых метрик
      if (stat[0] === 'Выполнено') {
        sheet.getCell(`B${row}`).font = { color: { argb: COLORS.completed } };
      } else if (stat[0] === 'Не выполнено' && Number(stat[1]) > 0) {
        sheet.getCell(`B${row}`).font = { color: { argb: COLORS.failed } };
      }
    });

    // Настройка ширины колонок
    sheet.getColumn('A').width = 25;
    sheet.getColumn('B').width = 20;
    sheet.getColumn('C').width = 15;
    sheet.getColumn('D').width = 15;
  }

  /**
   * Добавляет лист квартальных планов
   */
  private static addQuarterlyPlansSheet(
    sheet: ExcelJS.Worksheet,
    plans: QuarterlyPlanReportItem[]
  ): void {
    const headers = ['Квартал', 'Цель', 'Ожидаемый результат', 'Статус', 'Процесс', '% выполнения'];
    const headerRow = sheet.addRow(headers);
    this.styleHeaderRow(headerRow);

    plans.forEach(plan => {
      const row = sheet.addRow([
        `Q${plan.quarter}`,
        plan.goal,
        plan.expected_result,
        this.translateStatus(plan.status),
        plan.process_name,
        `${plan.completion_percentage}%`
      ]);
      this.styleStatusCell(row.getCell(4), plan.status);
    });

    this.autoFitColumns(sheet, [10, 30, 30, 15, 25, 12]);
  }

  /**
   * Добавляет лист задач
   */
  private static addTasksSheet(
    sheet: ExcelJS.Worksheet,
    tasks: TaskReportItem[]
  ): void {
    const headers = ['Дата', 'Описание', 'Часы', 'Сотрудник', 'План'];
    const headerRow = sheet.addRow(headers);
    this.styleHeaderRow(headerRow);

    tasks.forEach(task => {
      sheet.addRow([
        this.formatDate(task.completed_at),
        task.description,
        task.spent_hours,
        task.employee_name,
        task.plan_name
      ]);
    });

    this.autoFitColumns(sheet, [12, 45, 10, 25, 35]);
  }

  /**
   * Добавляет лист сотрудников
   */
  private static addEmployeesSheet(
    sheet: ExcelJS.Worksheet,
    employees: EmployeeReportItem[]
  ): void {
    const headers = ['Сотрудник', 'Всего часов', 'Кол-во задач', 'Кол-во планов'];
    const headerRow = sheet.addRow(headers);
    this.styleHeaderRow(headerRow);

    // Сортируем по часам (от большего к меньшему)
    const sorted = [...employees].sort((a, b) => b.total_hours - a.total_hours);

    sorted.forEach(emp => {
      sheet.addRow([
        emp.full_name,
        emp.total_hours,
        emp.tasks_count,
        emp.plans_count
      ]);
    });

    this.autoFitColumns(sheet, [35, 15, 15, 15]);
  }

  /**
   * Стилизация заголовков таблицы
   */
  private static styleHeaderRow(row: ExcelJS.Row): void {
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

  /**
   * Стилизация ячейки статуса
   */
  private static styleStatusCell(cell: ExcelJS.Cell, status: string): void {
    switch (status) {
      case 'completed':
        cell.font = { color: { argb: COLORS.completed } };
        break;
      case 'active':
        cell.font = { color: { argb: COLORS.active } };
        break;
      case 'failed':
        cell.font = { color: { argb: COLORS.failed } };
        break;
    }
  }

  /**
   * Автоматическая настройка ширины колонок
   */
  private static autoFitColumns(sheet: ExcelJS.Worksheet, widths: number[]): void {
    widths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });
  }

  /**
   * Форматирование даты
   */
  private static formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * Перевод статуса на русский
   */
  private static translateStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'draft': 'Черновик',
      'submitted': 'На рассмотрении',
      'approved': 'Утверждён',
      'active': 'В работе',
      'completed': 'Выполнено',
      'failed': 'Не выполнено',
      'returned': 'Возвращён'
    };
    return statusMap[status] || status;
  }
}

