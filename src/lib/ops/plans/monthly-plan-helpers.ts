/**
 * Monthly plan DB helper functions.
 * Extracted from MonthlyPlanDetails.tsx.
 */

import { supabase } from '../../shared/supabase';

export async function updateMonthlyPlanProjects(monthlyPlanId: string, projectIds: string[]): Promise<void> {
  await supabase
    .from('monthly_plan_projects')
    .delete()
    .eq('monthly_plan_id', monthlyPlanId);

  if (projectIds.length > 0) {
    await supabase
      .from('monthly_plan_projects')
      .insert(projectIds.map(id => ({ monthly_plan_id: monthlyPlanId, project_id: id })));
  }
}

export async function updateMonthlyPlanCompanies(monthlyPlanId: string, companyIds: string[]): Promise<void> {
  await supabase
    .from('monthly_plan_companies')
    .delete()
    .eq('monthly_plan_id', monthlyPlanId);

  if (companyIds.length > 0) {
    await supabase
      .from('monthly_plan_companies')
      .insert(companyIds.map(id => ({ monthly_plan_id: monthlyPlanId, company_id: id })));
  }
}
