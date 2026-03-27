import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AbsenceRow, AbsenceType, YearlyQuota, TeamVacationRow } from '@/lib/ops/cabinet/absences';

interface AbsencesData {
  own: AbsenceRow[];
  pending: AbsenceRow[];
  quota: YearlyQuota;
}

async function fetchAbsences(year: number): Promise<AbsencesData> {
  const res = await fetch(`/api/cabinet/absences?year=${year}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Absences: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Team vacation calendar (chief/head) — yearly overview
// ---------------------------------------------------------------------------

interface TeamAbsencesResponse {
  rows: TeamVacationRow[];
  currentUserId: string;
  currentUserRole: string;
}

async function fetchTeamAbsences(year: number): Promise<TeamAbsencesResponse> {
  const res = await fetch(`/api/cabinet/absences/team?year=${year}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Team absences: ${res.status}`);
  }
  return res.json();
}

export function useTeamAbsences(year: number) {
  return useQuery({
    queryKey: ['cabinet', 'absences', 'team', year],
    queryFn: () => fetchTeamAbsences(year),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Personal absences
// ---------------------------------------------------------------------------

export function useAbsences(year: number) {
  return useQuery({
    queryKey: ['cabinet', 'absences', year],
    queryFn: () => fetchAbsences(year),
    staleTime: 30_000,
  });
}

export function useCreateAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { absence_type: AbsenceType; start_date: string; comment?: string }) => {
      const res = await fetch('/api/cabinet/absences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create');
      }
      return res.json() as Promise<AbsenceRow>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cabinet', 'absences', data.year] });
      qc.invalidateQueries({ queryKey: ['cabinet', 'absences', 'team', data.year] });
    },
  });
}

export function useUpdateAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; start_date: string }) => {
      const res = await fetch('/api/cabinet/absences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update');
      }
      return res.json() as Promise<AbsenceRow>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cabinet', 'absences', data.year] });
    },
  });
}

export function useDeleteAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, year }: { id: string; year: number }) => {
      const res = await fetch(`/api/cabinet/absences?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete');
      }
      return year;
    },
    onSuccess: (year) => {
      // Remove personal absences cache entirely — next mount will fetch fresh data
      qc.removeQueries({ queryKey: ['cabinet', 'absences', year], exact: true });
      qc.invalidateQueries({ queryKey: ['cabinet', 'absences', 'team', year] });
    },
  });
}

export function useApproveAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      absenceId: string;
      action: 'approve' | 'reject';
      reason?: string;
      year: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { year: _year, ...body } = params;
      const res = await fetch('/api/cabinet/absences/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed');
      }
      return params.year;
    },
    onSuccess: (year) => {
      qc.removeQueries({ queryKey: ['cabinet', 'absences', year], exact: true });
      qc.invalidateQueries({ queryKey: ['cabinet', 'absences', 'team', year] });
    },
  });
}
