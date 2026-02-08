import { useState, useEffect, useCallback } from 'react';
import {
  getMonthlyPlans,
  getMonthlyPlanById,
  manageMonthlyPlan,
  getMonthlyPlanAssignees,
  getServices,
  MonthlyPlanParams
} from '@/lib/plans/plan-service';
import type { MonthlyPlan, Service, MonthlyPlanAssignee, PlanStatus } from '@/types/planning';
import { getErrorMessage } from '@/lib/utils/error-message';

interface UseMonthlyPlansOptions {
  quarterlyId?: string;
  year?: number;
  month?: number;
  measureId?: string;
  userId?: string;
  autoFetch?: boolean;
}

export function useMonthlyPlans(options: UseMonthlyPlansOptions = {}) {
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMonthlyPlans({
        quarterlyId: options.quarterlyId,
        year: options.year,
        month: options.month,
        measureId: options.measureId,
        userId: options.userId
      });
      setPlans(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось загрузить месячные планы'));
    } finally {
      setLoading(false);
    }
  }, [options.quarterlyId, options.year, options.month, options.measureId, options.userId]);

  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchPlans();
    }
  }, [fetchPlans, options.autoFetch]);

  const createPlan = async (params: Omit<MonthlyPlanParams, 'action'>) => {
    const result = await manageMonthlyPlan({ ...params, action: 'create' });
    await fetchPlans();
    return result;
  };

  const updatePlan = async (params: Omit<MonthlyPlanParams, 'action'>) => {
    const result = await manageMonthlyPlan({ ...params, action: 'update' });
    await fetchPlans();
    return result;
  };

  const deletePlan = async (monthlyPlanId: string, userId: string) => {
    const result = await manageMonthlyPlan({
      monthlyPlanId,
      quarterlyId: '',
      measureId: '',
      year: 0,
      month: 0,
      status: 'draft',
      userId,
      action: 'delete'
    });
    await fetchPlans();
    return result;
  };

  return {
    plans,
    loading,
    error,
    refetch: fetchPlans,
    createPlan,
    updatePlan,
    deletePlan
  };
}

export function useMonthlyPlan(monthlyPlanId: string | null) {
  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [assignees, setAssignees] = useState<MonthlyPlanAssignee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    if (!monthlyPlanId) {
      setPlan(null);
      setAssignees([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [planData, assigneesData] = await Promise.all([
        getMonthlyPlanById(monthlyPlanId),
        getMonthlyPlanAssignees(monthlyPlanId)
      ]);
      setPlan(planData);
      setAssignees(assigneesData);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось загрузить план'));
    } finally {
      setLoading(false);
    }
  }, [monthlyPlanId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  return {
    plan,
    assignees,
    loading,
    error,
    refetch: fetchPlan
  };
}

export function useServices(processId?: string) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getServices(processId);
      setServices(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось загрузить услуги'));
    } finally {
      setLoading(false);
    }
  }, [processId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return {
    services,
    loading,
    error,
    refetch: fetchServices
  };
}

