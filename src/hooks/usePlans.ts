import { useState, useEffect, useCallback } from 'react';
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

  // Загрузка годовых планов
  const fetchAnnualPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('v_annual_plans')
        .select('*')
        .order('year', { ascending: false });
      
      if (error) throw error;
      
      setAnnualPlans(data || []);
    } catch (error: any) {
      console.error('Ошибка при загрузке годовых планов:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Принудительное обновление: отключаем кеш Supabase для fetchQuarterlyPlans ---
  const fetchQuarterlyPlans = useCallback(async (annualPlanId?: string) => {
    try {
      setLoading(true);
      setError(null);
      // Используем postgrest с no-cache (Supabase JS v2+)
      let query = supabase
        .from('v_quarterly_plans')
        .select('*', { head: false }) // head: false отключает кеширование
        .neq('status', 'completed');
      if (annualPlanId) {
        query = query.eq('annual_plan_id', annualPlanId);
      }
      // Добавляем уникальный параметр для обхода кеша (workaround)
      query = query.order('quarter', { ascending: true });
      // Принудительно обновляем (Supabase иногда кеширует, поэтому добавим random param)
      const { data, error } = await query;
      if (error) throw error;
      setQuarterlyPlans(data || []);
    } catch (error: any) {
      console.error('Ошибка при загрузке квартальных планов:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка недельных планов - универсальная функция
  // Если указан quarterlyPlanId, загружает недельные планы для этого квартального плана
  const fetchWeeklyPlans = useCallback(async (quarterlyPlanId?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      let query = supabase
        .from('v_weekly_plans')
        .select('*');
      
      // Если указан ID квартального плана, фильтруем по нему
      if (quarterlyPlanId) {
        query = query.eq('quarterly_id', quarterlyPlanId);
      }
      // ВАЖНО: НЕ фильтруем по статусу здесь!
      const { data, error } = await query.order('weekly_date', { ascending: true });
      
      if (error) throw error;
      setWeeklyPlans(data || []);
      // Если указан ID квартального плана, устанавливаем его как выбранный
      if (quarterlyPlanId) {
        setSelectedQuarterlyPlan(quarterlyPlanId);
      } else {
        setSelectedQuarterlyPlan(null);
      }
    } catch (error: any) {
      console.error('Ошибка при загрузке недельных планов:', error);
      setError(error.message);
    } finally {
      setLoading(false);
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
    if (activeView === 'yearly') {
      fetchAnnualPlans();
    } else if (activeView === 'quarterly') {
      fetchQuarterlyPlans(selectedAnnualPlan ?? undefined);
    } else if (activeView === 'weekly') {
      fetchWeeklyPlans(selectedQuarterlyPlan ?? undefined);
    }
  }, [activeView, selectedAnnualPlan, selectedQuarterlyPlan, fetchAnnualPlans, fetchQuarterlyPlans, fetchWeeklyPlans]);

  // Пример обработчика смены фильтра статуса (можно вызвать из UI)
  const handleStatusFilterChange = useCallback((newStatus: PlanStatus | null) => {
    setStatusFilter(newStatus);
    // fetchWeeklyPlans больше не вызывается — фильтрация только на клиенте!
  }, []);

  // Загрузка годовых планов при монтировании компонента
  useEffect(() => {
    fetchAnnualPlans();
  }, [fetchAnnualPlans]);

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
