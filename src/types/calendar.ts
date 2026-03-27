/**
 * Типы для рабочего календаря и табеля сотрудников.
 */

/** Коды ячеек табеля */
export type TimesheetCode = '8' | 'В' | 'С' | 'О' | 'Б' | 'К' | 'Д' | 'І';

/** Метаданные кодов табеля */
export const TIMESHEET_CODES: Record<TimesheetCode, { label: string; color: string; hours: number }> = {
  '8': { label: 'Работа',       color: 'text-slate-400',                  hours: 8 },
  'В': { label: 'Выходной',     color: 'bg-slate-50 text-slate-300',      hours: 0 },
  'С': { label: 'Праздник',     color: 'bg-rose-50 text-rose-500',        hours: 0 },
  'О': { label: 'Отпуск',       color: 'bg-sky-50 text-sky-600',          hours: 0 },
  'Б': { label: 'Больничный',   color: 'bg-amber-50 text-amber-600',      hours: 0 },
  'К': { label: 'Командировка', color: 'bg-violet-50 text-violet-600',    hours: 0 },
  'Д': { label: 'Отгул',        color: 'bg-indigo-50 text-indigo-600',    hours: 0 },
  'І': { label: 'Прочее',       color: 'bg-slate-100 text-slate-500',     hours: 0 },
};

/** Цвета для MiniCalendarGrid (более насыщенные, т.к. маленькие ячейки) */
export const MINI_CALENDAR_COLORS: Record<TimesheetCode, string> = {
  '8': 'bg-emerald-100 text-emerald-700',
  'В': 'bg-slate-100 text-slate-400',
  'С': 'bg-rose-100 text-rose-600',
  'О': 'bg-sky-100 text-sky-700',
  'Б': 'bg-amber-100 text-amber-700',
  'К': 'bg-violet-100 text-violet-700',
  'Д': 'bg-indigo-100 text-indigo-700',
  'І': 'bg-slate-100 text-slate-600',
};

/** Коды, доступные для выбора при редактировании ячейки (без В/С — они системные) */
export const EDITABLE_CODES: TimesheetCode[] = ['8', 'О', 'Б', 'К', 'Д', 'І'];

/** Запись рабочих часов за месяц (шаблон календаря) */
export interface MonthlyWorkingDays {
  year: number;
  month: number;
  work_hours: number;
  day_types?: TimesheetCode[] | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

/** Табель сотрудника за месяц */
export interface EmployeeTimesheet {
  id: string;
  year: number;
  month: number;
  user_id: string;
  days: TimesheetCode[];
  work_hours: number;
  work_rate?: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // JOIN fields
  full_name?: string | null;
  department_id?: string | null;
}

/** Параметры для API — создание/обновление рабочих дней месяца */
export interface SetWorkingDaysParams {
  year: number;
  month: number;
  dayTypes: TimesheetCode[];
}
