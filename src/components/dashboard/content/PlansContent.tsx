import React, { useEffect, useRef, useCallback } from 'react';
import { UserInfo } from '@/types/azure';
import { 
  AnnualPlan, 
  QuarterlyPlan, 
  WeeklyPlan, 
  PlanStatus, 
  canCreateAnnualPlans,
  canCreateQuarterlyPlans,
  canCreateWeeklyPlans
} from '@/types/planning';
import AnnualPlanModal from '@/components/planning/AnnualPlanModal';
import QuarterlyPlanModal from '@/components/planning/QuarterlyPlanModal';
import WeeklyPlanModal from '@/components/planning/WeeklyPlanModal';
import { AnnualPlansView, QuarterlyPlansView, WeeklyPlansView } from './plans';
import { usePlans } from '@/hooks/usePlans';
import { usePlansContext } from '@/context/PlansContext';

interface PlansContentProps {
  user: UserInfo;
  currentPath: string;
  fetchPlanCounts?: () => void;
}

export default function PlansContent({ user, fetchPlanCounts }: PlansContentProps) {
  // Используем контекст планов
  const {
    activeView,
    setActiveView,
    selectedAnnualPlan,
    setSelectedAnnualPlan,
    selectedQuarterlyPlan,
    setSelectedQuarterlyPlan,
    statusFilter,
    setStatusFilter,
  } = usePlansContext();

  // Сохраняем предыдущее представление для определения направления перехода
  const prevActiveViewRef = useRef(activeView);

  // Используем хук для работы с планами
  const {
    annualPlans,
    quarterlyPlans,
    weeklyPlans,
    showPermissionError,
    setShowPermissionError,
    permissionErrorMessage,
    setPermissionErrorMessage,
    handleAnnualPlanClick,
    handleQuarterlyPlanClick,
    handlePlanSuccess,
    loading,
    error,
    fetchQuarterlyPlans,
    fetchWeeklyPlans
  } = usePlans(user);
  
  // Состояния для модальных окон
  const [showAnnualPlanModal, setShowAnnualPlanModal] = React.useState(false);
  const [showQuarterlyPlanModal, setShowQuarterlyPlanModal] = React.useState(false);
  const [showWeeklyPlanModal, setShowWeeklyPlanModal] = React.useState(false);
  const [planToEdit, setPlanToEdit] = React.useState<AnnualPlan | null>(null);
  const [quarterlyPlanToEdit, setQuarterlyPlanToEdit] = React.useState<QuarterlyPlan | null>(null);
  const [weeklyPlanToEdit, setWeeklyPlanToEdit] = React.useState<WeeklyPlan | null>(null);
  
  // Обработчики для модальных окон
  const handleAddAnnualPlan = () => {
    setPlanToEdit(null);
    setShowAnnualPlanModal(true);
  };
  
  const handleEditAnnualPlan = (plan: AnnualPlan) => {
    // Найдём актуальный план по annual_id из свежего массива annualPlans (если вдруг изменился)
    const actualPlan = annualPlans?.find(ap => ap.annual_id === plan.annual_id) || plan;
    setPlanToEdit(actualPlan);
    setShowAnnualPlanModal(true);
  };
  
  const handleAddQuarterlyPlan = () => {
    setQuarterlyPlanToEdit(null);
    setShowQuarterlyPlanModal(true);
  };
  
  const handleEditQuarterlyPlan = (plan: QuarterlyPlan) => {
    // --- Перед открытием модалки всегда ищем актуальный план по ID из свежего массива ---
    const actualPlan = quarterlyPlans.find(qp => qp.quarterly_id === plan.quarterly_id) || plan;
    setQuarterlyPlanToEdit(actualPlan);
    setShowQuarterlyPlanModal(true);
  };
  
  const handleAddWeeklyPlan = () => {
    setWeeklyPlanToEdit(null);
    setShowWeeklyPlanModal(true);
  };
  
  const handleEditWeeklyPlan = (weeklyId: string) => {
    const actualPlan = weeklyPlans?.find(wp => wp.weekly_id === weeklyId);
    if (actualPlan) {
      setWeeklyPlanToEdit(actualPlan);
      setShowWeeklyPlanModal(true);
    }
  };

  // Обработчик выбора недельного плана (поддерживает null для сброса)
  const handleSelectWeeklyPlan = (planId: string | null) => {
    if (planId) {
      handleEditWeeklyPlan(planId);
    }
  };

  // Обработчик клика по недельному плану
  const handleWeeklyPlanClick = (planId: string) => {
  };
  
  // Обработчик для возврата от недельных планов к квартальным
  const handleBackToQuarterly = () => {
    // Сбрасываем фильтр статуса при возврате
    setStatusFilter(null);
    
    // Сохраняем текущий выбранный годовой план
    const currentAnnualPlan = selectedAnnualPlan;
    
    // Сбрасываем выбранный квартальный план
    setSelectedQuarterlyPlan(null);
    
    // Устанавливаем представление на квартальные планы
    prevActiveViewRef.current = 'quarterly';
    setActiveView('quarterly');
    
    // Восстанавливаем выбранный годовой план, если он был
    if (currentAnnualPlan) {
      setSelectedAnnualPlan(currentAnnualPlan);
    }
  };
  
  // Обработчик для возврата от квартальных планов к годовым
  const handleBackToYearly = () => {
    // Сбрасываем фильтр статуса при возврате
    setStatusFilter(null);
    
    // Сбрасываем выбранные планы
    setSelectedAnnualPlan(null);
    
    // Устанавливаем представление на годовые планы
    prevActiveViewRef.current = 'yearly';
    setActiveView('yearly');
  };
  
  // Обработчик изменения фильтра статуса
  const handleStatusFilterChange = (status: PlanStatus | null) => {
    setStatusFilter(status);
  };
  
  // Обработчик закрытия уведомления об ошибке доступа
  const handleClosePermissionError = () => {
    setShowPermissionError(false);
  };

  // Обработчик выбора годового плана
  const handleSelectAnnualPlan = (planId: string | null) => {
    setStatusFilter(null); // Сбрасываем фильтр по статусу
    setSelectedAnnualPlan(planId);
    if (!planId) {
      // Если сбросили выбор годового плана (например, кнопкой "Назад")
      setActiveView('yearly');
    } else {
      setActiveView('quarterly');
      // Подгружаем квартальные планы для выбранного годового плана
      fetchQuarterlyPlans(planId ?? undefined);
    }
  };

  // Обработчик выбора квартального плана (для перехода к недельному)
  const handleSelectQuarterlyPlan = (planId: string | null) => {
    setStatusFilter(null); // Сбрасываем фильтр по статусу
    setSelectedQuarterlyPlan(planId);
    if (planId) {
      setActiveView('weekly');
      // Загрузка недельных планов должна происходить в WeeklyPlansView или useEffect
    } else {
      // Если сбросили выбор квартального плана
      setActiveView('quarterly');
    }
  };

  // Обновленные обработчики для работы с контекстом
  const handleAnnualPlanClickWithContext = (planId: string) => {
    handleAnnualPlanClick(planId);
    setSelectedAnnualPlan(planId);
    setActiveView('quarterly');
  };

  const handleQuarterlyPlanClickWithContext = (planId: string) => {
    // Проверяем, не выбран ли уже этот квартальный план
    if (selectedQuarterlyPlan === planId) {
      return; // Если план уже выбран, ничего не делаем
    }

    // Сохраняем текущие значения фильтров и выбранных планов
    const currentStatusFilter = statusFilter;
    const currentAnnualPlan = selectedAnnualPlan;
    
    // Устанавливаем выбранный квартальный план в контексте
    setSelectedQuarterlyPlan(planId);
    
    // Загружаем недельные планы для выбранного квартального плана
    // Важно: вызываем fetchWeeklyPlans до изменения activeView
    fetchWeeklyPlans(planId);
    
    // Устанавливаем представление на недельные планы
    // Важно: сначала обновляем prevActiveViewRef, чтобы предотвратить циклические обновления
    prevActiveViewRef.current = 'weekly';
    setActiveView('weekly');
    
    // Восстанавливаем значения фильтров и выбранного годового плана
    if (currentStatusFilter) {
      setStatusFilter(currentStatusFilter);
    }
    
    if (currentAnnualPlan) {
      setSelectedAnnualPlan(currentAnnualPlan);
    }
  };

  // Обработчик для загрузки активных квартальных планов с мемоизацией
  const handleQuarterlyPlansView = useCallback(() => {
    // Если выбран годовой план, загружаем квартальные планы для него
    if (selectedAnnualPlan) {
      const annualPlanId = selectedAnnualPlan;
      if (annualPlanId) {
        fetchQuarterlyPlans(annualPlanId);
      }
    } 
    // Иначе загружаем все квартальные планы (фильтрация на клиенте)
    else {
      fetchQuarterlyPlans(undefined);
    }
  }, [selectedAnnualPlan, fetchQuarterlyPlans]);

  // Обработчик для загрузки активных недельных планов с мемоизацией
  const handleWeeklyPlansView = useCallback(() => {
    // Если выбран квартальный план, загружаем недельные планы для него
    if (selectedQuarterlyPlan) {
      const quarterlyPlanId = selectedQuarterlyPlan;
      if (quarterlyPlanId) {
        fetchWeeklyPlans(quarterlyPlanId);
      }
    } 
    // Иначе загружаем все недельные планы (фильтрация на клиенте)
    else {
      fetchWeeklyPlans(undefined);
    }
  }, [selectedQuarterlyPlan, fetchWeeklyPlans]);

  // После успешного создания/редактирования — всегда обновляем планы
  const handleWeeklyPlanSuccess = () => {
    fetchWeeklyPlans();
    fetchQuarterlyPlans();
    // Можно добавить сброс выбранного плана/модалки по необходимости
  };

  // Добавляем эффект для отслеживания изменений activeView
  useEffect(() => {
    // Проверяем, действительно ли изменилось представление
    if (prevActiveViewRef.current === activeView) {
      return; // Если представление не изменилось, ничего не делаем
    }
    
    // Сбрасываем выбранные планы только если не переходим с годовых на квартальные
    // или с квартальных на недельные
    if (!(prevActiveViewRef.current === 'yearly' && activeView === 'quarterly') && 
        !(prevActiveViewRef.current === 'quarterly' && activeView === 'weekly')) {
      // Сбрасываем выбранный годовой план при изменении представления
      // Это гарантирует, что фильтры не накапливаются
      setSelectedAnnualPlan(null);
      
      // Также сбрасываем выбранный квартальный план
      setSelectedQuarterlyPlan(null);
    }
    
    // Обновляем предыдущее представление
    prevActiveViewRef.current = activeView;
    
    // Если переключились на квартальные планы, загружаем соответствующие квартальные планы
    if (activeView === 'quarterly') {
      handleQuarterlyPlansView();
    }
    
    // Если переключились на недельные планы, загружаем соответствующие недельные планы
    // только если они не были загружены в handleQuarterlyPlanClickWithContext
    if (activeView === 'weekly' && !selectedQuarterlyPlan) {
      handleWeeklyPlansView();
    }
  }, [activeView, handleWeeklyPlansView, handleQuarterlyPlansView, selectedQuarterlyPlan]);

  useEffect(() => {
    if (activeView === 'yearly' || activeView === 'quarterly' || activeView === 'weekly') {
      fetchPlanCounts?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  useEffect(() => {
    function handleOpenQuarterlyPlanModal(e: CustomEvent) {
      if (e.detail && e.detail.annualPlanId) {
        setShowQuarterlyPlanModal(true);
      }
    }
    window.addEventListener('openQuarterlyPlanModal', handleOpenQuarterlyPlanModal as EventListener);
    return () => {
      window.removeEventListener('openQuarterlyPlanModal', handleOpenQuarterlyPlanModal as EventListener);
    };
  }, [setShowQuarterlyPlanModal]);

  useEffect(() => {
    if (activeView === 'weekly' && selectedQuarterlyPlan) {
      fetchWeeklyPlans(selectedQuarterlyPlan);
    }
  }, [activeView, selectedQuarterlyPlan, fetchWeeklyPlans]);

  return (
    <div className="p-0">
      {/* Уведомление об ошибке доступа */}
      {showPermissionError && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4 rounded-md">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{permissionErrorMessage}</p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={handleClosePermissionError}
                  className="inline-flex bg-red-50 rounded-md p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <span className="sr-only">Закрыть</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Индикатор загрузки */}
      {loading && (
        <div className="flex justify-center items-center py-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {/* Сообщение об ошибке */}
      {error && !loading && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">Произошла ошибка при загрузке данных</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Основной контент */}
      <div className={loading ? 'hidden' : ''}>
        {activeView === 'yearly' && (
          <AnnualPlansView
            annualPlans={annualPlans}
            user={user}
            statusFilter={statusFilter}
            onAddPlan={handleAddAnnualPlan}
            onEditPlan={handleEditAnnualPlan}
            onSelectPlan={handleSelectAnnualPlan}
          />
        )}
        
        {activeView === 'quarterly' && (
          <div>

            <QuarterlyPlansView
              annualPlans={annualPlans}
              quarterlyPlans={quarterlyPlans}
              selectedAnnualPlan={selectedAnnualPlan} 
              user={user}
              statusFilter={statusFilter}
              onBackClick={handleBackToYearly}
              onAddPlan={handleAddQuarterlyPlan}
              onEditPlan={handleEditQuarterlyPlan}
              onSelectPlan={handleSelectQuarterlyPlan}
            />
          </div>
        )}
        
        {activeView === 'weekly' && (
  <WeeklyPlansView
    quarterlyPlans={quarterlyPlans}
    weeklyPlans={weeklyPlans}
    selectedQuarterlyPlan={selectedQuarterlyPlan}
    user={user}
    statusFilter={statusFilter}
    onBackClick={handleBackToQuarterly}
    onAddPlan={() => {
      setWeeklyPlanToEdit(null);
      setShowWeeklyPlanModal(true);
    }}
    onSelectPlan={handleSelectWeeklyPlan}
    onEditPlan={handleEditWeeklyPlan}
  />
)}
      </div>
      
      {/* Модальные окна */}
      {showAnnualPlanModal && (
        <AnnualPlanModal
          isOpen={showAnnualPlanModal}
          onClose={() => setShowAnnualPlanModal(false)}
          onSuccess={handlePlanSuccess}
          planToEdit={planToEdit}
        />
      )}
      
      {showQuarterlyPlanModal && (
        <QuarterlyPlanModal
          isOpen={showQuarterlyPlanModal}
          onClose={() => setShowQuarterlyPlanModal(false)}
          onSuccess={() => selectedAnnualPlan && fetchQuarterlyPlans(selectedAnnualPlan)}
          planToEdit={quarterlyPlanToEdit}
          annualPlanId={selectedAnnualPlan as string}
        />
      )}
      
      {showWeeklyPlanModal && (
  <WeeklyPlanModal
    isOpen={showWeeklyPlanModal}
    onClose={() => setShowWeeklyPlanModal(false)}
    onSuccess={handleWeeklyPlanSuccess}
    planToEdit={weeklyPlanToEdit}
    quarterlyPlanId={weeklyPlanToEdit ? weeklyPlanToEdit.quarterly_id : selectedQuarterlyPlan}
    user={user}
  />
)}
    </div>
  );
}
