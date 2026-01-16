import { supabase } from '../supabase';

export interface WeeklyPlan {
  weekly_id: string;
  quarterly_id: string;
  weekly_date: string;
  expected_result: string;
  status: string;
  assignees_count?: number;
  department_name?: string;
  process_name?: string;
}

export async function getWeeklyPlansByQuarter(quarterly_id: string): Promise<WeeklyPlan[]> {
  const { data, error } = await supabase
    .from('v_weekly_plans')
    .select('*')
    .eq('quarterly_id', quarterly_id)
    .order('weekly_date', { ascending: true });
  if (error) throw error;
  return data as WeeklyPlan[];
}
