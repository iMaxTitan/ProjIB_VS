'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronLeft, GripVertical, Clock, Building2, Users, Calendar, Pencil, Plus } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { AnnualPlan, QuarterlyPlan, WeeklyPlan, PlanStatus, getPlanStatusText, canCreateAnnualPlans, canCreateQuarterlyPlans, canCreateWeeklyPlans, WeeklyPlanAssignee } from '@/types/planning';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { usePlans } from '@/hooks/usePlans';
import AnnualPlanModal from '@/components/planning/AnnualPlanModal';
import QuarterlyPlanModal from '@/components/planning/QuarterlyPlanModal';
import WeeklyPlanModal from '@/components/planning/WeeklyPlanModal';
import { supabase } from '@/lib/supabase';

interface PlansPageNewProps {
  user: UserInfo;
  fetchPlanCounts?: () => void;
}

type PlanType = 'annual' | 'quarterly' | 'weekly';

export default function PlansPageNew({ user, fetchPlanCounts }: PlansPageNewProps) {
  // Состояния для выбора и модальных окон
  const [selectedType, setSelectedType] = useState<PlanType | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<AnnualPlan | QuarterlyPlan | WeeklyPlan | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlanStatus | null>(null);

  // Вкладки года, квартала и недели
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Модальные окна
  const [showAnnualModal, setShowAnnualModal] = useState(false);
  const [showQuarterlyModal, setShowQuarterlyModal] = useState(false);
  const [showWeeklyModal, setShowWeeklyModal] = useState(false);
  const [parentIdForCreate, setParentIdForCreate] = useState<string | null>(null);
  const [planToEdit, setPlanToEdit] = useState<AnnualPlan | QuarterlyPlan | WeeklyPlan | null>(null);

  // Данные из хука
  const {
    annualPlans,
    quarterlyPlans,
    weeklyPlans,
    loading,
    error,
    fetchAnnualPlans,
    fetchQuarterlyPlans,
    fetchWeeklyPlans,
    handlePlanSuccess
  } = usePlans(user);

  // Загрузка данных при монтировании
  useEffect(() => {
    fetchAnnualPlans();
    fetchQuarterlyPlans();
    fetchWeeklyPlans();
  }, []);

  // Получить уникальные годы из планов (отсортированные по убыванию)
  const availableYears = Array.from(new Set(annualPlans.map(p => p.year))).sort((a, b) => b - a);

  // Автовыбор текущего года и квартала при загрузке
  useEffect(() => {
    if (availableYears.length > 0 && selectedYear === null && isInitialLoad) {
      const currentYear = new Date().getFullYear();
      const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);

      // Выбираем текущий год если есть, иначе первый доступный
      const yearToSelect = availableYears.includes(currentYear) ? currentYear : availableYears[0];
      setSelectedYear(yearToSelect);

      // Устанавливаем текущий квартал (будет применен после загрузки кварталов)
      setSelectedQuarter(currentQuarter);
      setIsInitialLoad(false);
    }
  }, [availableYears, selectedYear, isInitialLoad]);

  // Получить кварталы для выбранного года
  const selectedAnnualPlan = annualPlans.find(p => p.year === selectedYear);
  const quartersForYear = selectedAnnualPlan
    ? quarterlyPlans
        .filter(q => q.annual_plan_id === selectedAnnualPlan.annual_id)
        .map(q => q.quarter)
        .sort((a, b) => a - b)
    : [];
  const uniqueQuarters = Array.from(new Set(quartersForYear));

  // Сброс квартала и недели при смене года (только при ручном переключении)
  const prevYearRef = useRef<number | null>(null);
  useEffect(() => {
    // Сбрасываем только если это не первоначальная загрузка
    if (prevYearRef.current !== null && prevYearRef.current !== selectedYear) {
      setSelectedQuarter(null);
      setSelectedWeekNumber(null);
    }
    prevYearRef.current = selectedYear;
  }, [selectedYear]);

  // Сброс недели при смене квартала
  useEffect(() => {
    setSelectedWeekNumber(null);
  }, [selectedQuarter]);

  // Функция получения номера недели в году
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Получаем ID всех годовых планов выбранного года
  const annualPlanIdsForYear = annualPlans
    .filter(p => p.year === selectedYear)
    .map(p => p.annual_id);

  // Получаем ID всех квартальных планов выбранного квартала (из всех годовых планов года)
  const quarterlyPlanIdsForQuarter = quarterlyPlans
    .filter(q => q.annual_plan_id && annualPlanIdsForYear.includes(q.annual_plan_id) && q.quarter === selectedQuarter)
    .map(q => q.quarterly_id);

  // Функция проверки принадлежности даты к кварталу
  const isDateInQuarter = (date: Date, quarter: number, year: number): boolean => {
    const dateYear = date.getFullYear();
    if (dateYear !== year) return false;
    const month = date.getMonth(); // 0-11
    const dateQuarter = Math.floor(month / 3) + 1;
    return dateQuarter === quarter;
  };

  // Недели для выбранного квартала - фильтруем по quarterly_id И по дате
  const weeksForQuarter = selectedQuarter && selectedYear
    ? weeklyPlans
        .filter(w => {
          // Проверяем привязку к квартальному плану
          if (!w.quarterly_id || !quarterlyPlanIdsForQuarter.includes(w.quarterly_id)) return false;
          // Дополнительно проверяем что дата недели действительно в этом квартале
          const weekDate = new Date(w.weekly_date);
          return isDateInQuarter(weekDate, selectedQuarter, selectedYear);
        })
        .sort((a, b) => new Date(a.weekly_date).getTime() - new Date(b.weekly_date).getTime())
    : [];

  // Уникальные номера недель для вкладок
  const uniqueWeekNumbers = Array.from(
    new Set(weeksForQuarter.map(w => getWeekNumber(new Date(w.weekly_date))))
  ).sort((a, b) => a - b);

  // Для создания квартального плана
  const selectedQuarterlyPlan = selectedQuarter
    ? quarterlyPlans.find(q => q.annual_plan_id === selectedAnnualPlan?.annual_id && q.quarter === selectedQuarter)
    : null;

  // Фильтрация планов по году, кварталу, поиску и статусу
  const filteredAnnualPlans = annualPlans.filter(plan => {
    const matchesYear = !selectedYear || plan.year === selectedYear;
    const matchesSearch = !searchQuery ||
      plan.goal.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.year.toString().includes(searchQuery);
    const matchesStatus = !statusFilter || plan.status === statusFilter;
    return matchesYear && matchesSearch && matchesStatus;
  });

  const filteredQuarterlyPlans = quarterlyPlans.filter(plan => {
    // Фильтр по году - план принадлежит любому годовому плану выбранного года
    const matchesYear = !selectedYear || (plan.annual_plan_id && annualPlanIdsForYear.includes(plan.annual_plan_id));
    const matchesQuarter = !selectedQuarter || plan.quarter === selectedQuarter;
    const matchesSearch = !searchQuery ||
      plan.goal.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `Q${plan.quarter}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || plan.status === statusFilter;
    return matchesYear && matchesQuarter && matchesSearch && matchesStatus;
  });

  const filteredWeeklyPlans = weeklyPlans.filter(plan => {
    // Фильтр по кварталу через quarterly_id
    const quarterlyPlan = quarterlyPlans.find(q => q.quarterly_id === plan.quarterly_id);
    const matchesYear = !selectedYear || (quarterlyPlan && selectedAnnualPlan && quarterlyPlan.annual_plan_id === selectedAnnualPlan.annual_id);
    const matchesQuarter = !selectedQuarter || (quarterlyPlan && quarterlyPlan.quarter === selectedQuarter);
    const matchesSearch = !searchQuery ||
      plan.expected_result.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || plan.status === statusFilter;
    return matchesYear && matchesQuarter && matchesSearch && matchesStatus;
  });

  // Обработчик выбора плана из дерева
  const handleSelectPlan = (type: PlanType, plan: AnnualPlan | QuarterlyPlan | WeeklyPlan) => {
    setSelectedType(type);
    setSelectedPlan(plan);
  };

  // Обработчик создания плана
  const handleCreatePlan = (type: PlanType, parentId?: string | null) => {
    setPlanToEdit(null);
    setParentIdForCreate(parentId || null);

    switch (type) {
      case 'annual':
        setShowAnnualModal(true);
        break;
      case 'quarterly':
        setShowQuarterlyModal(true);
        break;
      case 'weekly':
        setShowWeeklyModal(true);
        break;
    }
  };

  // Обработчик редактирования плана
  const handleEditPlan = () => {
    if (!selectedPlan || !selectedType) return;

    setPlanToEdit(selectedPlan);
    setParentIdForCreate(null);

    switch (selectedType) {
      case 'annual':
        setShowAnnualModal(true);
        break;
      case 'quarterly':
        setShowQuarterlyModal(true);
        break;
      case 'weekly':
        setShowWeeklyModal(true);
        break;
    }
  };

  // Обработчик успешного сохранения
  const handleSuccess = useCallback(() => {
    handlePlanSuccess();
    fetchAnnualPlans();
    fetchQuarterlyPlans();
    fetchWeeklyPlans();
    fetchPlanCounts?.();
  }, [handlePlanSuccess, fetchAnnualPlans, fetchQuarterlyPlans, fetchWeeklyPlans, fetchPlanCounts]);

  // Проверка прав на создание
  const canCreate = canCreateAnnualPlans(user);

  // Получение ID для передачи в модалки
  const getSelectedPlanId = (type: PlanType): string | null => {
    if (!selectedPlan) return null;
    switch (type) {
      case 'annual':
        return (selectedPlan as AnnualPlan).annual_id;
      case 'quarterly':
        return (selectedPlan as QuarterlyPlan).quarterly_id;
      case 'weekly':
        return (selectedPlan as WeeklyPlan).weekly_id;
      default:
        return null;
    }
  };

  // Статусы для фильтра
  const statuses: PlanStatus[] = ['draft', 'submitted', 'approved', 'active', 'completed', 'failed', 'returned'];

  // Текущие дата, год, квартал, неделя для индикаторов на вкладках
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const currentWeekNum = getWeekNumber(now);

  // Функция определения цвета точки: текущий=зелёный, прошлый=серый, будущий=жёлтый
  const getTimeIndicatorColor = (value: number, current: number, type: 'year' | 'quarter' | 'week', year?: number) => {
    // Для кварталов и недель учитываем год
    if (type === 'quarter' && year) {
      if (year < currentYear) return "bg-gray-400"; // прошлый год
      if (year > currentYear) return "bg-amber-400"; // будущий год
      // Текущий год - сравниваем кварталы
      if (value < current) return "bg-gray-400";
      if (value > current) return "bg-amber-400";
      return "bg-green-500";
    }
    if (type === 'week' && year) {
      // Для недель сравниваем с учётом года и квартала
      const weekYear = year;
      if (weekYear < currentYear) return "bg-gray-400";
      if (weekYear > currentYear) return "bg-amber-400";
      // Текущий год - сравниваем номера недель
      if (value < currentWeekNum) return "bg-gray-400";
      if (value > currentWeekNum) return "bg-amber-400";
      return "bg-green-500";
    }
    // Для годов
    if (value < current) return "bg-gray-400";
    if (value > current) return "bg-amber-400";
    return "bg-green-500";
  };

  // Ресайз панели
  const [panelWidth, setPanelWidth] = useState(480);
  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = e.clientX - (panelRef.current?.getBoundingClientRect().left || 0);
    if (newWidth >= 280 && newWidth <= 600) {
      setPanelWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="flex h-full">
      {/* Левая панель - дерево планов */}
      <div
        ref={panelRef}
        className="border-r bg-white flex flex-col shadow-sm relative"
        style={{ width: panelWidth }}
      >
        {/* Вкладки годов - notebook style */}
        <div className="px-2 pt-2 bg-gradient-to-b from-amber-50/30 to-transparent">
          <div className="flex flex-wrap gap-0.5 items-end">
            {availableYears.map(year => {
              const yearPlan = annualPlans.find(p => p.year === year);
              const isSelected = selectedYear === year;
              return (
                <button
                  key={year}
                  onClick={() => {
                    if (selectedYear === year) {
                      setSelectedQuarter(null);
                      setSelectedWeekNumber(null);
                    } else {
                      setSelectedYear(year);
                    }
                  }}
                  onDoubleClick={() => yearPlan && handleSelectPlan('annual', yearPlan)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-t-lg transition-all border-t border-l border-r relative",
                    isSelected
                      ? "bg-white border-amber-300 text-amber-700 shadow-sm z-10 -mb-px"
                      : "bg-amber-50/70 border-amber-200/50 text-gray-500 hover:bg-amber-100/70 hover:text-amber-600"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {year}
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      getTimeIndicatorColor(year, currentYear, 'year')
                    )} />
                  </span>
                </button>
              );
            })}
            {canCreate && (
              <button
                onClick={() => handleCreatePlan('annual')}
                className="px-2 py-2 text-gray-400 hover:text-amber-600 rounded-t-lg transition-colors"
                title="Создать годовой план"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="border-b border-amber-300" />
        </div>

        {/* Вкладки кварталов - notebook style */}
        {selectedYear && uniqueQuarters.length > 0 && (
          <div className="px-2 pt-1.5 bg-gradient-to-b from-purple-50/30 to-transparent">
            <div className="flex flex-wrap gap-0.5 items-end">
              {uniqueQuarters.map(quarter => {
                const isSelected = selectedQuarter === quarter;
                return (
                  <button
                    key={quarter}
                    onClick={() => setSelectedQuarter(selectedQuarter === quarter ? null : quarter)}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-t-lg transition-all border-t border-l border-r relative",
                      isSelected
                        ? "bg-white border-purple-300 text-purple-700 shadow-sm z-10 -mb-px"
                        : "bg-purple-50/70 border-purple-200/50 text-gray-500 hover:bg-purple-100/70 hover:text-purple-600"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      Q{quarter}
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        getTimeIndicatorColor(quarter, currentQuarter, 'quarter', selectedYear)
                      )} />
                    </span>
                  </button>
                );
              })}
              {canCreate && selectedAnnualPlan && (
                <button
                  onClick={() => handleCreatePlan('quarterly', selectedAnnualPlan.annual_id)}
                  className="px-2 py-2 text-gray-400 hover:text-purple-600 rounded-t-lg transition-colors"
                  title="Создать квартальный план"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="border-b border-purple-300" />
          </div>
        )}

        {/* Вкладки недель - notebook style */}
        {selectedQuarter && uniqueWeekNumbers.length > 0 && (
          <div className="px-2 pt-1.5 bg-gradient-to-b from-indigo-50/30 to-transparent">
            <div className="flex flex-wrap gap-0.5 items-end">
              {uniqueWeekNumbers.map(weekNum => {
                const weekPlans = weeksForQuarter.filter(w => getWeekNumber(new Date(w.weekly_date)) === weekNum);
                const plansCount = weekPlans.length;
                const isSelected = selectedWeekNumber === weekNum;

                return (
                  <button
                    key={weekNum}
                    onClick={() => setSelectedWeekNumber(selectedWeekNumber === weekNum ? null : weekNum)}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-t-lg transition-all border-t border-l border-r relative",
                      isSelected
                        ? "bg-white border-indigo-300 text-indigo-700 shadow-sm z-10 -mb-px"
                        : "bg-indigo-50/70 border-indigo-200/50 text-gray-500 hover:bg-indigo-100/70 hover:text-indigo-600"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {weekNum}
                      {plansCount > 1 && <span className="text-xs opacity-60">({plansCount})</span>}
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        getTimeIndicatorColor(weekNum, currentWeekNum, 'week', selectedYear || currentYear)
                      )} />
                    </span>
                  </button>
                );
              })}
              {canCreate && selectedQuarterlyPlan && (
                <button
                  onClick={() => handleCreatePlan('weekly', selectedQuarterlyPlan.quarterly_id)}
                  className="px-2 py-2 text-gray-400 hover:text-indigo-600 rounded-t-lg transition-colors"
                  title="Создать недельный план"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="border-b border-indigo-300" />
          </div>
        )}

        {/* Фильтр по статусу */}
        <div className="px-3 py-2 border-b bg-gray-50/50">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setStatusFilter(null)}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded transition-colors",
                !statusFilter
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:bg-gray-200"
              )}
            >
              Все
            </button>
            {statuses.slice(0, 5).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status === statusFilter ? null : status)}
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded transition-colors",
                  status === statusFilter
                    ? "bg-gray-700 text-white"
                    : "text-gray-500 hover:bg-gray-200"
                )}
              >
                {getPlanStatusText(status)}
              </button>
            ))}
          </div>
        </div>

        {/* Список планов */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p className="text-sm">Ошибка загрузки</p>
            </div>
          ) : selectedWeekNumber ? (
            /* Уровень 3: Выбрана неделя - показываем все недельные планы этой недели */
            (() => {
              const weekPlansForNumber = weeksForQuarter.filter(w => {
                const matchesWeek = getWeekNumber(new Date(w.weekly_date)) === selectedWeekNumber;
                const matchesStatus = !statusFilter || w.status === statusFilter;
                const matchesSearch = !searchQuery || w.expected_result.toLowerCase().includes(searchQuery.toLowerCase());
                return matchesWeek && matchesStatus && matchesSearch;
              });

              if (weekPlansForNumber.length === 0) {
                return <div className="text-center py-8 text-gray-400 text-sm">Планы не найдены</div>;
              }

              return (
                <div className="space-y-1">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide px-2 py-1">
                    Недельные планы - Неделя {selectedWeekNumber} ({weekPlansForNumber.length})
                  </div>
                  {weekPlansForNumber.map(weekPlan => {
                    const weekDate = new Date(weekPlan.weekly_date);
                    const day = weekDate.getDay();
                    const diffToMonday = day === 0 ? -6 : 1 - day;
                    const monday = new Date(weekDate);
                    monday.setDate(weekDate.getDate() + diffToMonday);
                    const friday = new Date(monday);
                    friday.setDate(monday.getDate() + 4);
                    const dateRange = `${monday.getDate()}.${String(monday.getMonth() + 1).padStart(2, '0')} — ${friday.getDate()}.${String(friday.getMonth() + 1).padStart(2, '0')}`;
                    const isSelected = selectedPlan && selectedType === 'weekly' && (selectedPlan as WeeklyPlan).weekly_id === weekPlan.weekly_id;

                    // Найдем квартальный план для отображения отдела
                    const qPlan = quarterlyPlans.find(q => q.quarterly_id === weekPlan.quarterly_id);

                    return (
                      <div
                        key={weekPlan.weekly_id}
                        onClick={() => handleSelectPlan('weekly', weekPlan)}
                        className={cn(
                          "p-2 rounded-lg cursor-pointer transition-all border",
                          isSelected
                            ? "bg-indigo-50 border-indigo-200"
                            : "bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            weekPlan.status === 'active' && "bg-green-100 text-green-700",
                            weekPlan.status === 'draft' && "bg-gray-100 text-gray-600",
                            weekPlan.status === 'submitted' && "bg-blue-100 text-blue-700",
                            weekPlan.status === 'approved' && "bg-indigo-100 text-indigo-700",
                            weekPlan.status === 'completed' && "bg-emerald-100 text-emerald-700",
                            weekPlan.status === 'returned' && "bg-orange-100 text-orange-700",
                            weekPlan.status === 'failed' && "bg-red-100 text-red-700"
                          )}>
                            {getPlanStatusText(weekPlan.status)}
                          </span>
                          {qPlan?.department_name && (
                            <span className="text-[10px] text-gray-400 truncate flex-1">{qPlan.department_name}</span>
                          )}
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{dateRange}</span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">{weekPlan.expected_result}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ) : selectedQuarter ? (
            /* Уровень 2: Выбран квартал - показываем все квартальные планы */
            <div className="space-y-1">
              {filteredQuarterlyPlans.length > 0 && (
                <>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide px-2 py-1">
                    Квартальные планы Q{selectedQuarter} ({filteredQuarterlyPlans.length})
                  </div>
                  {filteredQuarterlyPlans.map(plan => {
                    const planWeeks = weeklyPlans.filter(w => w.quarterly_id === plan.quarterly_id);
                    const isSelected = selectedPlan && selectedType === 'quarterly' && (selectedPlan as QuarterlyPlan).quarterly_id === plan.quarterly_id;

                    return (
                      <div
                        key={plan.quarterly_id}
                        onClick={() => handleSelectPlan('quarterly', plan)}
                        className={cn(
                          "p-2 rounded-lg cursor-pointer transition-all border",
                          isSelected
                            ? "bg-purple-50 border-purple-200"
                            : "bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            plan.status === 'active' && "bg-green-100 text-green-700",
                            plan.status === 'draft' && "bg-gray-100 text-gray-600",
                            plan.status === 'submitted' && "bg-blue-100 text-blue-700",
                            plan.status === 'approved' && "bg-indigo-100 text-indigo-700",
                            plan.status === 'completed' && "bg-emerald-100 text-emerald-700",
                            plan.status === 'returned' && "bg-orange-100 text-orange-700",
                            plan.status === 'failed' && "bg-red-100 text-red-700"
                          )}>
                            {getPlanStatusText(plan.status)}
                          </span>
                          {plan.department_name && (
                            <span className="text-[10px] text-gray-400 truncate flex-1">{plan.department_name}</span>
                          )}
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {planWeeks.length} нед.
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">{plan.goal}</p>
                      </div>
                    );
                  })}

                  {/* Подсказка для навигации к недельным планам */}
                  <div className="text-center py-3 text-gray-400 text-xs border-t mt-2">
                    {filteredWeeklyPlans.length > 0
                      ? `Недельных планов: ${filteredWeeklyPlans.length}. Выберите неделю во вкладках выше.`
                      : 'Выберите неделю во вкладках выше для просмотра недельного плана'
                    }
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Уровень 1: Выбран только год - показываем все годовые планы */
            <div className="space-y-1">
              {filteredAnnualPlans.length > 0 && (
                <>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide px-2 py-1">
                    Годовые планы {selectedYear} ({filteredAnnualPlans.length})
                  </div>
                  {filteredAnnualPlans.map(plan => {
                    const planQuarters = quarterlyPlans.filter(q => q.annual_plan_id === plan.annual_id);
                    const isSelected = selectedPlan && selectedType === 'annual' && (selectedPlan as AnnualPlan).annual_id === plan.annual_id;

                    return (
                      <div
                        key={plan.annual_id}
                        onClick={() => handleSelectPlan('annual', plan)}
                        className={cn(
                          "p-2 rounded-lg cursor-pointer transition-all border",
                          isSelected
                            ? "bg-amber-50 border-amber-200"
                            : "bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            plan.status === 'active' && "bg-green-100 text-green-700",
                            plan.status === 'draft' && "bg-gray-100 text-gray-600",
                            plan.status === 'submitted' && "bg-blue-100 text-blue-700",
                            plan.status === 'approved' && "bg-indigo-100 text-indigo-700",
                            plan.status === 'completed' && "bg-emerald-100 text-emerald-700",
                            plan.status === 'returned' && "bg-orange-100 text-orange-700",
                            plan.status === 'failed' && "bg-red-100 text-red-700"
                          )}>
                            {getPlanStatusText(plan.status)}
                          </span>
                          {plan.author_name && (
                            <span className="text-[10px] text-gray-400 truncate flex-1">{plan.author_name}</span>
                          )}
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {planQuarters.length} кварт.
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">{plan.goal}</p>
                      </div>
                    );
                  })}

                  {/* Подсказка для навигации */}
                  <div className="text-center py-4 text-gray-400 text-xs">
                    Выберите квартал во вкладках выше для просмотра квартальных планов
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Ручка для ресайза */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300 active:bg-indigo-400 transition-colors group"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-6 w-6 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Правая панель - детали плана */}
      <div className="flex-1 overflow-y-auto bg-background">
        {selectedPlan && selectedType ? (
          <PlanDetails
            type={selectedType}
            plan={selectedPlan}
            user={user}
            onEdit={handleEditPlan}
            onClose={() => { setSelectedPlan(null); setSelectedType(null); }}
            quarterlyPlans={quarterlyPlans}
            weeklyPlans={weeklyPlans}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">Выберите план</p>
              <p className="text-sm">Кликните на план в дереве слева для просмотра деталей</p>
            </div>
          </div>
        )}
      </div>

      {/* Модальные окна */}
      {showAnnualModal && (
        <AnnualPlanModal
          isOpen={showAnnualModal}
          onClose={() => { setShowAnnualModal(false); setPlanToEdit(null); }}
          onSuccess={handleSuccess}
          planToEdit={planToEdit as AnnualPlan | null}
        />
      )}

      {showQuarterlyModal && (
        <QuarterlyPlanModal
          isOpen={showQuarterlyModal}
          onClose={() => { setShowQuarterlyModal(false); setPlanToEdit(null); }}
          onSuccess={handleSuccess}
          planToEdit={planToEdit as QuarterlyPlan | null}
          annualPlanId={parentIdForCreate || (selectedType === 'annual' && selectedPlan ? (selectedPlan as AnnualPlan).annual_id : null)}
        />
      )}

      {showWeeklyModal && (
        <WeeklyPlanModal
          isOpen={showWeeklyModal}
          onClose={() => { setShowWeeklyModal(false); setPlanToEdit(null); }}
          onSuccess={handleSuccess}
          planToEdit={planToEdit as WeeklyPlan | null}
          quarterlyPlanId={parentIdForCreate || (selectedType === 'quarterly' && selectedPlan ? (selectedPlan as QuarterlyPlan).quarterly_id : null)}
          user={user}
        />
      )}
    </div>
  );
}

// Компонент деталей плана
interface PlanDetailsProps {
  type: PlanType;
  plan: AnnualPlan | QuarterlyPlan | WeeklyPlan;
  user: UserInfo;
  onEdit: () => void;
  onClose: () => void;
  quarterlyPlans: QuarterlyPlan[];
  weeklyPlans: WeeklyPlan[];
}

function PlanDetails({ type, plan, user, onEdit, onClose, quarterlyPlans, weeklyPlans }: PlanDetailsProps) {
  const getStatusVariant = (status: PlanStatus) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'submitted': return 'info';
      case 'approved': return 'default';
      case 'active': return 'success';
      case 'completed': return 'success';
      case 'failed': return 'destructive';
      case 'returned': return 'warning';
      default: return 'secondary';
    }
  };

  const canEdit = user.role === 'chief' || user.role === 'head';

  if (type === 'annual') {
    const annualPlan = plan as AnnualPlan;
    const relatedQuarterly = quarterlyPlans.filter(q => q.annual_plan_id === annualPlan.annual_id);
    const completedQuarters = relatedQuarterly.filter(q => q.status === 'completed').length;

    return (
      <div className="p-4 overflow-y-auto max-h-full">
        {/* Компактная карточка */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-2xl">
          {/* Заголовок */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <Calendar className="h-5 w-5" />
                <span className="text-lg font-bold">{annualPlan.year}</span>
                <Badge className="bg-white/20 text-white border-white/30 text-[10px]">
                  {getPlanStatusText(annualPlan.status)}
                </Badge>
              </div>
              {canEdit && (
                <button onClick={onEdit} className="p-1.5 hover:bg-white/20 rounded transition-colors" title="Редактировать">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Контент */}
          <div className="p-4 space-y-3">
            {/* Автор */}
            {annualPlan.author_name && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-medium">
                  {annualPlan.author_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <span>{annualPlan.author_name}</span>
              </div>
            )}

            {/* Цель */}
            <div>
              <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-1">Цель</h3>
              <p className="text-sm text-gray-700">{annualPlan.goal}</p>
            </div>

            {/* Ожидаемый результат */}
            <div>
              <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-1">Ожидаемый результат</h3>
              <p className="text-sm text-gray-700">{annualPlan.expected_result}</p>
            </div>

            {/* Статистика в одну строку */}
            <div className="flex gap-4 pt-2 border-t">
              {annualPlan.budget && (
                <div className="flex items-center gap-1.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                    <span className="text-amber-600 text-xs font-bold">₽</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{(annualPlan.budget / 1000000).toFixed(1)}М</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 text-xs font-bold">Q</span>
                </div>
                <p className="text-sm font-semibold text-gray-800">{relatedQuarterly.length}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 text-xs font-bold">✓</span>
                </div>
                <p className="text-sm font-semibold text-gray-800">{completedQuarters}</p>
              </div>
            </div>

            {/* Квартальные планы */}
            {relatedQuarterly.length > 0 && (
              <div className="pt-2 border-t">
                <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-2">Кварталы</h3>
                <div className="flex flex-wrap gap-1.5">
                  {relatedQuarterly.map(q => (
                    <div key={q.quarterly_id} className={cn(
                      "px-2 py-1 rounded-md text-xs font-medium text-white",
                      q.status === 'completed' ? 'bg-green-500' :
                      q.status === 'active' ? 'bg-blue-500' :
                      q.status === 'draft' ? 'bg-gray-400' : 'bg-indigo-500'
                    )}>
                      Q{q.quarter}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'quarterly') {
    const quarterlyPlan = plan as QuarterlyPlan;
    const relatedWeekly = weeklyPlans.filter(w => w.quarterly_id === quarterlyPlan.quarterly_id);
    const completedWeeks = relatedWeekly.filter(w => w.status === 'completed').length;
    const totalPlannedHours = relatedWeekly.reduce((sum, w) => sum + (Number(w.planned_hours) || 0), 0);

    return (
      <div className="p-4 overflow-y-auto max-h-full">
        {/* Компактная карточка */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-2xl">
          {/* Заголовок */}
          <div className="bg-gradient-to-r from-purple-500 to-violet-500 px-4 py-3 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm">
                  Q{quarterlyPlan.quarter}
                </div>
                <span className="font-medium">{quarterlyPlan.department_name || 'Квартальный план'}</span>
                <Badge className="bg-white/20 text-white border-white/30 text-[10px]">
                  {getPlanStatusText(quarterlyPlan.status)}
                </Badge>
              </div>
              {canEdit && (
                <button onClick={onEdit} className="p-1.5 hover:bg-white/20 rounded transition-colors" title="Редактировать">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Контент */}
          <div className="p-4 space-y-3">
            {/* Процесс */}
            {quarterlyPlan.process_name && (
              <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-2 py-1 rounded-md w-fit">
                <span className="text-xs">Процесс:</span>
                <span className="font-medium">{quarterlyPlan.process_name}</span>
              </div>
            )}

            {/* Цель */}
            <div>
              <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-1">Цель</h3>
              <p className="text-sm text-gray-700">{quarterlyPlan.goal}</p>
            </div>

            {/* Ожидаемый результат */}
            <div>
              <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-1">Ожидаемый результат</h3>
              <p className="text-sm text-gray-700">{quarterlyPlan.expected_result}</p>
            </div>

            {/* Статистика в одну строку */}
            <div className="flex gap-4 pt-2 border-t">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Calendar className="h-3.5 w-3.5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{relatedWeekly.length}</p>
                  <p className="text-[10px] text-gray-400">недель</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 text-xs font-bold">✓</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{completedWeeks}</p>
                  <p className="text-[10px] text-gray-400">готово</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{totalPlannedHours}</p>
                  <p className="text-[10px] text-gray-400">часов</p>
                </div>
              </div>
            </div>

            {/* Недельные планы - компактный список */}
            {relatedWeekly.length > 0 && (
              <div className="pt-2 border-t">
                <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-2">Недельные планы</h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {relatedWeekly.map(w => {
                    const wDate = new Date(w.weekly_date);
                    const day = wDate.getDay();
                    const diffToMonday = day === 0 ? -6 : 1 - day;
                    const monday = new Date(wDate);
                    monday.setDate(wDate.getDate() + diffToMonday);
                    const friday = new Date(monday);
                    friday.setDate(monday.getDate() + 4);
                    const dateRange = `${monday.getDate()}.${monday.getMonth() + 1} — ${friday.getDate()}.${friday.getMonth() + 1}`;

                    return (
                      <div key={w.weekly_id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-gray-50">
                        <div className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          w.status === 'completed' ? 'bg-green-500' :
                          w.status === 'active' ? 'bg-blue-500' :
                          w.status === 'draft' ? 'bg-gray-300' : 'bg-indigo-500'
                        )} />
                        <span className="text-gray-500 w-20 flex-shrink-0">{dateRange}</span>
                        <span className="text-gray-700 truncate flex-1">{w.expected_result}</span>
                        <span className="text-gray-400 flex-shrink-0">{w.planned_hours}ч</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Weekly plan - используем специальный компонент
  return (
    <WeeklyPlanDetails
      plan={plan as WeeklyPlan}
      user={user}
      onEdit={onEdit}
      onClose={onClose}
      canEdit={canEdit}
      getStatusVariant={getStatusVariant}
      quarterlyPlans={quarterlyPlans}
    />
  );
}

// Тип для расширенной информации об исполнителе
interface AssigneeWithDetails {
  user_id: string;
  full_name: string;
  department_name: string;
  photo_base64?: string;
  role?: string;
}

// Компактная карточка недельного плана
function WeeklyPlanDetails({
  plan,
  user,
  onEdit,
  onClose,
  canEdit,
  getStatusVariant,
  quarterlyPlans
}: {
  plan: WeeklyPlan;
  user: UserInfo;
  onEdit: () => void;
  onClose: () => void;
  canEdit: boolean;
  getStatusVariant: (status: PlanStatus) => 'secondary' | 'info' | 'default' | 'success' | 'destructive' | 'warning';
  quarterlyPlans: QuarterlyPlan[];
}) {
  const [assignees, setAssignees] = useState<AssigneeWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const weekDate = new Date(plan.weekly_date);

  const linkedQuarterly = quarterlyPlans.find(q => q.quarterly_id === plan.quarterly_id);

  useEffect(() => {
    const fetchAssignees = async () => {
      setLoading(true);
      try {
        const { data: assigneeIds, error: assigneeError } = await supabase
          .from('weekly_plan_assignees')
          .select('user_id')
          .eq('weekly_plan_id', plan.weekly_id);

        if (assigneeError) throw assigneeError;

        if (assigneeIds && assigneeIds.length > 0) {
          const userIds = assigneeIds.map(a => a.user_id);
          const { data: usersData, error: usersError } = await supabase
            .from('v_user_details')
            .select('user_id, full_name, department_name, photo_base64, role')
            .in('user_id', userIds);

          if (usersError) throw usersError;
          setAssignees(usersData || []);
        } else {
          setAssignees([]);
        }
      } catch (err) {
        console.error('Ошибка загрузки исполнителей:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignees();
  }, [plan.weekly_id]);

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2);
  };

  const avatarColors = ['bg-indigo-500', 'bg-blue-500', 'bg-green-500', 'bg-pink-500', 'bg-purple-500', 'bg-teal-500'];

  // Диапазон недели
  const day = weekDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(weekDate);
  monday.setDate(weekDate.getDate() + diffToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const weekRange = `${monday.getDate()}.${monday.getMonth() + 1} — ${friday.getDate()}.${friday.getMonth() + 1}`;

  return (
    <div className="p-4 overflow-y-auto max-h-full">
      {/* Компактная карточка */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-2xl">
        {/* Заголовок */}
        <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Calendar className="h-5 w-5" />
              <span className="font-bold">{weekRange}</span>
              <Badge className="bg-white/20 text-white border-white/30 text-[10px]">
                {getPlanStatusText(plan.status)}
              </Badge>
            </div>
            {canEdit && (
              <button onClick={onEdit} className="p-1.5 hover:bg-white/20 rounded transition-colors" title="Редактировать">
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Контент */}
        <div className="p-4 space-y-3">
          {/* Связанный квартал */}
          {linkedQuarterly && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-2 py-1 rounded-md w-fit">
              <span className="font-bold">Q{linkedQuarterly.quarter}</span>
              <span className="text-xs truncate max-w-[200px]">{linkedQuarterly.goal}</span>
            </div>
          )}

          {/* Ожидаемый результат */}
          <div>
            <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-1">Ожидаемый результат</h3>
            <p className="text-sm text-gray-700">{plan.expected_result}</p>
          </div>

          {/* Статистика в одну строку */}
          <div className="flex gap-4 pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{plan.planned_hours}</p>
                <p className="text-[10px] text-gray-400">часов</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{assignees.length || plan.assignees_count || 0}</p>
                <p className="text-[10px] text-gray-400">человек</p>
              </div>
            </div>
          </div>

          {/* Исполнители - компактно */}
          {!loading && assignees.length > 0 && (
            <div className="pt-2 border-t">
              <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-2">Исполнители</h3>
              <div className="flex flex-wrap gap-1.5">
                {assignees.map((assignee, idx) => (
                  <div key={assignee.user_id} className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2 py-1">
                    {assignee.photo_base64 ? (
                      <img src={assignee.photo_base64} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-medium", avatarColors[idx % avatarColors.length])}>
                        {getInitials(assignee.full_name)}
                      </div>
                    )}
                    <span className="text-xs text-gray-700">{assignee.full_name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Компании - компактно */}
          {plan.company_names && plan.company_names.length > 0 && (
            <div className="pt-2 border-t">
              <h3 className="text-[10px] font-medium text-gray-400 uppercase mb-2">Предприятия</h3>
              <div className="flex flex-wrap gap-1">
                {plan.company_names.map((name, idx) => (
                  <span key={idx} className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

