/**
 * Quarterly plan DB fetchers — standalone async query functions.
 * Extracted from usePlans.ts to reduce hook size.
 */

import { supabase } from '../../shared/db-client';
import { mapQuarterlyRows, type QuarterlyBaseRow } from './quarterly-mappers';
import type { QuarterlyPlan } from '@/types/planning';

const QUARTERLY_SELECT = `
  quarterly_id,
  annual_plan_id,
  department_id,
  quarter,
  goal,
  expected_result,
  status,
  process_id,
  departments (department_name),
  processes (process_name)
`;

export async function fetchQuarterlyPlansByAnnualIds(annualIds: string[]): Promise<QuarterlyPlan[]> {
  const { data, error } = await supabase
    .from('quarterly_plans')
    .select(QUARTERLY_SELECT)
    .in('annual_plan_id', annualIds)
    .order('quarter', { ascending: true });

  if (error) throw error;
  return mapQuarterlyRows((data || []) as QuarterlyBaseRow[]);
}

export async function fetchAllQuarterlyPlansFromBase(): Promise<QuarterlyPlan[]> {
  const { data, error } = await supabase
    .from('quarterly_plans')
    .select(QUARTERLY_SELECT)
    .order('quarter', { ascending: true });

  if (error) throw error;
  return mapQuarterlyRows((data || []) as QuarterlyBaseRow[]);
}
