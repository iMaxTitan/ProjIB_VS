import React, { useMemo } from 'react';
import { UserInfo } from '@/types/azure';
import { AnnualPlan, QuarterlyPlan, getPlanStatusGradient, getPlanStatusText, canCreateQuarterlyPlans, PlanStatus } from '@/types/planning';

interface QuarterlyPlansViewProps {
  annualPlans: AnnualPlan[];
  quarterlyPlans: QuarterlyPlan[];
  selectedAnnualPlan: string | null;
  user: UserInfo;
  statusFilter: PlanStatus | null;
  onBackClick: () => void;
  onAddPlan: () => void;
  onSelectPlan: (planId: string | null) => void; 
  onEditPlan: (plan: QuarterlyPlan) => void;
}

// --- Функция фильтрации квартальных планов ---
function filterQuarterlyPlans(
  plans: QuarterlyPlan[],
  user: UserInfo,
  selectedAnnualPlan: string | null,
  statusFilter: PlanStatus | null
) {
  return plans.filter(plan => {
    // Для всех, кроме chief — фильтруем по отделу
    if (user.role !== 'chief' && plan.department_id !== user.department_id) {
      return false;
    }
    // Если выбран статус — фильтруем по статусу (annual_plan_id уже фильтруется на сервере)
    if (statusFilter && plan.status !== statusFilter) {
      return false;
    }
    return true;
  });
}

export const QuarterlyPlansView: React.FC<QuarterlyPlansViewProps> = ({
  annualPlans,
  quarterlyPlans,
  selectedAnnualPlan,
  user,
  statusFilter,
  onBackClick,
  onAddPlan,
  onSelectPlan,
  onEditPlan
}) => {
  // Находим выбранный годовой план, если он указан
  const selectedPlan = selectedAnnualPlan 
    ? annualPlans.find(p => p.annual_id === selectedAnnualPlan) 
    : null;
  
  // --- Внутри компонента ---
  const filteredPlans = useMemo(
    () => filterQuarterlyPlans(quarterlyPlans, user, selectedAnnualPlan, statusFilter),
    [quarterlyPlans, user, selectedAnnualPlan, statusFilter]
  );
  
  return (
    <div className="space-y-6">
      {/* Заголовок с информацией о выбранном годовом плане - показываем только если выбран годовой план */}
      {selectedAnnualPlan && selectedPlan && (
        <div className="border border-gray-200 rounded-xl shadow-md overflow-hidden bg-white">
          <div 
            className="h-2 w-full rounded-t-xl"
            style={{ background: getPlanStatusGradient(selectedPlan.status) }}
          ></div>
          <div className="p-4">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-semibold text-gray-800 line-clamp-1">
                {selectedPlan.goal}
              </h3>
              <div className="flex space-x-1">
                <button 
                  onClick={onBackClick} 
                  className="py-1 px-1 rounded-full text-indigo-600 shadow-sm backdrop-blur-sm border border-indigo-200 transition-all duration-200 hover:shadow-md hover:scale-110"
                  style={{ background: 'linear-gradient(90deg, rgba(199, 210, 254, 0.5), rgba(165, 180, 252, 0.3))' }}
                  title="Назад к годовым планам"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {canCreateQuarterlyPlans(user, user?.department_id) && (
                  <button 
                    onClick={onAddPlan}
                    className="py-1 px-1 rounded-full text-indigo-600 shadow-sm backdrop-blur-sm border border-indigo-200 transition-all duration-200 hover:shadow-md hover:scale-110"
                    style={{ background: 'linear-gradient(90deg, rgba(199, 210, 254, 0.5), rgba(165, 180, 252, 0.3))' }}
                    title="Добавить квартальный план"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {/* Результат */}
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {selectedPlan.expected_result}
            </p>
            {/* Метаданные: автор, бюджет, статус */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {/* Автор */}
                <div 
                  className="inline-flex items-center rounded-full text-blue-600 shadow-sm backdrop-blur-sm border border-blue-100 overflow-hidden"
                  style={{ background: 'linear-gradient(90deg, rgba(191, 219, 254, 0.5), rgba(147, 197, 253, 0.3))' }}
                >
                  {selectedPlan.author_photo ? (
                    <>
                      <div className="h-6 w-6 flex-shrink-0 rounded-full overflow-hidden">
                        <img 
                          src={selectedPlan.author_photo} 
                          alt={selectedPlan.author_name || 'Автор'} 
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="px-2 py-1 truncate max-w-[100px] text-xs">{selectedPlan.author_name || 'Не указан'}</span>
                    </>
                  ) : (
                    <>
                      <div className="h-6 w-6 bg-blue-100 flex items-center justify-center text-blue-600 text-xs flex-shrink-0 rounded-full">
                        {selectedPlan.author_name ? selectedPlan.author_name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <span className="px-2 py-1 truncate max-w-[100px] text-xs">{selectedPlan.author_name || 'Не указан'}</span>
                    </>
                  )}
                </div>
                {/* Бюджет */}
                <div 
                  className="inline-flex items-center py-1 px-2.5 rounded-full text-blue-600 shadow-sm backdrop-blur-sm border border-blue-100"
                  style={{ background: 'linear-gradient(90deg, rgba(191, 219, 254, 0.5), rgba(147, 197, 253, 0.3))' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>${selectedPlan.budget ? selectedPlan.budget.toLocaleString() : '0'}</span>
                </div>
              </div>
              {/* Статус */}
              <span 
                className="inline-flex justify-center items-center rounded-lg py-1 px-2.5 text-xs font-medium text-white shadow-sm"
                style={{ background: getPlanStatusGradient(selectedPlan.status) }}
              >
                {getPlanStatusText(selectedPlan.status)}
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Список квартальных планов */}
      <div className="space-y-6">
        {filteredPlans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredPlans.map(plan => (
              <div
                key={plan.quarterly_id}
                className="bg-white rounded-xl shadow-md cursor-pointer hover:shadow-lg transition"
                onClick={() => onSelectPlan(plan.quarterly_id)}
                title="Показать недельные планы"
              >
                {/* Верхняя цветная полоса статуса */}
                <div className="h-2 w-full" style={{ background: getPlanStatusGradient(plan.status) }}></div>
                <div className="p-4 flex flex-col h-full">
                  {/* Заголовок с кнопкой редактирования */}
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 line-clamp-1">{plan.goal}</h3>
                    <button
                      className="py-1 px-1 rounded-full text-indigo-600 shadow-sm backdrop-blur-sm border border-indigo-200 transition-all duration-200 hover:shadow-md hover:scale-110 ml-2"
                      style={{ background: 'linear-gradient(90deg, rgba(199, 210, 254, 0.5), rgba(165, 180, 252, 0.3))' }}
                      onClick={e => { e.stopPropagation(); onEditPlan(plan); }}
                      title="Редактировать план"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 0L11.828 15.1l-2.12.636.636-2.12 9.192-9.192z" />
                      </svg>
                    </button>
                  </div>
                  {/* Описание/результат */}
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2 min-h-[40px] max-h-[40px] flex items-center">
                    {plan.expected_result}
                  </p>
                  {/* Нижняя панель с чипами */}
                  <div className="grid grid-cols-[1fr_auto] items-center text-xs mt-auto gap-2">
                    <div className="flex items-center gap-1 overflow-hidden">
                      {/* Количество недельных планов */}
                      <div className="inline-flex items-center py-1 px-2.5 rounded-full text-blue-600 bg-blue-50 border border-blue-100 text-xs flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{plan.weekly_plans_count || 0}</span>
                      </div>
                      {/* Чип отдела — без иконки */}
                      {plan.department_name && (
                        <div className="inline-flex items-center py-1 px-2.5 rounded-full text-violet-700 bg-violet-50 border border-violet-100 text-xs truncate flex-shrink-0">
                          <span className="truncate">{plan.department_name}</span>
                        </div>
                      )}
                      {/* Чип процесса — flex-1 min-w-0, без иконки */}
                      {plan.process_name && (
                        <div className="inline-flex items-center py-1 px-2.5 rounded-full text-indigo-700 bg-indigo-50 border border-indigo-100 text-xs overflow-hidden min-w-0 flex-shrink">
                          <span className="truncate">{plan.process_name}</span>
                        </div>
                      )}
                    </div>
                    {/* Статус с градиентом */}
                    <span 
                      className="inline-flex justify-center items-center rounded-lg py-1 px-2.5 text-xs font-medium text-white shadow-sm flex-shrink-0"
                      style={{ background: getPlanStatusGradient(plan.status) }}
                    >
                      {getPlanStatusText(plan.status)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="col-span-2 text-center py-10 bg-gray-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-600">Квартальных планов пока нет</p>
            {canCreateQuarterlyPlans(user, user?.department_id) && (
              <button
                onClick={onAddPlan}
                className="mt-3 px-4 py-2 rounded-lg text-indigo-600 shadow-sm backdrop-blur-sm border border-indigo-200 transition-all duration-200 hover:shadow-md text-sm font-medium"
                style={{ background: 'linear-gradient(90deg, rgba(199, 210, 254, 0.5), rgba(165, 180, 252, 0.3))' }}
              >
                Создать квартальный план
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuarterlyPlansView;
