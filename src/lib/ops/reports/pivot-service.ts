/**
 * Pivot report — core aggregation logic.
 * Extracted from app/api/reports/pivot/route.ts
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import type {
  PivotGroupBy, PivotTimeGrain, PivotMetric, PivotPeriodType,
  PivotFilters, PivotResponse, PivotDataRow, PivotDimension, TimeBucket, ViewFactRow,
} from '@/types/pivot';

const MONTH_SHORT_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function getMonthsForPeriod(periodType: PivotPeriodType, periodValue?: number): number[] {
  if (periodType === 'month' && periodValue) return [periodValue];
  if (periodType === 'quarter' && periodValue) {
    const start = (periodValue - 1) * 3 + 1;
    return [start, start + 1, start + 2];
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function buildTimeBuckets(months: number[], year: number, timeGrain: PivotTimeGrain): TimeBucket[] {
  if (timeGrain === 'quarter') {
    const quarters = Array.from(new Set(months.map(m => Math.ceil(m / 3)))).sort((a, b) => a - b);
    return quarters.map(q => ({ key: `${year}-Q${q}`, label: `Q${q}`, quarter: q }));
  }
  return months.map(m => ({ key: `${year}-${String(m).padStart(2, '0')}`, label: MONTH_SHORT_RU[m - 1] || `${m}`, month: m }));
}

function timeBucketKey(row: ViewFactRow, year: number, timeGrain: PivotTimeGrain): string {
  if (timeGrain === 'quarter') return `${year}-Q${row.quarter}`;
  return `${year}-${String(row.month).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type ProcedureLookup = { name: string; category: string | null; process_id: string | null };
type UserLookup = { full_name: string | null; department_id: string | null };

export interface BuildPivotParams {
  year: number;
  periodType: PivotPeriodType;
  periodValue?: number;
  groupBy: PivotGroupBy[];
  timeGrain: PivotTimeGrain;
  metric: PivotMetric;
  filters: PivotFilters;
}

export async function buildPivot(db: SupabaseClient, params: BuildPivotParams): Promise<PivotResponse> {
  const { year, periodType, periodValue, groupBy, timeGrain, metric, filters } = params;
  const months = getMonthsForPeriod(periodType, periodValue);
  const timeBuckets = buildTimeBuckets(months, year, timeGrain);

  // 1. Query the view
  let query = db.from('v_plan_user_company_hours').select('*').eq('year', year).in('month', months);
  if (filters.company_id?.length) query = query.in('company_id', filters.company_id);
  if (filters.user_id?.length) query = query.in('user_id', filters.user_id);
  if (filters.procedure_id?.length) query = query.in('procedure_id', filters.procedure_id);

  const { data: rawRows, error: viewErr } = await query;
  if (viewErr) throw viewErr;
  const factRows = (rawRows || []) as unknown as ViewFactRow[];

  if (factRows.length === 0) {
    return emptyResponse(year, periodType, periodValue, groupBy, timeGrain, metric, timeBuckets);
  }

  // 2. Load lookups
  const needsProcedure = groupBy.some(g => g === 'procedure' || g === 'process' || g === 'category');
  const needsUser = groupBy.some(g => g === 'employee' || g === 'department');
  const needsCompany = groupBy.includes('company');

  const proceduresMap = new Map<string, ProcedureLookup>();
  const processNames = new Map<string, string>();
  if (needsProcedure) {
    const procedureIds = Array.from(new Set(factRows.map(r => r.procedure_id).filter(Boolean))) as string[];
    if (procedureIds.length > 0) {
      const { data: procedures } = await db.from('procedures').select('procedure_id, name, category, process_id').in('procedure_id', procedureIds);
      const typed = (procedures || []) as unknown as { procedure_id: string; name: string; category: string | null; process_id: string | null }[];
      for (const m of typed) proceduresMap.set(m.procedure_id, { name: m.name, category: m.category, process_id: m.process_id });
      const processIds = Array.from(new Set(typed.map(m => m.process_id).filter(Boolean))) as string[];
      if (processIds.length > 0) {
        const { data: procs } = await db.from('processes').select('process_id, process_name').in('process_id', processIds);
        for (const p of (procs || []) as unknown as { process_id: string; process_name: string }[]) processNames.set(p.process_id, p.process_name);
      }
    }
  }

  const usersMap = new Map<string, UserLookup>();
  const deptNames = new Map<string, string>();
  if (needsUser) {
    const userIds = Array.from(new Set(factRows.map(r => r.user_id)));
    if (userIds.length > 0) {
      const { data: users } = await db.from('user_profiles').select('user_id, full_name, department_id').in('user_id', userIds);
      for (const u of (users || []) as unknown as { user_id: string; full_name: string | null; department_id: string | null }[]) usersMap.set(u.user_id, { full_name: u.full_name, department_id: u.department_id });
    }
    const { data: depts } = await db.from('departments').select('department_id, department_name');
    for (const d of (depts || []) as unknown as { department_id: string; department_name: string }[]) deptNames.set(d.department_id, d.department_name);
  }

  const companyNames = new Map<string, string>();
  if (needsCompany) {
    const companyIds = Array.from(new Set(factRows.map(r => r.company_id)));
    if (companyIds.length > 0) {
      const { data: companies } = await db.from('companies').select('company_id, company_name').in('company_id', companyIds);
      for (const c of (companies || []) as unknown as { company_id: string; company_name: string }[]) companyNames.set(c.company_id, c.company_name);
    }
  }

  // 3. JS-side filters
  const filteredRows = factRows.filter(row => {
    if (filters.department_id?.length) {
      const user = usersMap.get(row.user_id);
      if (!user?.department_id || !filters.department_id.includes(user.department_id)) return false;
    }
    if (filters.process_id?.length) {
      const m = row.procedure_id ? proceduresMap.get(row.procedure_id) : null;
      if (!m?.process_id || !filters.process_id.includes(m.process_id)) return false;
    }
    if (filters.category?.length) {
      const m = row.procedure_id ? proceduresMap.get(row.procedure_id) : null;
      if (!filters.category.includes(m?.category || 'operational')) return false;
    }
    return true;
  });

  // 4. Dimension resolver
  const catLabels: Record<string, string> = { strategic: 'Стратегические', process: 'Процессные', operational: 'Оперативные' };
  function getDimensions(row: ViewFactRow): PivotDimension[] {
    return groupBy.map(dim => {
      switch (dim) {
        case 'company': return { id: row.company_id, name: companyNames.get(row.company_id) || 'Без названия', dimType: dim };
        case 'department': { const u = usersMap.get(row.user_id); const did = u?.department_id || 'unknown'; return { id: did, name: deptNames.get(did) || 'Без отдела', dimType: dim }; }
        case 'employee': return { id: row.user_id, name: usersMap.get(row.user_id)?.full_name || 'Неизвестно', dimType: dim };
        case 'process': { const m = row.procedure_id ? proceduresMap.get(row.procedure_id) : null; const pid = m?.process_id || 'unknown'; return { id: pid, name: processNames.get(pid) || 'Без процесса', dimType: dim }; }
        case 'procedure': return { id: row.procedure_id || 'unknown', name: proceduresMap.get(row.procedure_id || '')?.name || 'Без процедуры', dimType: dim };
        case 'category': { const m = row.procedure_id ? proceduresMap.get(row.procedure_id) : null; const cat = m?.category || 'operational'; return { id: cat, name: catLabels[cat] || cat, dimType: dim }; }
      }
    });
  }

  // 5. Aggregate
  const accumulator = new Map<string, { dims: PivotDimension[]; buckets: Map<string, { hours: number; tasks: number; planned: number; cost: number }>; total: { hours: number; tasks: number; planned: number; cost: number } }>();
  let totalHours = 0, totalTasks = 0, totalPlanned = 0;
  const uniqueCompanies = new Set<string>(), uniqueEmployees = new Set<string>();

  for (const row of filteredRows) {
    const hours = Number(row.distributed_hours) || 0;
    const tasks = Number(row.tasks_count) || 0;
    const planned = Number(row.planned_hours_share) || 0;
    const cost = hours * (Number(row.rate_per_hour) || 0);
    totalHours += hours; totalTasks += tasks; totalPlanned += planned;
    uniqueCompanies.add(row.company_id); uniqueEmployees.add(row.user_id);

    const dims = getDimensions(row);
    const gk = dims.map(d => d.id).join('::');
    const tk = timeBucketKey(row, year, timeGrain);

    let entry = accumulator.get(gk);
    if (!entry) { entry = { dims, buckets: new Map(), total: { hours: 0, tasks: 0, planned: 0, cost: 0 } }; accumulator.set(gk, entry); }
    const bucket = entry.buckets.get(tk) || { hours: 0, tasks: 0, planned: 0, cost: 0 };
    bucket.hours += hours; bucket.tasks += tasks; bucket.planned += planned; bucket.cost += cost;
    entry.buckets.set(tk, bucket);
    entry.total.hours += hours; entry.total.tasks += tasks; entry.total.planned += planned; entry.total.cost += cost;
  }

  // 6. Build response
  function pickMetric(acc: { hours: number; tasks: number; planned: number; cost: number }): number {
    switch (metric) {
      case 'hours': return round2(acc.hours);
      case 'tasks': return acc.tasks;
      case 'planned': return round2(acc.planned);
      case 'cost': return round2(acc.cost);
      case 'kpi': return acc.planned > 0 ? round2((acc.hours / acc.planned) * 100) : 0;
    }
  }

  const rows: PivotDataRow[] = [];
  const columnTotals: Record<string, number> = {};

  for (const entry of Array.from(accumulator.values())) {
    const bucketsRecord: Record<string, number> = {};
    const plannedBuckets: Record<string, number> = {};
    for (const tb of timeBuckets) {
      const b = entry.buckets.get(tb.key) || { hours: 0, tasks: 0, planned: 0, cost: 0 };
      bucketsRecord[tb.key] = pickMetric(b);
      plannedBuckets[tb.key] = round2(b.planned);
      columnTotals[tb.key] = (columnTotals[tb.key] || 0) + pickMetric(b);
    }
    rows.push({ dimensions: entry.dims, buckets: bucketsRecord, total: pickMetric(entry.total), plannedTotal: round2(entry.total.planned), plannedBuckets: metric === 'kpi' ? plannedBuckets : undefined });
  }

  rows.sort((a, b) => b.total - a.total);
  for (const key of Object.keys(columnTotals)) columnTotals[key] = round2(columnTotals[key]);

  return {
    meta: { year, periodType, periodValue, groupBy, timeGrain, metric, timeBuckets },
    stats: { totalHours: round2(totalHours), totalTasks, plannedHours: round2(totalPlanned), companiesCount: uniqueCompanies.size, employeesCount: uniqueEmployees.size },
    rows, columnTotals, grandTotal: round2(rows.reduce((s, r) => s + r.total, 0)),
  };
}

function emptyResponse(
  year: number, periodType: PivotPeriodType, periodValue: number | undefined,
  groupBy: PivotGroupBy[], timeGrain: PivotTimeGrain, metric: PivotMetric, timeBuckets: TimeBucket[],
): PivotResponse {
  return {
    meta: { year, periodType, periodValue, groupBy, timeGrain, metric, timeBuckets },
    stats: { totalHours: 0, totalTasks: 0, plannedHours: 0, companiesCount: 0, employeesCount: 0 },
    rows: [], columnTotals: {}, grandTotal: 0,
  };
}
