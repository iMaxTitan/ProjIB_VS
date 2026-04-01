'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/shared/db-client';
import type { MonthlyPlan, MonthlyPlanAssignee, DailyTask } from '@/types/planning';

// ── Types ───────────────────────────────────────────────────
export interface PlanCompanyInfo {
  companyId: string;
  companyName: string;
  planId: string;
}

export interface PlanProjectInfo {
  projectId: string;
  projectName: string;
  planId: string;
}

export interface PlanDocInfo {
  kbDocumentId: string;
  title: string;
  planId: string;
}

export interface AssigneeWithTasks extends MonthlyPlanAssignee {
  totalSpent: number;
  tasksCount: number;
}

// ── Hook ────────────────────────────────────────────────────
export function usePlansV2Detail(plans: MonthlyPlan[], month: number | null) {
  const planIds = useMemo(() => plans.map(p => p.monthly_plan_id), [plans]);
  const enabled = planIds.length > 0;

  // Assignees for all plans of this procedure (two-query approach — FK may not resolve via PostgREST)
  const { data: assignees = [], isLoading: assigneesLoading } = useQuery({
    queryKey: ['plans-v2-assignees', planIds],
    queryFn: async () => {
      if (planIds.length === 0) return [];
      const { data: rows, error } = await supabase
        .from('monthly_plan_assignees')
        .select('monthly_plan_id, user_id, assigned_at')
        .in('monthly_plan_id', planIds);
      if (error) throw error;
      if (!rows || rows.length === 0) return [];

      // Fetch profiles separately
      const userIds = [...new Set(rows.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email, photo_base64, role, status, department_id')
        .in('user_id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      return rows.map(row => {
        const profile = profileMap.get(row.user_id);
        return {
          monthly_plan_id: row.monthly_plan_id,
          user_id: row.user_id,
          assigned_at: row.assigned_at ?? undefined,
          full_name: profile?.full_name ?? undefined,
          email: profile?.email ?? undefined,
          photo_url: profile?.photo_base64 ?? undefined,
          role: profile?.role ?? undefined,
          user_status: profile?.status ?? undefined,
          department_id: profile?.department_id ?? undefined,
        } as MonthlyPlanAssignee;
      });
    },
    enabled,
    staleTime: 2 * 60_000,
  });

  // Companies for all plans
  const { data: companies = [] } = useQuery({
    queryKey: ['plans-v2-companies', planIds],
    queryFn: async () => {
      if (planIds.length === 0) return [];
      const { data: mpc, error: mpcErr } = await supabase
        .from('monthly_plan_companies')
        .select('monthly_plan_id, company_id')
        .in('monthly_plan_id', planIds);
      if (mpcErr) throw mpcErr;
      if (!mpc || mpc.length === 0) return [];

      const companyIds = [...new Set(mpc.map(r => r.company_id))];
      const { data: companyRows, error: cErr } = await supabase
        .from('companies')
        .select('company_id, company_name')
        .in('company_id', companyIds);
      if (cErr) throw cErr;
      const nameMap = new Map((companyRows || []).map(c => [c.company_id, c.company_name]));

      return mpc.map(r => ({
        companyId: r.company_id,
        companyName: nameMap.get(r.company_id) || r.company_id,
        planId: r.monthly_plan_id,
      })) as PlanCompanyInfo[];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  // Projects for all plans
  const { data: projects = [] } = useQuery({
    queryKey: ['plans-v2-projects', planIds],
    queryFn: async () => {
      if (planIds.length === 0) return [];
      const { data: mpp, error: mppErr } = await supabase
        .from('monthly_plan_projects')
        .select('monthly_plan_id, project_id')
        .in('monthly_plan_id', planIds);
      if (mppErr) throw mppErr;
      if (!mpp || mpp.length === 0) return [];

      const projectIds = [...new Set(mpp.map(r => r.project_id))];
      const { data: projRows, error: pErr } = await supabase
        .from('projects')
        .select('project_id, project_name')
        .in('project_id', projectIds);
      if (pErr) throw pErr;
      const nameMap = new Map((projRows || []).map(p => [p.project_id, p.project_name]));

      return mpp.map(r => ({
        projectId: r.project_id,
        projectName: nameMap.get(r.project_id) || r.project_id,
        planId: r.monthly_plan_id,
      })) as PlanProjectInfo[];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  // KB Documents for all plans
  const { data: kbDocs = [] } = useQuery({
    queryKey: ['plans-v2-kbdocs', planIds],
    queryFn: async () => {
      if (planIds.length === 0) return [];
      const { data: mpd, error: mpdErr } = await supabase
        .from('monthly_plan_documents')
        .select('monthly_plan_id, kb_document_id')
        .in('monthly_plan_id', planIds);
      if (mpdErr) throw mpdErr;
      if (!mpd || mpd.length === 0) return [];

      const docIds = [...new Set(mpd.map(r => r.kb_document_id))];
      const { data: docRows, error: dErr } = await supabase
        .from('kb_documents')
        .select('id, title')
        .in('id', docIds);
      if (dErr) throw dErr;
      const titleMap = new Map((docRows || []).map(d => [d.id, d.title]));

      return mpd.map(r => ({
        kbDocumentId: r.kb_document_id,
        title: titleMap.get(r.kb_document_id) || r.kb_document_id,
        planId: r.monthly_plan_id,
      })) as PlanDocInfo[];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  // Daily tasks for ALL plans in scope (not just selected month)
  const { data: dailyTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['plans-v2-tasks', planIds],
    queryFn: async () => {
      if (planIds.length === 0) return [];
      const { data: tasks, error } = await supabase
        .from('daily_tasks')
        .select('*')
        .in('monthly_plan_id', planIds)
        .order('task_date', { ascending: false });
      if (error) throw error;
      if (!tasks || tasks.length === 0) return [];

      const userIds = [...new Set(tasks.map(t => t.user_id))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email, photo_base64')
        .in('user_id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      return tasks.map(t => {
        const profile = profileMap.get(t.user_id);
        return {
          ...t,
          user_name: profile?.full_name ?? undefined,
          user_email: profile?.email ?? undefined,
          user_photo: profile?.photo_base64 ?? undefined,
        } as DailyTask;
      });
    },
    enabled,
    staleTime: 60_000,
  });

  // Hours per month per user from tasks
  const spentByMonthUser = useMemo(() => {
    const map = new Map<string, number>(); // "month:userId" -> hours
    for (const t of dailyTasks) {
      const key = `${month}:${t.user_id}`;
      map.set(key, (map.get(key) || 0) + (t.spent_hours || 0));
    }
    return map;
  }, [dailyTasks, month]);

  // Unique companies (deduplicated)
  const uniqueCompanies = useMemo(() => {
    const seen = new Set<string>();
    return companies.filter(c => {
      if (seen.has(c.companyId)) return false;
      seen.add(c.companyId);
      return true;
    });
  }, [companies]);

  // Unique projects
  const uniqueProjects = useMemo(() => {
    const seen = new Set<string>();
    return projects.filter(p => {
      if (seen.has(p.projectId)) return false;
      seen.add(p.projectId);
      return true;
    });
  }, [projects]);

  // Unique docs
  const uniqueDocs = useMemo(() => {
    const seen = new Set<string>();
    return kbDocs.filter(d => {
      if (seen.has(d.kbDocumentId)) return false;
      seen.add(d.kbDocumentId);
      return true;
    });
  }, [kbDocs]);

  // Unique assignees with aggregated hours
  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, MonthlyPlanAssignee>();
    for (const a of assignees) {
      if (!map.has(a.user_id)) map.set(a.user_id, a);
    }
    return Array.from(map.values()).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'uk'));
  }, [assignees]);

  return {
    assignees: uniqueAssignees,
    rawAssignees: assignees,
    assigneesLoading,
    companies: uniqueCompanies,
    projects: uniqueProjects,
    kbDocs: uniqueDocs,
    dailyTasks,
    tasksLoading,
    spentByMonthUser,
  };
}
