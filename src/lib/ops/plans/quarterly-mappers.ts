/**
 * Quarterly plan row mappers — pure data transformation functions.
 * Extracted from usePlans.ts to enable reuse and reduce hook size.
 */

import { PlanStatus, type QuarterlyPlan } from '@/types/planning';

export type QuarterlyBaseRow = {
  quarterly_id: string;
  annual_plan_id: string | null;
  department_id: string | null;
  quarter: number;
  goal: string;
  expected_result: string;
  status: PlanStatus;
  process_id?: string | null;
  departments?: { department_name?: string | null } | { department_name?: string | null }[] | null;
  processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
};

export function normalizeRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function mapQuarterlyRows(rows: QuarterlyBaseRow[]): QuarterlyPlan[] {
  return rows.map((row) => {
    const department = normalizeRelation(row.departments);
    const process = normalizeRelation(row.processes);
    return {
      quarterly_id: row.quarterly_id,
      annual_plan_id: row.annual_plan_id,
      department_id: row.department_id,
      department_name: department?.department_name || undefined,
      quarter: row.quarter,
      goal: row.goal,
      expected_result: row.expected_result,
      status: row.status,
      process_id: row.process_id || undefined,
      process_name: process?.process_name || undefined,
    };
  });
}
