// --- Pivot API types ---

export type PivotGroupBy = 'company' | 'department' | 'employee' | 'process' | 'measure' | 'category';
export type PivotTimeGrain = 'month' | 'quarter';
export type PivotMetric = 'hours' | 'tasks' | 'planned' | 'cost' | 'kpi';
export type PivotPeriodType = 'month' | 'quarter' | 'year';

export interface PivotFilters {
  company_id?: string[];
  department_id?: string[];
  user_id?: string[];
  process_id?: string[];
  measure_id?: string[];
  category?: string[];
}

export interface PivotParams {
  year: number;
  periodType: PivotPeriodType;
  periodValue?: number;
  groupBy: PivotGroupBy[];
  timeGrain: PivotTimeGrain;
  metric: PivotMetric;
  filters?: PivotFilters;
}

export interface TimeBucket {
  key: string;   // "2026-01", "2026-Q1"
  label: string; // "Янв", "Q1"
  month?: number;
  quarter?: number;
}

export interface PivotDimension {
  id: string;
  name: string;
  dimType: PivotGroupBy;
}

export interface PivotDataRow {
  dimensions: PivotDimension[];
  buckets: Record<string, number>;
  total: number;
  plannedTotal?: number;
  plannedBuckets?: Record<string, number>;
}

export interface PivotResponse {
  meta: {
    year: number;
    periodType: PivotPeriodType;
    periodValue?: number;
    groupBy: PivotGroupBy[];
    timeGrain: PivotTimeGrain;
    metric: PivotMetric;
    timeBuckets: TimeBucket[];
  };
  stats: {
    totalHours: number;
    totalTasks: number;
    plannedHours: number;
    companiesCount: number;
    employeesCount: number;
  };
  rows: PivotDataRow[];
  columnTotals: Record<string, number>;
  grandTotal: number;
}

// --- Raw DB view row ---
export interface ViewFactRow {
  monthly_plan_id: string;
  user_id: string;
  company_id: string;
  year: number;
  month: number;
  quarter: number;
  measure_id: string | null;
  company_share: number;
  distributed_hours: number;
  planned_hours_share: number;
  tasks_count: number;
  rate_per_hour: number | null;
  plan_status: string;
}
