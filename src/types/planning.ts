import { UserInfo } from './azure';
import { UserRole, UserStatus } from './supabase';

// РўРёРїС‹ РїР»Р°РЅРѕРІ (РёРµСЂР°СЂС…РёСЏ)
export type PlanType = 'annual' | 'quarterly' | 'monthly';

// РРЅС‚РµСЂС„РµР№СЃ СѓСЃР»СѓРіРё (legacy/compatibility)
export interface Service {
  service_id: string;
  process_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  process_name?: string;
}

// РљР°С‚РµРіРѕСЂРёСЏ РјРµСЂРѕРїСЂРёСЏС‚РёСЏ (Measure)
export type MeasureCategory = 'strategic' | 'process' | 'operational';

// РРЅС‚РµСЂС„РµР№СЃ РјРµСЂРѕРїСЂРёСЏС‚РёСЏ (Measure)
export interface Measure {
  measure_id: string;
  process_id: string | null;
  name: string;
  description?: string;
  category: MeasureCategory;
  target_value: number;
  target_period: 'year' | 'quarter' | 'month';
  is_active: boolean;
  created_at?: string;
  // Joined fields
  process_name?: string;
}

// РРЅС‚РµСЂС„РµР№СЃ РјРµСЃСЏС‡РЅРѕРіРѕ РїР»Р°РЅР°
export interface MonthlyPlan {
  monthly_plan_id: string;
  quarterly_id: string | null;
  measure_id: string | null;
  year: number;
  month: number; // 1-12
  month_number?: number; // Alias РґР»СЏ month РІ AI-РєРѕРЅС‚РµРєСЃС‚Рµ
  description?: string;
  status: PlanStatus;
  planned_hours: number;
  distribution_type?: string; // РўРёРї СЂР°СЃРїСЂРµРґРµР»РµРЅРёСЏ РїРѕ РєРѕРјРїР°РЅРёСЏРј
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
  // Hierarchy - joined plans
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

// РРЅС‚РµСЂС„РµР№СЃ РЅР°Р·РЅР°С‡РµРЅРёСЏ РјРµСЃСЏС‡РЅРѕРіРѕ РїР»Р°РЅР°
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

// РРЅС‚РµСЂС„РµР№СЃ РµР¶РµРґРЅРµРІРЅРѕР№ Р·Р°РґР°С‡Рё
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

// РўРёРїС‹ СЃС‚Р°С‚СѓСЃРѕРІ РїР»Р°РЅРѕРІ
export type PlanStatus = 'draft' | 'submitted' | 'approved' | 'active' | 'completed' | 'failed' | 'returned';

// РРЅС‚РµСЂС„РµР№СЃ СЃС‚Р°С‚СѓСЃР° РїР»Р°РЅР° СЃ РјРµС‚Р°РґР°РЅРЅС‹РјРё
export interface PlanStatusInfo {
  value: PlanStatus;
  label: string;
  color: string;
}

// Р•РґРёРЅС‹Р№ РёСЃС‚РѕС‡РЅРёРє СЃС‚Р°С‚СѓСЃРѕРІ Рё С†РІРµС‚РѕРІ (СЃРј. docs/BUSINESS_REQUIREMENTS.md 7.2)
export const PLAN_STATUSES: PlanStatusInfo[] = [
  { value: 'draft', label: 'Черновик', color: 'gray' },
  { value: 'submitted', label: 'На рассмотрении', color: 'blue' },
  { value: 'approved', label: 'Утвержден', color: 'emerald' },
  { value: 'active', label: 'В работе', color: 'violet' },
  { value: 'completed', label: 'Выполнен', color: 'green' },
  { value: 'failed', label: 'Не выполнен', color: 'red' },
  { value: 'returned', label: 'Возвращен', color: 'amber' }
];

// РЈРїСЂРѕС‰РµРЅРЅС‹Рµ СЃС‚Р°С‚СѓСЃС‹ РґР»СЏ РјРµСЃСЏС‡РЅС‹С… РїР»Р°РЅРѕРІ
export const MONTHLY_PLAN_STATUSES: PlanStatusInfo[] = [
  { value: 'draft', label: 'Черновик', color: 'gray' },
  { value: 'active', label: 'В работе', color: 'violet' },
  { value: 'completed', label: 'Выполнен', color: 'green' },
  { value: 'failed', label: 'Не выполнен', color: 'red' }
];

// РџРѕРґРјРЅРѕР¶РµСЃС‚РІРѕ СЃС‚Р°С‚СѓСЃРѕРІ РґР»СЏ MonthlyPlan
export type MonthlyPlanStatus = 'draft' | 'active' | 'completed' | 'failed';

// РРЅС‚РµСЂС„РµР№СЃ РіРѕРґРѕРІРѕРіРѕ РїР»Р°РЅР°
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

// РРЅС‚РµСЂС„РµР№СЃ РїСЂРѕС†РµСЃСЃР°
export interface Process {
  process_id: string;
  process_name: string;
}

// РРЅС‚РµСЂС„РµР№СЃ РєРІР°СЂС‚Р°Р»СЊРЅРѕРіРѕ РїР»Р°РЅР°
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
}

// РРЅС‚РµСЂС„РµР№СЃ Р°РєС‚РёРІРЅРѕСЃС‚Рё
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

// РўРёРїС‹ С„РёР»СЊС‚СЂРѕРІ
export type PlanFilterType = 'status' | 'department' | 'year' | 'quarter';

// РРЅС‚РµСЂС„РµР№СЃ С„РёР»СЊС‚СЂР° РїР»Р°РЅРѕРІ
export interface PlanFilter {
  type: PlanFilterType;
  value: string | number;
}

// РўРµРєСЃС‚ СЃС‚Р°С‚СѓСЃР° РїР»Р°РЅР°
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

// Р¦РІРµС‚ СЃС‚Р°С‚СѓСЃР° СЃРѕРіР»Р°СЃРЅРѕ docs/BUSINESS_REQUIREMENTS.md 7.2
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

// Р“СЂР°РґРёРµРЅС‚ РґР»СЏ СЃС‚Р°С‚СѓСЃР° РїР»Р°РЅР°
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

// РџСЂР°РІР° СѓРїСЂР°РІР»РµРЅРёСЏ РїР»Р°РЅР°РјРё
export const canManagePlans = (user: UserInfo, planDepartmentId?: string | null): boolean => {
  if (!user) return false;
  if (user.role === 'chief') return true;
  if (user.role === 'head' && user.department_id === planDepartmentId) return true;
  return false;
};

// РџСЂР°РІР° СЃРѕР·РґР°РЅРёСЏ РіРѕРґРѕРІС‹С… РїР»Р°РЅРѕРІ
export const canCreateAnnualPlans = (user: UserInfo): boolean => {
  if (!user) return false;
  return user.role === 'chief' || user.role === 'head';
};

// РџСЂР°РІР° СЃРѕР·РґР°РЅРёСЏ РєРІР°СЂС‚Р°Р»СЊРЅС‹С… РїР»Р°РЅРѕРІ
export const canCreateQuarterlyPlans = (user: UserInfo, departmentId?: string | null): boolean => {
  if (!user) return false;
  if (user.role === 'chief') return true;
  if (user.role === 'head' && user.department_id === departmentId) return true;
  return false;
};

// РџСЂР°РІР° СЃРѕР·РґР°РЅРёСЏ РјРµСЃСЏС‡РЅС‹С… РїР»Р°РЅРѕРІ
export const canCreateMonthlyPlans = (user: UserInfo, departmentId?: string | null): boolean => {
  if (!user) return false;
  if (user.role === 'chief') return true;
  if (user.role === 'head' && user.department_id === departmentId) return true;
  return false;
};

// РќР°Р·РІР°РЅРёСЏ РјРµСЃСЏС†РµРІ РЅР° СѓРєСЂР°РёРЅСЃРєРѕРј
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

// РџРѕР»СѓС‡РёС‚СЊ РЅР°Р·РІР°РЅРёРµ РјРµСЃСЏС†Р°
export const getMonthName = (month: number, lang: 'uk' | 'ru' = 'ru'): string => {
  const names = lang === 'uk' ? MONTH_NAMES_UK : MONTH_NAMES_RU;
  return names[month - 1] || '';
};

// Р¤РѕСЂРјР°С‚РёСЂРѕРІР°С‚СЊ РјРµСЃСЏС† Рё РіРѕРґ
export const formatMonthYear = (month: number, year: number, lang: 'uk' | 'ru' = 'ru'): string => {
  return `${getMonthName(month, lang)} ${year}`;
};

