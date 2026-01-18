import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { AnnualPlan, QuarterlyPlan, WeeklyPlan, PlanStatus } from '@/types/planning';
import { UserInfo } from '@/types/azure';

export const usePlans = (user: UserInfo) => {
  // Состояния для данных
  const [annualPlans, setAnnualPlans] = useState<AnnualPlan[]>([]);
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlan[]>([]);

  // Состояния для UI
  const [activeView, setActiveView] = useState<'yearly' | 'quarterly' | 'weekly'>('yearly');
  const [selectedAnnualPlan, setSelectedAnnualPlan] = useState<string | null>(null);
  const [selectedQuarterlyPlan, setSelectedQuarterlyPlan] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showPermissionError, setShowPermissionError] = useState<boolean>(false);
  const [permissionErrorMessage, setPermissionErrorMessage] = useState<string>('');

  // Загрузка всех записей с пагинацией (Supabase ограничивает до 1000 за запрос)
  const fetchAllWithPagination = async (table: string, orderBy: string, ascending: boolean = true) => {
    const pageSize = 1000;
    let allData: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(orderBy, { ascending })
        .range(from, to);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        hasMore = data.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  // Параллельная загрузка всех планов
  const fetchAllPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Запускаем загрузку параллельно с пагинацией для больших таблиц
      const [annualData, quarterlyData, weeklyData] = await Promise.all([
        supabase
          .from('v_annual_plans')
          .select('*')
          .order('year', { ascending: false })
          .then(r => { if (r.error) throw r.error; return r.data || []; }),
        supabase
          .from('v_quarterly_plans')
          .select('*')
          .order('quarter', { ascending: true })
          .then(r => { if (r.error) throw r.error; return r.data || []; }),
        // Недельные планы - с пагинацией (их много)
        fetchAllWithPagination('v_weekly_plans', 'weekly_date', true)
      ]);

      setAnnualPlans(annualData);
      setQuarterlyPlans(quarterlyData);
      setWeeklyPlans(weeklyData);
    } catch (error: any) {
      console.error('Ошибка при загрузке планов:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка годовых планов (отдельно, если нужно)
  const fetchAnnualPlans = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('v_annual_plans')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      setAnnualPlans(data || []);
    } catch (error: any) {
      console.error('Ошибка при загрузке годовых планов:', error);
      setError(error.message);
    }
  }, []);

  // Загрузка квартальных планов
  const fetchQuarterlyPlans = useCallback(async (annualPlanId?: string) => {
    try {
      let query = supabase
        .from('v_quarterly_plans')
        .select('*');

      if (annualPlanId) {
        query = query.eq('annual_plan_id', annualPlanId);
      }

      const { data, error } = await query.order('quarter', { ascending: true });
      if (error) throw error;
      setQuarterlyPlans(data || []);
    } catch (error: any) {
      console.error('Ошибка при загрузке квартальных планов:', error);
      setError(error.message);
    }
  }, []);

  // Загрузка недельных планов
  const fetchWeeklyPlans = useCallback(async (quarterlyPlanId?: string) => {
    try {
      let data: any[];

      if (quarterlyPlanId) {
        // Если фильтр по квартальному плану - обычный запрос (их будет < 1000)
        const result = await supabase
          .from('v_weekly_plans')
          .select('*')
          .eq('quarterly_id', quarterlyPlanId)
          .order('weekly_date', { ascending: true });
        if (result.error) throw result.error;
        data = result.data || [];
      } else {
        // Без фильтра - загружаем все с пагинацией
        data = await fetchAllWithPagination('v_weekly_plans', 'weekly_date', true);
      }

      setWeeklyPlans(data);

      if (quarterlyPlanId) {
        setSelectedQuarterlyPlan(quarterlyPlanId);
      } else {
        setSelectedQuarterlyPlan(null);
      }
    } catch (error: any) {
      console.error('Ошибка при загрузке недельных планов:', error);
      setError(error.message);
    }
  }, []);

  // Обработчики кликов по планам
  const handleAnnualPlanClick = useCallback((planId: string) => {
    setSelectedAnnualPlan(planId);
    setActiveView('quarterly');
    fetchQuarterlyPlans(planId ?? undefined);
  }, [fetchQuarterlyPlans]);

  const handleQuarterlyPlanClick = useCallback((planId: string) => {
    setSelectedQuarterlyPlan(planId);
    setActiveView('weekly');
    fetchWeeklyPlans(planId ?? undefined);
  }, [fetchWeeklyPlans]);

  // Обновление данных после успешного действия
  const handlePlanSuccess = useCallback(() => {
    fetchAllPlans();
  }, [fetchAllPlans]);

  // Пример обработчика смены фильтра статуса
  const handleStatusFilterChange = useCallback((newStatus: PlanStatus | null) => {
    setStatusFilter(newStatus);
  }, []);

  return {
    // Данные
    annualPlans,
    quarterlyPlans,
    weeklyPlans,

    // Состояние UI
    activeView,
    setActiveView,
    selectedAnnualPlan,
    setSelectedAnnualPlan,
    selectedQuarterlyPlan,
    setSelectedQuarterlyPlan,
    statusFilter,
    setStatusFilter,
    loading,
    error,
    showPermissionError,
    setShowPermissionError,
    permissionErrorMessage,
    setPermissionErrorMessage,

    // Методы
    fetchAllPlans,
    fetchAnnualPlans,
    fetchQuarterlyPlans,
    fetchWeeklyPlans,
    handleAnnualPlanClick,
    handleQuarterlyPlanClick,
    handlePlanSuccess,
    handleStatusFilterChange
  };
};

export default usePlans;
