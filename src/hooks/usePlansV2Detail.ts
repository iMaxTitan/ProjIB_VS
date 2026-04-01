'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/shared/query-keys';
import { fetchPlanDetails } from '@/lib/ops/plans/plans.queries';
import type { MonthlyPlan, MonthlyPlanAssignee, DailyTask } from '@/types/planning';

// ── Types ───────────────────────────────────────────────────
export interface PlanCompanyInfo { companyId: string; companyName: string; planId: string; }
export interface PlanProjectInfo { projectId: string; projectName: string; planId: string; }
export interface PlanDocInfo { kbDocumentId: string; title: string; planId: string; }

// ── Hook ────────────────────────────────────────────────────
export function usePlansV2Detail(plans: MonthlyPlan[], month: number | null) {
  const planIds = useMemo(() => plans.map(p => p.monthly_plan_id), [plans]);
  const enabled = planIds.length > 0;

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: queryKeys.plans.details(planIds),
    queryFn: () => fetchPlanDetails(planIds),
    enabled,
    staleTime: 60_000,
  });

  const assigneesRaw = useMemo(() => details?.assignees ?? [], [details]);
  const companiesRaw = useMemo(() => details?.companies ?? [], [details]);
  const projectsRaw = useMemo(() => details?.projects ?? [], [details]);
  const kbDocsRaw = useMemo(() => details?.kb_docs ?? [], [details]);
  const dailyTasksRaw = useMemo(() => (details?.tasks ?? []) as DailyTask[], [details]);

  const spentByMonthUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of dailyTasksRaw) { const key = `${month}:${t.user_id}`; map.set(key, (map.get(key) || 0) + (t.spent_hours || 0)); }
    return map;
  }, [dailyTasksRaw, month]);

  const uniqueCompanies = useMemo(() => {
    const seen = new Set<string>();
    return companiesRaw.filter(c => { if (seen.has(c.company_id)) return false; seen.add(c.company_id); return true; })
      .map(c => ({ companyId: c.company_id, companyName: c.company_name, planId: c.plan_id }));
  }, [companiesRaw]);

  const uniqueProjects = useMemo(() => {
    const seen = new Set<string>();
    return projectsRaw.filter(p => { if (seen.has(p.project_id)) return false; seen.add(p.project_id); return true; })
      .map(p => ({ projectId: p.project_id, projectName: p.project_name, planId: p.plan_id }));
  }, [projectsRaw]);

  const uniqueDocs = useMemo(() => {
    const seen = new Set<string>();
    return kbDocsRaw.filter(d => { if (seen.has(d.kb_document_id)) return false; seen.add(d.kb_document_id); return true; })
      .map(d => ({ kbDocumentId: d.kb_document_id, title: d.title, planId: d.plan_id }));
  }, [kbDocsRaw]);

  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, MonthlyPlanAssignee>();
    for (const a of assigneesRaw) {
      if (!map.has(a.user_id)) map.set(a.user_id, a as MonthlyPlanAssignee);
    }
    return Array.from(map.values()).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'uk'));
  }, [assigneesRaw]);

  return {
    assignees: uniqueAssignees, rawAssignees: assigneesRaw as MonthlyPlanAssignee[], assigneesLoading: detailsLoading,
    companies: uniqueCompanies, projects: uniqueProjects, kbDocs: uniqueDocs,
    dailyTasks: dailyTasksRaw, tasksLoading: detailsLoading, spentByMonthUser,
  };
}
