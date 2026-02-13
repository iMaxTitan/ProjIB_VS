export type MonthProcessItem = {
  key: string;
  processId: string;
  processName: string;
  scopeId: string;
  scopeName: string;
  activeCount: number;
  completedCount: number;
  tasksCount: number;
  totalHours: number;
};

export type MonthPeriodItem = {
  key: string;
  year: number;
  month: number;
  tasksCount: number;
  totalHours: number;
};

export type QuarterlyReportItem = {
  quarterly_id: string;
  annual_plan_id: string;
  quarter: number;
  year: number | null;
  department_name: string;
  goal: string;
  expected_result: string;
  status: string;
  process_name: string;
  note: string;
  completion_percentage: number;
  planned_hours_total: number;
  spent_hours_total: number;
};

export type QuarterlyReportGroup = {
  key: string;
  quarter: number;
  year: number;
  plans: QuarterlyReportItem[];
  departments: string[];
  plannedHours: number;
  spentHours: number;
  completionPercentage: number;
};
