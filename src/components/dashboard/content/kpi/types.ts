export interface Process {
  process_id: string;
  process_name: string;
}

export interface Department {
  department_id: string;
  department_name: string;
  department_code: string;
}

// Строгие типы для представления v_kpi_current
export interface VKPICurrent {
  metric_id: string;
  metric_name: string;
  metric_description: string | null;
  metric_category: 'process' | 'department' | 'employee' | 'company';
  target_value: number;
  entity_id: string;
  entity_type: 'process' | 'department' | 'employee' | 'company';
  actual_value: number;
  period_start: string; // ISO date string
  period_end: string;   // ISO date string
  entity_name: string;
  change_value: number | null;
}

// Алиас для обратной совместимости
export type KPIData = VKPICurrent;

export interface KPIMetric {
  metric_id: string;
  metric_name: string;
  metric_description: string;
  metric_category: 'process' | 'department' | 'employee' | 'company';
  target_value: number;
  entity_id: string;
  entity_type: 'process' | 'department' | 'employee' | 'company';
  actual_value: number;
  period_start: string;
  period_end: string;
  entity_name: string;
  change_value: number | null;
}

export interface Period {
  label: string;
  start: string;
  end: string;
}

// Типы для статусов KPI
export type KPIStatus = 'excellent' | 'good' | 'warning' | 'critical';

// Категория заходу (Measure)
export type MeasureCategory = 'strategic' | 'process' | 'operational';

// Интерфейс для заходу (Measure)
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
  // Joined/computed fields
  process_name?: string;
  actual_value?: number;
  plans_count?: number;
  total_hours?: number;
  completion_percentage?: number;
}

// Интерфейс для конфигурации цветов KPI
export interface KPIColorConfig {
  excellent: string;
  good: string;
  warning: string;
  critical: string;
}
