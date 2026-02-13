/**
 * Dynamic Pivot Report API
 * GET /api/reports/pivot?year=2026&groupBy=company&timeGrain=month&metric=hours
 *
 * Replaces /api/reports/summary with flexible multi-dimensional aggregation.
 * Uses v_plan_user_company_hours view (pre-computed company share distribution).
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/api/request-guards';
import type {
  PivotGroupBy, PivotTimeGrain, PivotMetric, PivotPeriodType,
  PivotFilters, PivotResponse, PivotDataRow, PivotDimension, TimeBucket, ViewFactRow,
} from '@/types/pivot';

// --- DB singleton (service-role) ---

let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  _db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  return _db;
}

// --- Rate limit ---

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

// --- Constants ---

const VALID_GROUP_BY: PivotGroupBy[] = ['company', 'department', 'employee', 'process', 'measure', 'category'];
const VALID_TIME_GRAIN: PivotTimeGrain[] = ['month', 'quarter'];
const VALID_METRIC: PivotMetric[] = ['hours', 'tasks', 'planned', 'cost', 'kpi'];
const VALID_PERIOD_TYPE: PivotPeriodType[] = ['month', 'quarter', 'year'];

const MONTH_SHORT_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

// --- Helpers ---

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
    return quarters.map(q => ({
      key: `${year}-Q${q}`,
      label: `Q${q}`,
      quarter: q,
    }));
  }
  return months.map(m => ({
    key: `${year}-${String(m).padStart(2, '0')}`,
    label: MONTH_SHORT_RU[m - 1] || `${m}`,
    month: m,
  }));
}

function timeBucketKey(row: ViewFactRow, year: number, timeGrain: PivotTimeGrain): string {
  if (timeGrain === 'quarter') return `${year}-Q${row.quarter}`;
  return `${year}-${String(row.month).padStart(2, '0')}`;
}

// --- Lookup types ---

type MeasureLookup = { name: string; category: string | null; process_id: string | null };
type UserLookup = { full_name: string | null; department_id: string | null };

// --- Main handler ---

export async function GET(req: NextRequest) {
  // Auth
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  // Rate limit
  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const db = getDb();

  // Role check (chief / head only)
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!profile || (profile.role !== 'chief' && profile.role !== 'head')) {
    return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
  }

  // Parse params
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
  const periodType = (url.searchParams.get('periodType') || 'year') as PivotPeriodType;
  const periodValue = url.searchParams.get('periodValue') ? Number(url.searchParams.get('periodValue')) : undefined;
  const groupByRaw = url.searchParams.get('groupBy') || 'company';
  const timeGrain = (url.searchParams.get('timeGrain') || 'month') as PivotTimeGrain;
  const metric = (url.searchParams.get('metric') || 'hours') as PivotMetric;
  const filtersRaw = url.searchParams.get('filters');

  // Validate
  if (year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }
  if (!VALID_PERIOD_TYPE.includes(periodType)) {
    return NextResponse.json({ error: 'Invalid periodType' }, { status: 400 });
  }
  if (periodType === 'month' && (periodValue === undefined || periodValue < 1 || periodValue > 12)) {
    return NextResponse.json({ error: 'Invalid month value' }, { status: 400 });
  }
  if (periodType === 'quarter' && (periodValue === undefined || periodValue < 1 || periodValue > 4)) {
    return NextResponse.json({ error: 'Invalid quarter value' }, { status: 400 });
  }
  if (!VALID_TIME_GRAIN.includes(timeGrain)) {
    return NextResponse.json({ error: 'Invalid timeGrain' }, { status: 400 });
  }
  if (!VALID_METRIC.includes(metric)) {
    return NextResponse.json({ error: 'Invalid metric' }, { status: 400 });
  }

  const groupBy = groupByRaw.split(',').map(s => s.trim()).filter(s => VALID_GROUP_BY.includes(s as PivotGroupBy)) as PivotGroupBy[];
  if (groupBy.length === 0) {
    return NextResponse.json({ error: 'Invalid groupBy' }, { status: 400 });
  }

  let filters: PivotFilters = {};
  if (filtersRaw) {
    try {
      filters = JSON.parse(filtersRaw) as PivotFilters;
    } catch {
      return NextResponse.json({ error: 'Invalid filters JSON' }, { status: 400 });
    }
  }

  try {
    const result = await buildPivot(db, { year, periodType, periodValue, groupBy, timeGrain, metric, filters });
    return NextResponse.json(result);
  } catch (err) {
    logger.error('[Pivot API] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// --- Core aggregation ---

async function buildPivot(
  db: ReturnType<typeof createClient>,
  params: {
    year: number;
    periodType: PivotPeriodType;
    periodValue?: number;
    groupBy: PivotGroupBy[];
    timeGrain: PivotTimeGrain;
    metric: PivotMetric;
    filters: PivotFilters;
  },
): Promise<PivotResponse> {
  const { year, periodType, periodValue, groupBy, timeGrain, metric, filters } = params;
  const months = getMonthsForPeriod(periodType, periodValue);
  const timeBuckets = buildTimeBuckets(months, year, timeGrain);

  // 1. Query the view
  let query = db
    .from('v_plan_user_company_hours')
    .select('*')
    .eq('year', year)
    .in('month', months);

  // Apply view-level filters
  if (filters.company_id?.length) query = query.in('company_id', filters.company_id);
  if (filters.user_id?.length) query = query.in('user_id', filters.user_id);
  if (filters.measure_id?.length) query = query.in('measure_id', filters.measure_id);

  const { data: rawRows, error: viewErr } = await query;
  if (viewErr) throw viewErr;

  const factRows = (rawRows || []) as unknown as ViewFactRow[];

  if (factRows.length === 0) {
    return emptyResponse(year, periodType, periodValue, groupBy, timeGrain, metric, timeBuckets);
  }

  // 2. Load lookup data (only what's needed by groupBy)
  const needsMeasure = groupBy.some(g => g === 'measure' || g === 'process' || g === 'category');
  const needsUser = groupBy.some(g => g === 'employee' || g === 'department');
  const needsCompany = groupBy.includes('company');

  // Measures → processes
  const measuresMap = new Map<string, MeasureLookup>();
  const processNames = new Map<string, string>();
  if (needsMeasure) {
    const measureIds = Array.from(new Set(factRows.map(r => r.measure_id).filter(Boolean))) as string[];
    if (measureIds.length > 0) {
      const { data: measures } = await db
        .from('measures')
        .select('measure_id, name, category, process_id')
        .in('measure_id', measureIds);
      const typedMeasures = (measures || []) as unknown as { measure_id: string; name: string; category: string | null; process_id: string | null }[];
      for (const m of typedMeasures) {
        measuresMap.set(m.measure_id, { name: m.name, category: m.category, process_id: m.process_id });
      }
      // Load process names
      const processIds = Array.from(new Set(typedMeasures.map(m => m.process_id).filter(Boolean))) as string[];
      if (processIds.length > 0) {
        const { data: procs } = await db
          .from('processes')
          .select('process_id, process_name')
          .in('process_id', processIds);
        const typedProcs = (procs || []) as unknown as { process_id: string; process_name: string }[];
        for (const p of typedProcs) processNames.set(p.process_id, p.process_name);
      }
    }
  }

  // Users → departments
  const usersMap = new Map<string, UserLookup>();
  const deptNames = new Map<string, string>();
  if (needsUser) {
    const userIds = Array.from(new Set(factRows.map(r => r.user_id)));
    if (userIds.length > 0) {
      const { data: users } = await db
        .from('user_profiles')
        .select('user_id, full_name, department_id')
        .in('user_id', userIds);
      const typedUsers = (users || []) as unknown as { user_id: string; full_name: string | null; department_id: string | null }[];
      for (const u of typedUsers) usersMap.set(u.user_id, { full_name: u.full_name, department_id: u.department_id });
    }
    const { data: depts } = await db.from('departments').select('department_id, department_name');
    const typedDepts = (depts || []) as unknown as { department_id: string; department_name: string }[];
    for (const d of typedDepts) deptNames.set(d.department_id, d.department_name);
  }

  // Companies
  const companyNames = new Map<string, string>();
  if (needsCompany) {
    const companyIds = Array.from(new Set(factRows.map(r => r.company_id)));
    if (companyIds.length > 0) {
      const { data: companies } = await db
        .from('companies')
        .select('company_id, company_name')
        .in('company_id', companyIds);
      const typedCompanies = (companies || []) as unknown as { company_id: string; company_name: string }[];
      for (const c of typedCompanies) companyNames.set(c.company_id, c.company_name);
    }
  }

  // 3. Apply JS-side filters (department, process, category — not in view)
  const filteredRows = factRows.filter(row => {
    if (filters.department_id?.length) {
      const user = usersMap.get(row.user_id);
      if (!user?.department_id || !filters.department_id.includes(user.department_id)) return false;
    }
    if (filters.process_id?.length) {
      const m = row.measure_id ? measuresMap.get(row.measure_id) : null;
      if (!m?.process_id || !filters.process_id.includes(m.process_id)) return false;
    }
    if (filters.category?.length) {
      const m = row.measure_id ? measuresMap.get(row.measure_id) : null;
      const cat = m?.category || 'operational';
      if (!filters.category.includes(cat)) return false;
    }
    return true;
  });

  // 4. Build dimension key resolver
  function getDimensions(row: ViewFactRow): PivotDimension[] {
    return groupBy.map(dim => {
      switch (dim) {
        case 'company':
          return { id: row.company_id, name: companyNames.get(row.company_id) || 'Без названия', dimType: dim };
        case 'department': {
          const user = usersMap.get(row.user_id);
          const deptId = user?.department_id || 'unknown';
          return { id: deptId, name: deptNames.get(deptId) || 'Без отдела', dimType: dim };
        }
        case 'employee':
          return { id: row.user_id, name: usersMap.get(row.user_id)?.full_name || 'Неизвестно', dimType: dim };
        case 'process': {
          const m = row.measure_id ? measuresMap.get(row.measure_id) : null;
          const pid = m?.process_id || 'unknown';
          return { id: pid, name: processNames.get(pid) || 'Без процесса', dimType: dim };
        }
        case 'measure':
          return { id: row.measure_id || 'unknown', name: measuresMap.get(row.measure_id || '')?.name || 'Без мероприятия', dimType: dim };
        case 'category': {
          const m = row.measure_id ? measuresMap.get(row.measure_id) : null;
          const cat = m?.category || 'operational';
          const catNames: Record<string, string> = { strategic: 'Стратегические', process: 'Процессные', operational: 'Оперативные' };
          return { id: cat, name: catNames[cat] || cat, dimType: dim };
        }
      }
    });
  }

  function groupKey(dims: PivotDimension[]): string {
    return dims.map(d => d.id).join('::');
  }

  // 5. Aggregate
  const accumulator = new Map<string, {
    dims: PivotDimension[];
    buckets: Map<string, { hours: number; tasks: number; planned: number; cost: number }>;
    total: { hours: number; tasks: number; planned: number; cost: number };
  }>();

  // Stats
  let totalHours = 0;
  let totalTasks = 0;
  let totalPlanned = 0;
  const uniqueCompanies = new Set<string>();
  const uniqueEmployees = new Set<string>();

  for (const row of filteredRows) {
    const hours = Number(row.distributed_hours) || 0;
    const tasks = Number(row.tasks_count) || 0;
    const planned = Number(row.planned_hours_share) || 0;
    const rate = Number(row.rate_per_hour) || 0;
    const cost = hours * rate;

    totalHours += hours;
    totalTasks += tasks;
    totalPlanned += planned;
    uniqueCompanies.add(row.company_id);
    uniqueEmployees.add(row.user_id);

    const dims = getDimensions(row);
    const gk = groupKey(dims);
    const tk = timeBucketKey(row, year, timeGrain);

    let entry = accumulator.get(gk);
    if (!entry) {
      entry = {
        dims,
        buckets: new Map(),
        total: { hours: 0, tasks: 0, planned: 0, cost: 0 },
      };
      accumulator.set(gk, entry);
    }

    const bucket = entry.buckets.get(tk) || { hours: 0, tasks: 0, planned: 0, cost: 0 };
    bucket.hours += hours;
    bucket.tasks += tasks;
    bucket.planned += planned;
    bucket.cost += cost;
    entry.buckets.set(tk, bucket);

    entry.total.hours += hours;
    entry.total.tasks += tasks;
    entry.total.planned += planned;
    entry.total.cost += cost;
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

    rows.push({
      dimensions: entry.dims,
      buckets: bucketsRecord,
      total: pickMetric(entry.total),
      plannedTotal: round2(entry.total.planned),
      plannedBuckets: metric === 'kpi' ? plannedBuckets : undefined,
    });
  }

  // Sort by total descending
  rows.sort((a, b) => b.total - a.total);

  // Round column totals
  for (const key of Object.keys(columnTotals)) {
    columnTotals[key] = round2(columnTotals[key]);
  }

  const grandTotal = round2(rows.reduce((s, r) => s + r.total, 0));

  return {
    meta: {
      year,
      periodType,
      periodValue,
      groupBy,
      timeGrain,
      metric,
      timeBuckets,
    },
    stats: {
      totalHours: round2(totalHours),
      totalTasks,
      plannedHours: round2(totalPlanned),
      companiesCount: uniqueCompanies.size,
      employeesCount: uniqueEmployees.size,
    },
    rows,
    columnTotals,
    grandTotal,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyResponse(
  year: number,
  periodType: PivotPeriodType,
  periodValue: number | undefined,
  groupBy: PivotGroupBy[],
  timeGrain: PivotTimeGrain,
  metric: PivotMetric,
  timeBuckets: TimeBucket[],
): PivotResponse {
  return {
    meta: { year, periodType, periodValue, groupBy, timeGrain, metric, timeBuckets },
    stats: { totalHours: 0, totalTasks: 0, plannedHours: 0, companiesCount: 0, employeesCount: 0 },
    rows: [],
    columnTotals: {},
    grandTotal: 0,
  };
}
