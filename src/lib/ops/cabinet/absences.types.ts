export type AbsenceType = '14d' | '10d' | '5d';

export interface AbsenceRow {
  id: string;
  user_id: string;
  year: number;
  month: number;
  days: number[];
  absence_type: AbsenceType;
  start_date: string | null;
  end_date: string | null;
  calendar_days: number | null;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  reject_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  editable?: boolean;
  // JOIN fields
  full_name?: string;
  department_id?: string | null;
}

export interface YearlyQuota {
  used14d: number;
  used10d: number;
  used5d: number;
  totalDays: number;
}

export interface TeamAbsenceInfo {
  id: string;
  absenceType: AbsenceType;
  status: 'pending' | 'approved';
  startDate: string;
  endDate: string;
  calendarDays: number;
  locked: boolean;
}

export interface TeamVacationRow {
  userId: string;
  fullName: string;
  role?: string;
  approvedDays: number[][];
  pendingDays: number[][];
  totalDays: number;
  absences: TeamAbsenceInfo[];
}

export interface TeamAbsencesResult {
  rows: TeamVacationRow[];
  requesterRole: string;
}

export const SELECT_COLS =
  'id, user_id, year, month, days, absence_type, start_date, end_date, calendar_days, status, comment, reject_reason, approved_by, approved_at, created_at';
