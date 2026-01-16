import React from 'react';
import { UserInfo } from '@/types/azure';
import { AnnualPlan, getPlanStatusColor, getPlanStatusText, canCreateAnnualPlans, getPlanStatusGradient } from '@/types/planning';
import { useRouter } from 'next/navigation';

interface AnnualPlansViewProps {
  annualPlans: AnnualPlan[];
  user: UserInfo;
  statusFilter: string | null;
  onAddPlan: () => void;
  onSelectPlan: (planId: string) => void;
  onEditPlan: (plan: AnnualPlan) => void;
}

export const AnnualPlansView: React.FC<AnnualPlansViewProps> = ({
  annualPlans,
  user,
  statusFilter,
  onAddPlan,
  onSelectPlan,
  onEditPlan
}) => {
  const router = useRouter();

  const handleSuccess = () => {
    // Обновляем данные через router.refresh()
    router.refresh();
  };

  return (
    <div className="space-y-0">
      {/* Список годовых планов */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {annualPlans.length > 0 ? (
          annualPlans
            .filter(plan => !statusFilter || plan.status === statusFilter)
            .map(plan => (
              <div 
                key={plan.annual_id} 
                className="border border-gray-200 rounded-xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden bg-white hover:bg-blue-50 transform hover:scale-[1.02]"
                onClick={() => {
                  if ((plan.quarterly_plans_count ?? 0) > 0) {
                    onSelectPlan(plan.annual_id);
                  } else {
                    // Для планов без квартальных: переход к quarterly и открытие модалки создания квартального
                    onSelectPlan(plan.annual_id); // setActiveView('quarterly') + setSelectedAnnualPlan
                    if (typeof window !== 'undefined') {
                      // Сигнал родителю открыть модалку создания квартального (через кастомный event или callback)
                      const event = new CustomEvent('openQuarterlyPlanModal', { detail: { annualPlanId: plan.annual_id } });
                      window.dispatchEvent(event);
                    }
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Верхняя полоса с цветом статуса */}
                <div 
                  className="h-2 w-full" 
                  style={{
                    background: getPlanStatusGradient(plan.status)
                  }}
                ></div>
                
                <div className="p-4">
                  {/* Заголовок с кнопкой редактирования */}
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 line-clamp-1">
                      {plan.goal}
                    </h3>
                    <div className="flex space-x-1">
                      <button 
                        className="py-1 px-1 rounded-full text-indigo-600 shadow-sm backdrop-blur-sm border border-indigo-200 transition-all duration-200 hover:shadow-md hover:scale-110"
                        style={{
                          background: 'linear-gradient(90deg, rgba(199, 210, 254, 0.5), rgba(165, 180, 252, 0.3))'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditPlan(plan);
                        }}
                        title="Редактировать план"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 0L11.828 15.1l-2.12.636.636-2.12 9.192-9.192z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {/* Основное содержимое плана */}
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {plan.expected_result}
                  </p>
                  
                  {/* Нижняя панель с метаданными */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {/* Автор */}
                      <div 
                        className="inline-flex items-center rounded-full text-blue-600 shadow-sm backdrop-blur-sm border border-blue-100 overflow-hidden"
                        style={{
                          background: 'linear-gradient(90deg, rgba(191, 219, 254, 0.5), rgba(147, 197, 253, 0.3))'
                        }}
                      >
                        {plan.author_photo ? (
                          <>
                            <div className="h-6 w-6 flex-shrink-0 rounded-full overflow-hidden">
                              <img 
                                src={plan.author_photo} 
                                alt={plan.author_name || 'Автор'} 
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <span className="px-2 py-1 truncate max-w-[100px] text-xs">{plan.author_name || 'Не указан'}</span>
                          </>
                        ) : (
                          <>
                            <div className="h-6 w-6 bg-blue-100 flex items-center justify-center text-blue-600 text-xs flex-shrink-0 rounded-full">
                              {plan.author_name ? plan.author_name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <span className="px-2 py-1 truncate max-w-[100px] text-xs">{plan.author_name || 'Не указан'}</span>
                          </>
                        )}
                      </div>
                      
                      {/* Бюджет */}
                      <div 
                        className="inline-flex items-center py-1 px-2.5 rounded-full text-blue-600 shadow-sm backdrop-blur-sm border border-blue-100"
                        style={{
                          background: 'linear-gradient(90deg, rgba(191, 219, 254, 0.5), rgba(147, 197, 253, 0.3))'
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>${plan.budget ? plan.budget.toLocaleString() : '0'}</span>
                      </div>
                      
                      {/* Количество квартальных планов */}
                      <div 
                        className="inline-flex items-center py-1 px-2.5 rounded-full text-blue-600 shadow-sm backdrop-blur-sm border border-blue-100"
                        style={{
                          background: 'linear-gradient(90deg, rgba(191, 219, 254, 0.5), rgba(147, 197, 253, 0.3))'
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>{plan.quarterly_plans_count ?? 0}</span>
                      </div>
                    </div>
                    
                    {/* Статус */}
                    <span 
                      className="inline-flex justify-center items-center rounded-lg py-1 px-2.5 text-xs font-medium text-white shadow-sm"
                      style={{
                        background: getPlanStatusGradient(plan.status)
                      }}
                    >
                      {getPlanStatusText(plan.status)}
                    </span>
                  </div>
                </div>
              </div>
            ))
        ) : (
          <div className="col-span-2 text-center py-10 bg-gray-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-600">Годовых планов пока нет</p>
            {canCreateAnnualPlans(user) && (
              <button 
                onClick={onAddPlan}
                className="mt-3 px-4 py-2 rounded-lg text-indigo-600 shadow-sm backdrop-blur-sm border border-indigo-200 transition-all duration-200 hover:shadow-md text-sm font-medium"
                style={{
                  background: 'linear-gradient(90deg, rgba(199, 210, 254, 0.5), rgba(165, 180, 252, 0.3))'
                }}
              >
                Создать годовой план
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnualPlansView;
