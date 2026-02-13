/**
 * Единая дизайн-система ReportIB
 * Централизованные константы для цветов, размеров и стилей
 */

// Цветовая палитра
export const colors = {
  // Основные цвета
  primary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
  },
  
  // Статусные цвета
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
  
  // KPI статусы (план = 70% ёмкости)
  kpi: {
    exceeds: '#f59e0b',   // Amber — перегрузка (>=130% плана = ~91% ёмкости)
    good: '#10b981',      // Зелёный — норма (>=100% плана)
    warning: '#f59e0b',   // Янтарный — ниже нормы (70-99% плана)
    critical: '#ef4444',  // Красный — критично (<70% плана)
  },
  
  // Нейтральные цвета
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
} as const;

// Размеры и отступы
export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
  '3xl': '4rem',   // 64px
} as const;

// Типографика
export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['Fira Code', 'monospace'],
  },
  
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
  },
  
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

// Компоненты
export const components = {
  // Кнопки
  button: {
    primary: `
      bg-indigo-600 hover:bg-indigo-700 
      text-white font-medium 
      px-4 py-2 rounded-lg 
      transition-colors duration-200
      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
    `,
    secondary: `
      bg-gray-200 hover:bg-gray-300 
      text-gray-800 font-medium 
      px-4 py-2 rounded-lg 
      transition-colors duration-200
      focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
    `,
    danger: `
      bg-red-600 hover:bg-red-700 
      text-white font-medium 
      px-4 py-2 rounded-lg 
      transition-colors duration-200
      focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
    `,
  },
  
  // Карточки
  card: {
    base: `
      bg-white rounded-lg shadow-md 
      border border-gray-200 
      hover:shadow-lg transition-shadow duration-200
    `,
    interactive: `
      bg-white rounded-lg shadow-md 
      border border-gray-200 
      hover:shadow-xl hover:border-indigo-300 
      transition-[background-color,box-shadow,border-color] duration-200 cursor-pointer
    `,
  },
  
  // Вкладки
  tab: {
    active: `
      px-4 py-2 font-medium text-sm 
      text-indigo-600 border-b-2 border-indigo-600
    `,
    inactive: `
      px-4 py-2 font-medium text-sm 
      text-gray-500 hover:text-gray-700
      transition-colors duration-200
    `,
  },
} as const;

// Анимации
export const animations = {
  transition: {
    fast: '150ms ease-in-out',
    normal: '200ms ease-in-out',
    slow: '300ms ease-in-out',
  },
  
  bounce: 'bounce 1s infinite',
  pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  spin: 'spin 1s linear infinite',
} as const;

// KPI специфичные стили
export const kpi = {
  // Legacy: определение статуса по проценту выполнения (для v_kpi_current)
  getStatus: (actual: number, target: number): keyof typeof colors.kpi => {
    const percentage = target > 0 ? (actual / target) * 100 : 0;
    if (percentage > 70) return 'good';
    if (percentage >= 50) return 'warning';
    return 'critical';
  },

  // NEW: определение статуса по часам (план vs факт)
  // План = 70% ёмкости (норма). Пороги от % выполнения плана:
  //   >= 130% плана (~91% ёмкости) = перевыполнение (сигнал перегрузки)
  //   >= 100% плана = норма
  //   >= 70% плана  = ниже нормы
  //   < 70% плана   = критично
  getKPIStatus: (actualHours: number, plannedHours: number): keyof typeof colors.kpi => {
    if (plannedHours <= 0) return 'critical';
    const pct = (actualHours / plannedHours) * 100;
    if (pct >= 130) return 'exceeds';
    if (pct >= 100) return 'good';
    if (pct >= 70) return 'warning';
    return 'critical';
  },

  // Получение цвета по статусу
  getColor: (status: keyof typeof colors.kpi): string => colors.kpi[status],

  // Получение цвета напрямую по значениям
  getColorByValues: (actual: number, target: number): string => {
    const status = kpi.getStatus(actual, target);
    return kpi.getColor(status);
  },

  // Tailwind class по KPI статусу
  getTailwindBg: (status: keyof typeof colors.kpi): string => {
    const map: Record<string, string> = {
      exceeds: 'bg-amber-100 text-amber-800',
      good: 'bg-emerald-100 text-emerald-800',
      warning: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800',
    };
    return map[status] || map.critical;
  },

  // Лейбл статуса
  getStatusLabel: (status: keyof typeof colors.kpi): string => {
    const map: Record<string, string> = {
      exceeds: 'Перевиконання',
      good: 'Норма',
      warning: 'Нижче норми',
      critical: 'Критично',
    };
    return map[status] || 'Невідомо';
  },
} as const;

// Responsive breakpoints
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// Shadows
export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  base: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
} as const;

const designSystem = {
  colors,
  spacing,
  typography,
  components,
  animations,
  kpi,
  breakpoints,
  shadows,
};

export default designSystem;
