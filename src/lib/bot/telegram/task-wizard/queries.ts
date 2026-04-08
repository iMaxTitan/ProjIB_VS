/**
 * DB queries for the task creation wizard.
 * Loads user's active monthly plans for the current month, grouped by process.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';

export interface WizardPlan {
  monthlyPlanId: string;
  displayTitle: string;   // plan description or procedure name
  procedureName: string;
  plannedHours: number;
  spentHours: number;
  processId: string;
  processName: string;
}

export interface WizardProcess {
  processId: string;
  processName: string;
  plans: WizardPlan[];
}

export async function getActivePlansForWizard(
  db: PostgrestClient,
  userId: string,
): Promise<WizardProcess[]> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 1. Load plans where user is an assignee
  const { data: assigneeRows, error: assigneeError } = await db
    .from('monthly_plan_assignees')
    .select('monthly_plan_id')
    .eq('user_id', userId);

  if (assigneeError) throw assigneeError;
  if (!assigneeRows?.length) return [];

  const assignedPlanIds = assigneeRows.map(r => r.monthly_plan_id);

  // 2. Load active plans for current month with procedure + process info
  const { data: plans, error: plansError } = await db
    .from('monthly_plans')
    .select(`
      monthly_plan_id,
      description,
      planned_hours,
      procedures(name, processes(process_name))
    `)
    .in('monthly_plan_id', assignedPlanIds)
    .eq('year', year)
    .eq('month', month)
    .eq('status', 'active');

  if (plansError) throw plansError;
  if (!plans?.length) return [];

  const planIds = plans.map(p => p.monthly_plan_id);

  // 3. Load spent hours from view
  const { data: hoursData } = await db
    .from('v_monthly_plan_hours')
    .select('monthly_plan_id, total_spent_hours')
    .in('monthly_plan_id', planIds);

  const hoursMap = new Map<string, number>();
  for (const h of hoursData || []) {
    hoursMap.set(h.monthly_plan_id, Number(h.total_spent_hours) || 0);
  }

  // 4. Group by process
  const processMap = new Map<string, WizardProcess>();

  for (const row of plans) {
    type ProcJoin = {
      name: string;
      processes: { process_name: string } | { process_name: string }[] | null;
    };
    const proc = row.procedures as unknown as ProcJoin | ProcJoin[] | null;
    const p = Array.isArray(proc) ? proc[0] : proc;
    if (!p) continue;

    const procObj = Array.isArray(p.processes) ? p.processes[0] : p.processes;
    const processName = procObj?.process_name ?? 'Інше';
    // Use procedure name as stable process group key (process_name is unique enough)
    const processId = processName;

    const plan: WizardPlan = {
      monthlyPlanId: row.monthly_plan_id,
      displayTitle: row.description || p.name,
      procedureName: p.name,
      plannedHours: Number(row.planned_hours) || 0,
      spentHours: hoursMap.get(row.monthly_plan_id) || 0,
      processId,
      processName,
    };

    if (!processMap.has(processId)) {
      processMap.set(processId, { processId, processName, plans: [] });
    }
    processMap.get(processId)!.plans.push(plan);
  }

  return Array.from(processMap.values());
}

export function findPlanInProcesses(
  processes: WizardProcess[],
  planId: string,
): WizardPlan | undefined {
  for (const proc of processes) {
    const found = proc.plans.find(p => p.monthlyPlanId === planId);
    if (found) return found;
  }
  return undefined;
}
