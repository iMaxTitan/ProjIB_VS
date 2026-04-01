/**
 * Absences — read operations.
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import type { AbsenceRow, AbsenceType, YearlyQuota, TeamAbsencesResult, TeamVacationRow } from './absences.types';
import { SELECT_COLS } from './absences.types';
import { getMonthsInRange, stripJoin } from './absences.helpers';

export async function getMyAbsences(
  db: SupabaseClient, userId: string, year: number,
): Promise<AbsenceRow[]> {
  const [{ data, error }, { data: timesheets }] = await Promise.all([
    db.from('planned_absences').select(SELECT_COLS).eq('user_id', userId).eq('year', year).order('start_date'),
    db.from('employee_timesheet').select('year, month').eq('user_id', userId).eq('year', year),
  ]);
  if (error) throw error;

  const tsSet = new Set((timesheets || []).map(t => `${t.year}-${t.month}`));
  return (data || []).map(row => {
    const r = row as AbsenceRow;
    let editable = r.status === 'pending' || r.status === 'approved';
    if (editable && r.start_date && r.end_date) {
      const months = getMonthsInRange(new Date(r.start_date), new Date(r.end_date));
      if (months.some(m => tsSet.has(`${m.year}-${m.month}`))) editable = false;
    }
    return { ...r, editable };
  });
}

export async function getPendingApprovals(
  db: SupabaseClient, approverId: string,
): Promise<AbsenceRow[]> {
  const { data: approver } = await db.from('user_profiles').select('role, department_id').eq('user_id', approverId).single();
  if (!approver) return [];
  const { role, department_id } = approver;
  if (role !== 'chief' && role !== 'head') return [];

  const { data, error } = await db
    .from('planned_absences')
    .select(`${SELECT_COLS}, user_profiles!planned_absences_user_id_fkey(full_name, department_id, role)`)
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw error;

  const rows = (data || []).map((r: Record<string, unknown>) => {
    const profile = r.user_profiles as { full_name: string; department_id: string | null; role: string } | null;
    return {
      ...stripJoin(r),
      full_name: profile?.full_name ?? '',
      department_id: profile?.department_id ?? null,
      _targetRole: profile?.role ?? '',
    } as AbsenceRow & { _targetRole: string };
  });

  if (role === 'head') {
    return rows.filter(r => r.department_id === department_id && r._targetRole !== 'head' && r._targetRole !== 'chief');
  }
  return rows;
}

export async function getYearlyQuota(
  db: SupabaseClient, userId: string, year: number,
): Promise<YearlyQuota> {
  const { data, error } = await db
    .from('planned_absences')
    .select('absence_type, calendar_days, status')
    .eq('user_id', userId).eq('year', year)
    .in('status', ['pending', 'approved']);
  if (error) throw error;

  let used14d = 0, used10d = 0, used5d = 0, totalDays = 0;
  for (const row of data || []) {
    if (row.absence_type === '14d') used14d++;
    else if (row.absence_type === '10d') used10d++;
    else used5d++;
    totalDays += (row.calendar_days as number) || 0;
  }
  return { used14d, used10d, used5d, totalDays };
}

export async function getTeamAbsences(
  db: SupabaseClient, requesterId: string, year: number,
): Promise<TeamAbsencesResult> {
  const { data: requester } = await db.from('user_profiles').select('role, department_id').eq('user_id', requesterId).single();
  if (!requester) throw new Error('Профіль не знайдено');

  const requesterRole = requester.role as string;
  const isPastYear = year < new Date().getFullYear();

  let empQuery = db.from('user_profiles')
    .select('user_id, full_name, department_id, role, status')
    .neq('role', 'kb_user').order('full_name');

  if (requesterRole === 'head') {
    empQuery = empQuery.or(`department_id.eq.${requester.department_id},role.eq.head,role.eq.chief`);
  } else if (requesterRole !== 'chief') {
    if (requester.department_id) empQuery = empQuery.eq('department_id', requester.department_id);
  }

  const [{ data: employees, error: empErr }, timesheetResult, absencesResult] = await Promise.all([
    empQuery,
    db.from('employee_timesheet').select('user_id, month').eq('year', year),
    db.from('planned_absences').select(SELECT_COLS)
      .in('status', ['approved', 'pending'])
      .lte('start_date', `${year}-12-31`).gte('end_date', `${year}-01-01`),
  ]);
  if (empErr) throw empErr;
  if (absencesResult.error) throw absencesResult.error;

  const usersWithAbsences = new Set<string>();
  for (const r of absencesResult.data || []) usersWithAbsences.add(r.user_id as string);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timesheetUsers = isPastYear ? new Set(((timesheetResult.data || []) as any[]).map(t => t.user_id as string)) : null;

  const timesheetMonths = new Map<string, Set<number>>();
  for (const t of timesheetResult.data || []) {
    const uid = (t as { user_id: string }).user_id;
    const m = (t as { month: number }).month;
    if (!timesheetMonths.has(uid)) timesheetMonths.set(uid, new Set());
    timesheetMonths.get(uid)!.add(m);
  }

  const map = new Map<string, TeamVacationRow>();
  for (const emp of employees || []) {
    const uid = emp.user_id as string;
    if ((emp.status as string) === 'blocked' && !usersWithAbsences.has(uid)) continue;
    if (timesheetUsers && !timesheetUsers.has(uid) && !usersWithAbsences.has(uid)) continue;
    map.set(uid, {
      userId: uid, fullName: (emp.full_name as string) ?? '', role: emp.role as string,
      approvedDays: Array.from({ length: 12 }, () => []),
      pendingDays: Array.from({ length: 12 }, () => []),
      totalDays: 0, absences: [],
    });
  }

  for (const r of absencesResult.data || []) {
    const userId = r.user_id as string;
    const row = map.get(userId);
    if (!row) continue;
    const start = new Date(r.start_date as string);
    const end = new Date(r.end_date as string);
    const isPending = r.status === 'pending';
    const userTs = timesheetMonths.get(userId);
    const absMonths = getMonthsInRange(start, end);
    const locked = !!userTs && absMonths.some(m => userTs.has(m.month));

    row.absences.push({
      id: r.id as string, absenceType: r.absence_type as AbsenceType,
      status: r.status as 'pending' | 'approved',
      startDate: r.start_date as string, endDate: r.end_date as string,
      calendarDays: (r.calendar_days as number) || 0, locked,
    });

    for (let m = 0; m < 12; m++) {
      const mStart = new Date(year, m, 1);
      const mEnd = new Date(year, m + 1, 0);
      const overlapStart = start > mStart ? start : mStart;
      const overlapEnd = end < mEnd ? end : mEnd;
      if (overlapStart <= overlapEnd) {
        const target = isPending ? row.pendingDays[m] : row.approvedDays[m];
        for (let d = overlapStart.getDate(); d <= overlapEnd.getDate(); d++) target.push(d);
        row.totalDays += overlapEnd.getDate() - overlapStart.getDate() + 1;
      }
    }
  }

  const managerRoles = new Set(['chief', 'head']);
  const rows = Array.from(map.values()).sort((a, b) => {
    if (a.userId === requesterId) return -1;
    if (b.userId === requesterId) return 1;
    const aM = managerRoles.has(a.role || '');
    const bM = managerRoles.has(b.role || '');
    if (aM !== bM) return aM ? -1 : 1;
    return a.fullName.localeCompare(b.fullName, 'uk');
  });

  return { rows, requesterRole };
}
