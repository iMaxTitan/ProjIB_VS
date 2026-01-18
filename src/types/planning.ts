import { UserInfo } from './azure';
import { UserRole, UserStatus } from './supabase';

// Типы статусов планов
export type PlanStatus = 'draft' | 'submitted' | 'approved' | 'active' | 'completed' | 'failed' | 'returned';

// Интерфейс для статуса плана с дополнительной информацией
export interface PlanStatusInfo {
  value: PlanStatus;
  label: string;
  color: string;
}

// Список всех статусов планов с метаданными
export const PLAN_STATUSES: PlanStatusInfo[] = [
  { value: 'draft', label: 'Черновик', color: 'gray' },
  { value: 'submitted', label: 'На рассмотрении', color: 'blue' },
  { value: 'approved', label: 'Утвержден', color: 'indigo' },
  { value: 'active', label: 'Активен', color: 'green' },
  { value: 'completed', label: 'Завершен', color: 'emerald' },
  { value: 'failed', label: 'Не выполнен', color: 'red' },
  { value: 'returned', label: 'Возвращен', color: 'orange' }
];

// Интерфейс для годового плана
export interface AnnualPlan {
  annual_id: string;
  year: number;
  goal: string;
  expected_result: string;
  budget: number | null;
  status: PlanStatus;
  user_id: string | null;
  author_name?: string;
  author_email?: string;
  author_photo?: string;
  department_name?: string;
  quarterly_plans_count?: number;
  completion_percentage?: number;
}

// Интерфейс для процесса
export interface Process {
  process_id: string;
  process_name: string;
}

// Интерфейс для квартального плана
export interface QuarterlyPlan {
  quarterly_id: string;
  annual_plan_id: string | null;
  department_id: string | null;
  department_name?: string;
  quarter: number;
  goal: string;
  expected_result: string;
  status: PlanStatus;
  weekly_plans_count?: number;
  completion_percentage?: number;
  process_id?: string | null;
  process_name?: string;
}

// Интерфейс для недельного плана
export interface WeeklyPlan {
  weekly_id: string;
  quarterly_id: string | null;
  weekly_date: string;
  expected_result: string;
  status: PlanStatus;
  annual_plan_id?: string | null;
  department_id?: string | null;
  department_name?: string;
  quarter?: number;
  year?: number;
  assignees_count?: number;
  completion_percentage?: number;
  created_at?: string;
  updated_at?: string;
  planned_hours: number; // Новое поле для плановых часов
  total_spent_hours?: number; // Затраченные часы (из view)
  company_names?: string[]; // Массив названий компаний
}

// Интерфейс для назначения недельного плана
export interface WeeklyPlanAssignee {
  weekly_plan_id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  photo_url?: string;
  role?: UserRole;
  user_status?: UserStatus;
  department_id?: string;
  department_name?: string;
  weekly_date?: string;
  quarter?: number;
  year?: number;
}

// Интерфейс для активности
export interface Activity {
  id: string;
  user_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  timestamp: string;
  details?: any;
  created_at: string;
}

// Типы для фильтров
export type PlanFilterType = 'status' | 'department' | 'year' | 'quarter';

// Интерфейс для фильтра планов
export interface PlanFilter {
  type: PlanFilterType;
  value: string | number;
}

// Функции для работы с планами
export const getPlanStatusText = (status: PlanStatus): string => {
  switch (status) {
    case 'draft': return 'Черновик';
    case 'submitted': return 'На рассмотрении';
    case 'approved': return 'Утвержден';
    case 'active': return 'В работе';
    case 'completed': return 'Выполнен';
    case 'failed': return 'Не выполнен';
    case 'returned': return 'Возвращен';
    default: return 'Неизвестно';
  }
};

export const getPlanStatusColor = (status: PlanStatus): string => {
  switch (status) {
    case 'draft': return 'gray';
    case 'submitted': return 'blue';
    case 'approved': return 'indigo';
    case 'active': return 'green';
    case 'completed': return 'emerald';
    case 'failed': return 'red';
    case 'returned': return 'orange';
    default: return 'gray';
  }
};

// --- Градиентные классы для статусов планов ---
export function getPlanStatusGradient(status: PlanStatus): string {
  switch (status) {
    case 'draft': return 'linear-gradient(90deg, #9CA3AF, #4B5563)'; // Серый
    case 'submitted': return 'linear-gradient(90deg, #93C5FD, #3B82F6)'; // Синий
    case 'approved': return 'linear-gradient(90deg, #34D399, #059669)'; // Зеленый
    case 'active': return 'linear-gradient(90deg, #A5B4FC, #6366F1)'; // Индиго
    case 'completed': return 'linear-gradient(90deg, #10B981, #047857)'; // Изумрудный
    case 'failed': return 'linear-gradient(90deg, #F87171, #B91C1C)'; // Красный
    case 'returned': return 'linear-gradient(90deg, #FDBA74, #EA580C)'; // Оранжевый
    default: return 'linear-gradient(90deg, #9CA3AF, #4B5563)'; // Серый по умолчанию
  }
}

// Функция для форматирования даты
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// Функция для получения номера недели
export const getWeekNumber = (dateString: string): number => {
  const date = new Date(dateString);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};

// Функция для получения диапазона дат недели
export const getWeekDateRange = (dateString: string): { start: string; end: string } => {
  const date = new Date(dateString);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Корректировка для недели, начинающейся с понедельника
  
  const startDate = new Date(date.setDate(diff));
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  
  return {
    start: formatDate(startDate.toISOString()),
    end: formatDate(endDate.toISOString())
  };
};

// Функция для проверки прав доступа к управлению планами
export const canManagePlans = (user: UserInfo, planDepartmentId?: string | null): boolean => {
  if (!user) return false;
  
  // Руководитель подразделения может управлять всеми планами
  if (user.role === 'chief') return true;
  
  // Начальники отделов могут управлять планами своего отдела
  if (user.role === 'head' && user.department_id === planDepartmentId) return true;
  
  return false;
};

// Функция для проверки прав доступа к созданию годовых планов
export const canCreateAnnualPlans = (user: UserInfo): boolean => {
  if (!user) return false;
  
  // Руководитель подразделения и начальники отделов могут создавать годовые планы
  return user.role === 'chief' || user.role === 'head';
};

// Функция для проверки прав доступа к созданию квартальных планов
export const canCreateQuarterlyPlans = (user: UserInfo, departmentId?: string | null): boolean => {
  if (!user) return false;
  
  // Руководитель подразделения может создавать квартальные планы для любого отдела
  if (user.role === 'chief') return true;
  
  // Начальники отделов могут создавать квартальные планы только для своего отдела
  if (user.role === 'head' && user.department_id === departmentId) return true;
  
  return false;
};

// Функция для проверки прав доступа к созданию недельных планов
export const canCreateWeeklyPlans = (user: UserInfo, departmentId?: string | null): boolean => {
  if (!user) return false;
  
  // Руководитель подразделения может создавать недельные планы для любого отдела
  if (user.role === 'chief') return true;
  
  // Начальники отделов могут создавать недельные планы только для своего отдела
  if (user.role === 'head' && user.department_id === departmentId) return true;
  
  return false;
};
