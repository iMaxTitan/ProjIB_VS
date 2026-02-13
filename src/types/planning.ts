import { UserInfo } from './azure';
import { UserRole, UserStatus } from './supabase';

// Типы планов (иерархия)
export type PlanType = 'annual' | 'quarterly' | 'monthly';

// Категория мероприятия (Measure)
export type MeasureCategory = 'strategic' | 'process' | 'operational';

// Интерфейс мероприятия (Measure)
export interface Measure {
  measure_id: string;
  process_id: string | null;
  name: string;
  description?: string;
  service_name?: string;
  category: MeasureCategory;
  target_value: number;
  target_period: 'year' | 'quarter' | 'month';
  is_active: boolean;
  created_at?: string;
  // Joined fields
  process_name?: string;
}

// Интерфейс месячного плана
export interface MonthlyPlan {
  monthly_plan_id: string;
  quarterly_id: string | null;
  measure_id: string | null;
  year: number;
  month: number; // 1-12
  month_number?: number; // Alias для month в AI-контексте
  description?: string;
  status: PlanStatus;
  planned_hours: number;
  distribution_type?: string; // Тип распределения по компаниям
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  // Joined fields
  measure_name?: string;
  process_id?: string;
  process_name?: string;
  department_id?: string;
  department_name?: string;
  quarter?: number;
  assignees_count?: number;
  total_spent_hours?: number;
  tasks_count?: number;
  completion_percentage?: number;
  // Иерархия - связанные планы
  annual_plan?: {
    goal: string;
    expected_result?: string;
    year: number;
  };
  quarterly_plan?: {
    goal: string;
    expected_result?: string;
    quarter: number;
  };
}

// Интерфейс назначения месячного плана
export interface MonthlyPlanAssignee {
  monthly_plan_id: string;
  user_id: string;
  assigned_at?: string;
  // Joined fields
  full_name?: string;
  email?: string;
  photo_url?: string;
  role?: UserRole;
  user_status?: UserStatus;
  department_id?: string;
  department_name?: string;
}

// Интерфейс ежедневной задачи
export interface DailyTask {
  daily_task_id: string;
  monthly_plan_id: string;
  user_id: string;
  task_date: string; // YYYY-MM-DD
  description: string;
  spent_hours: number;
  attachment_url?: string;
  document_number?: string;
  created_at?: string;
  // Joined fields
  user_name?: string;
  user_email?: string;
  user_photo?: string;
}

// Типы статусов планов
export type PlanStatus = 'draft' | 'submitted' | 'approved' | 'active' | 'completed' | 'failed' | 'returned';

// Интерфейс статуса плана с метаданными
export interface PlanStatusInfo {
  value: PlanStatus;
  label: string;
  color: string;
}

// Единый источник статусов и цветов (см. docs/BUSINESS_REQUIREMENTS.md 7.2)
export const PLAN_STATUSES: PlanStatusInfo[] = [
  { value: 'draft', label: 'Черновик', color: 'gray' },
  { value: 'submitted', label: 'На рассмотрении', color: 'blue' },
  { value: 'approved', label: 'Утвержден', color: 'emerald' },
  { value: 'active', label: 'В работе', color: 'violet' },
  { value: 'completed', label: 'Выполнен', color: 'green' },
  { value: 'failed', label: 'Не выполнен', color: 'red' },
  { value: 'returned', label: 'Возвращен', color: 'amber' }
];

// Упрощенные статусы для месячных планов
export const MONTHLY_PLAN_STATUSES: PlanStatusInfo[] = [
  { value: 'draft', label: 'Черновик', color: 'gray' },
  { value: 'active', label: 'В работе', color: 'violet' },
  { value: 'completed', label: 'Выполнен', color: 'green' },
  { value: 'failed', label: 'Не выполнен', color: 'red' }
];

// Подмножество статусов для MonthlyPlan
export type MonthlyPlanStatus = 'draft' | 'active' | 'completed' | 'failed';

// Интерфейс годового плана
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

// Интерфейс процесса
export interface Process {
  process_id: string;
  process_name: string;
}

// Интерфейс квартального плана
export interface QuarterlyPlan {
  quarterly_id: string;
  annual_plan_id: string | null;
  department_id: string | null;
  department_name?: string;
  quarter: number;
  goal: string;
  expected_result: string;
  status: PlanStatus;
  completion_percentage?: number;
  process_id?: string | null;
  process_name?: string;
  created_by?: string;
}

// Интерфейс активности
export interface Activity {
  id: string;
  user_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  timestamp: string;
  details?: Record<string, unknown>;
  created_at: string;
}

// Типы фильтров
export type PlanFilterType = 'status' | 'department' | 'year' | 'quarter';

// Интерфейс фильтра планов
export interface PlanFilter {
  type: PlanFilterType;
  value: string | number;
}

// Текст статуса плана
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

// Цвет статуса согласно docs/BUSINESS_REQUIREMENTS.md 7.2
export const getPlanStatusColor = (status: PlanStatus): string => {
  switch (status) {
    case 'draft': return 'gray';
    case 'submitted': return 'blue';
    case 'approved': return 'emerald';
    case 'active': return 'violet';
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'returned': return 'amber';
    default: return 'gray';
  }
};

// Градиент для статуса плана
export function getPlanStatusGradient(status: PlanStatus): string {
  switch (status) {
    case 'draft': return 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
    case 'submitted': return 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)';
    case 'approved': return 'linear-gradient(135deg, #34d399 0%, #10b981 100%)';
    case 'active': return 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)';
    case 'completed': return 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
    case 'failed': return 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)';
    case 'returned': return 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
    default: return 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
  }
}

// Права управления планами
export const canManagePlans = (user: UserInfo, planDepartmentId?: string | null): boolean => {
  if (!user) return false;
  if (user.role === 'chief') return true;
  if (user.role === 'head' && user.department_id === planDepartmentId) return true;
  return false;
};

// Права создания годовых планов
export const canCreateAnnualPlans = (user: UserInfo): boolean => {
  if (!user) return false;
  return user.role === 'chief' || user.role === 'head';
};

// Права создания квартальных планов
export const canCreateQuarterlyPlans = (user: UserInfo, departmentId?: string | null): boolean => {
  if (!user) return false;
  if (user.role === 'chief') return true;
  if (user.role === 'head' && user.department_id === departmentId) return true;
  return false;
};

// Права создания месячных планов
export const canCreateMonthlyPlans = (user: UserInfo, departmentId?: string | null): boolean => {
  if (!user) return false;
  if (user.role === 'chief') return true;
  if (user.role === 'head' && user.department_id === departmentId) return true;
  return false;
};

// Названия месяцев на украинском
export const MONTH_NAMES_UK: string[] = [
  'Січень', 'Лютий', 'Березень', 'Квітень',
  'Травень', 'Червень', 'Липень', 'Серпень',
  'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

// Названия месяцев на русском
export const MONTH_NAMES_RU: string[] = [
  'Январь', 'Февраль', 'Март', 'Апрель',
  'Май', 'Июнь', 'Июль', 'Август',
  'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

// Получить название месяца
export const getMonthName = (month: number, lang: 'uk' | 'ru' = 'ru'): string => {
  const names = lang === 'uk' ? MONTH_NAMES_UK : MONTH_NAMES_RU;
  return names[month - 1] || '';
};

// Форматировать месяц и год
export const formatMonthYear = (month: number, year: number, lang: 'uk' | 'ru' = 'ru'): string => {
  return `${getMonthName(month, lang)} ${year}`;
};
