// === Legacy types (v_kpi_current) — kept for backward compat ===

export interface VKPICurrent {
  metric_id: string;
  metric_name: string;
  metric_description: string | null;
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

export type KPIData = VKPICurrent;

export type KPIStatus = 'exceeds' | 'good' | 'warning' | 'critical';

export type MeasureCategory = 'strategic' | 'process' | 'operational';

// Legacy types used by kpiUtils.ts
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

export interface Measure {
  measure_id: string;
  process_id: string | null;
  name: string;
  description?: string;
  service_name?: string;
  service_prompt?: string;
  category: MeasureCategory;
  target_value: number;
  target_period: 'year' | 'quarter' | 'month';
  is_active: boolean;
  created_at?: string;
  process_name?: string;
  actual_value?: number;
  plans_count?: number;
  total_hours?: number;
  completion_percentage?: number;
}

export interface KPIColorConfig {
  excellent: string;
  good: string;
  warning: string;
  critical: string;
}

// === New KPI types ===

export type KPIPeriodType = 'month' | 'quarter' | 'year';

export interface KPIMetricRow {
  id: string;
  name: string;
  departmentName: string;
  planned: number;
  actual: number;
  kpi: number;
  bench?: number;
}

export interface KPIPlanRow {
  planId: string;
  measureName: string;
  processName: string;
  month: number;
  planned: number;
  actual: number;
  kpi: number;
  assigneeCount: number;
}

export interface KPITrendPoint {
  period: number; // month (1-12) or quarter (1-4)
  planned: number;
  actual: number;
  kpi: number;
}

export interface KPIResponse {
  period: { year: number; type: KPIPeriodType; value?: number };
  role: 'chief' | 'head' | 'employee';
  norm: number;

  overall: { planned: number; actual: number; kpi: number };

  byProcess: KPIMetricRow[];

  byEmployee?: KPIMetricRow[];

  byDepartment?: KPIMetricRow[];

  byQuarter?: KPITrendPoint[];

  myPlans?: KPIPlanRow[];

  monthTrend?: KPITrendPoint[];

  quarterTrend?: KPITrendPoint[];
}
