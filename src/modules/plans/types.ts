import type { PlanStatus } from '@/types/planning';

export interface StatusChangeParams {
  planType: 'annual' | 'quarterly';
  planId: string;
  newStatus: PlanStatus;
  userId: string;
}

/**
 * Интерфейс для параметров годового плана
 */
export interface AnnualPlanParams {
  annualId?: string;
  year: number;
  goal: string;
  expectedResult: string;
  budget: number;
  status: PlanStatus;
  userId: string;
  action?: 'create' | 'update' | 'delete';
}

/**
 * Интерфейс для параметров квартального плана
 */
export interface QuarterlyPlanParams {
  quarterlyId?: string;
  annualPlanId: string;
  departmentId: string;
  quarter: number;
  goal: string;
  expectedResult: string;
  status: PlanStatus;
  process_id: string;
  userId: string;
  action?: 'create' | 'update' | 'delete';
}

export interface MonthlyPlanParams {
  monthlyPlanId?: string;
  quarterlyId: string;
  measureId: string; // Replacing serviceId
  year: number;
  month: number;
  description?: string;
  plannedHours?: number;
  status: PlanStatus;
  assignees?: string[];
  userId: string;
  action?: 'create' | 'update' | 'delete';
}

export interface DailyTaskParams {
  dailyTaskId?: string;
  monthlyPlanId: string;
  userId: string;
  taskDate: string;
  description: string;
  spentHours: number;
  attachmentUrl?: string;
  documentNumber?: string;
  action?: 'create' | 'update' | 'delete';
}

export interface DeleteCheckResult {
  canDelete: boolean;
  reason?: string;
  childCount?: number;
}
