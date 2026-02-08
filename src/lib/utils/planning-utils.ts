import { PlanStatus } from "@/types/planning";

// ============================================================
// ЕДИНАЯ КОНФИГУРАЦИЯ СТАТУСОВ ПЛАНОВ
// Согласно docs/BUSINESS_REQUIREMENTS.md 7.2
// ============================================================

export interface StatusConfig {
  text: string;           // Полный текст
  shortText: string;      // Короткий текст
  color: string;          // Базовый цвет (gray, blue, etc)
  bgClass: string;        // Класс фона (bg-gray-500)
  badgeClasses: string;   // Классы для бейджа (bg-gray-100 text-gray-600)
  gradient: string;       // CSS градиент
}

export const STATUS_CONFIG: Record<PlanStatus, StatusConfig> = {
  draft: {
    text: 'Черновик',
    shortText: 'Черновик',
    color: 'gray',
    bgClass: 'bg-gray-500',
    badgeClasses: 'bg-gray-500 text-white',
    gradient: 'linear-gradient(90deg, #9CA3AF, #6B7280)',
  },
  submitted: {
    text: 'На рассмотрении',
    shortText: 'На проверке',
    color: 'blue',
    bgClass: 'bg-blue-500',
    badgeClasses: 'bg-blue-500 text-white',
    gradient: 'linear-gradient(90deg, #60A5FA, #3B82F6)',
  },
  approved: {
    text: 'Утвержден',
    shortText: 'Утвержден',
    color: 'emerald',
    bgClass: 'bg-emerald-500',
    badgeClasses: 'bg-emerald-500 text-white',
    gradient: 'linear-gradient(90deg, #34D399, #10B981)',
  },
  active: {
    text: 'В работе',
    shortText: 'В работе',
    color: 'violet',
    bgClass: 'bg-violet-500',
    badgeClasses: 'bg-violet-500 text-white',
    gradient: 'linear-gradient(90deg, #A78BFA, #8B5CF6)',
  },
  completed: {
    text: 'Выполнен',
    shortText: 'Выполнен',
    color: 'green',
    bgClass: 'bg-green-600',
    badgeClasses: 'bg-green-600 text-white',
    gradient: 'linear-gradient(90deg, #10B981, #059669)',
  },
  failed: {
    text: 'Не выполнен',
    shortText: 'Провален',
    color: 'red',
    bgClass: 'bg-red-500',
    badgeClasses: 'bg-red-500 text-white',
    gradient: 'linear-gradient(90deg, #F87171, #EF4444)',
  },
  returned: {
    text: 'Возвращен',
    shortText: 'Возвращен',
    color: 'amber',
    bgClass: 'bg-amber-500',
    badgeClasses: 'bg-amber-500 text-white',
    gradient: 'linear-gradient(90deg, #FBBF24, #F59E0B)',
  },
};

// Удобные функции-геттеры для обратной совместимости
// getStatusText удалён — используйте getPlanStatusText из @/types/planning
// getStatusGradient удалён — используйте STATUS_CONFIG[status].gradient напрямую

export const getStatusShortText = (status: PlanStatus): string =>
  STATUS_CONFIG[status]?.shortText || '';

export const getStatusBgClass = (status: PlanStatus): string =>
  STATUS_CONFIG[status]?.bgClass || 'bg-gray-500';

// Функция получения номера недели в году
export const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Функция проверки принадлежности даты к кварталу
export const isDateInQuarter = (date: Date, quarter: number, year: number): boolean => {
  const dateYear = date.getFullYear();
  if (dateYear !== year) return false;
  const month = date.getMonth(); // 0-11
  const dateQuarter = Math.floor(month / 3) + 1;
  return dateQuarter === quarter;
};

// Получение диапазона дат недели
export const getWeekDateRange = (dateStr: string): string => {
  const weekDate = new Date(dateStr);
  const day = weekDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(weekDate);
  monday.setDate(weekDate.getDate() + diffToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return `${monday.getDate()}.${String(monday.getMonth() + 1).padStart(2, '0')} — ${friday.getDate()}.${String(friday.getMonth() + 1).padStart(2, '0')}`;
};

// Функция определения цвета точки индикатора времени
export const getTimeIndicatorColor = (
  value: number,
  current: number,
  type: 'year' | 'quarter' | 'week',
  year?: number,
  currentYear: number = new Date().getFullYear(),
  currentWeekNum: number = getWeekNumber(new Date())
): string => {
  // Для кварталов и недель учитываем год
  if (type === 'quarter' && year) {
    if (year < currentYear) return "bg-gray-400"; // прошлый год
    if (year > currentYear) return "bg-amber-400"; // будущий год
    // Текущий год - сравниваем кварталы
    if (value < current) return "bg-gray-400";
    if (value > current) return "bg-amber-400";
    return "bg-green-500";
  }
  if (type === 'week' && year) {
    // Для недель сравниваем с учётом года и квартала
    const weekYear = year;
    if (weekYear < currentYear) return "bg-gray-400";
    if (weekYear > currentYear) return "bg-amber-400";
    // Текущий год - сравниваем номера недель
    if (value < currentWeekNum) return "bg-gray-400";
    if (value > currentWeekNum) return "bg-amber-400";
    return "bg-green-500";
  }
  // Для годов
  if (value < current) return "bg-gray-400";
  if (value > current) return "bg-amber-400";
  return "bg-green-500";
};

// Получение цвета варианта статуса
export const getStatusVariant = (status: PlanStatus): 'secondary' | 'info' | 'default' | 'success' | 'destructive' | 'warning' => {
  switch (status) {
    case 'draft': return 'secondary';
    case 'submitted': return 'info';
    case 'approved': return 'default';
    case 'active': return 'success';
    case 'completed': return 'success';
    case 'failed': return 'destructive';
    case 'returned': return 'warning';
    default: return 'secondary';
  }
};

// Получение классов цветов для статуса (тайлвинд)
// Цвета согласно docs/BUSINESS_REQUIREMENTS.md 7.2:
// Draft=#6B7280(gray), Submitted=#3B82F6(blue), Approved=#10B981(emerald),
// Active=#8B5CF6(violet), Completed=#059669(green-600), Failed=#EF4444(red), Returned=#F59E0B(amber)
export const getStatusColorClasses = (status: PlanStatus): string => {
  switch (status) {
    case 'draft': return "bg-gray-500 text-white";
    case 'submitted': return "bg-blue-500 text-white";
    case 'approved': return "bg-emerald-500 text-white";
    case 'active': return "bg-violet-500 text-white";
    case 'completed': return "bg-green-600 text-white";
    case 'failed': return "bg-red-500 text-white";
    case 'returned': return "bg-amber-500 text-white";
    default: return "bg-gray-500 text-white";
  }
};
