import React from 'react';
import { UserInfo } from '@/types/azure';
import { QuarterlyPlan, WeeklyPlan, getPlanStatusGradient, getPlanStatusText, canCreateWeeklyPlans } from '@/types/planning';

interface WeeklyPlansViewProps {
  quarterlyPlans: QuarterlyPlan[];
  weeklyPlans: WeeklyPlan[];
  selectedQuarterlyPlan: string | null;
  user: UserInfo;
  statusFilter: string | null;
  onBackClick: () => void;
  onAddPlan: () => void;
  onSelectPlan: (planId: string | null) => void;
  onEditPlan: (planId: string) => void;
}

export const WeeklyPlansView: React.FC<WeeklyPlansViewProps> = ({
  quarterlyPlans,
  weeklyPlans,
  selectedQuarterlyPlan,
  user,
  statusFilter,
  onBackClick,
  onAddPlan,
  onSelectPlan,
  onEditPlan
}) => {
  const selectedPlan = selectedQuarterlyPlan 
    ? quarterlyPlans.find(p => p.quarterly_id === selectedQuarterlyPlan)
    : null;
  
  // Мемоизированная фильтрация недельных планов по бизнес-логике:
  // - если выбран статус — только по статусу и отделу
  // - если выбран квартал — только по кварталу и отделу
  // - иначе — все планы пользователя/отдела
  const filteredPlans = React.useMemo(() => {
    if (statusFilter) {
      return weeklyPlans.filter(plan =>
        (user.role === 'chief' || plan.department_id === user.department_id) &&
        plan.status === statusFilter
      );
    }
    if (selectedQuarterlyPlan) {
      return weeklyPlans.filter(plan =>
        (user.role === 'chief' || plan.department_id === user.department_id) &&
        plan.quarterly_id === selectedQuarterlyPlan
      );
    }
    return weeklyPlans.filter(plan =>
      user.role === 'chief' || plan.department_id === user.department_id
    );
  }, [weeklyPlans, user.role, user.department_id, statusFilter, selectedQuarterlyPlan]);
  
  // Функция форматирования даты недели
  const formatWeekDate = (plan: WeeklyPlan) => {
    // Используем weekly_date для расчета начала и конца недели
    const weekDate = new Date(plan.weekly_date);
    
    // Получаем понедельник текущей недели
    const weekStart = new Date(weekDate);
    const day = weekDate.getDay();
    const diff = weekDate.getDate() - day + (day === 0 ? -6 : 1); // Корректировка для воскресенья
    weekStart.setDate(diff);
    
    // Получаем воскресенье текущей недели
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    // Форматируем даты в виде "DD.MM - DD.MM"
    return `${weekStart.getDate().toString().padStart(2, '0')}.${(weekStart.getMonth() + 1).toString().padStart(2, '0')} - ${weekEnd.getDate().toString().padStart(2, '0')}.${(weekEnd.getMonth() + 1).toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="space-y-6">
      {/* Заголовок с информацией о выбранном квартальном плане - показываем только если выбран квартальный план */}
      {selectedPlan && (
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
                  title="Назад к квартальным планам"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {canCreateWeeklyPlans(user, user?.department_id) && (
                  <button 
                    onClick={onAddPlan}
                    className="py-1 px-1 rounded-full text-indigo-600 shadow-sm backdrop-blur-sm border border-indigo-200 transition-all duration-200 hover:shadow-md hover:scale-110"
                    style={{ background: 'linear-gradient(90deg, rgba(199, 210, 254, 0.5), rgba(165, 180, 252, 0.3))' }}
                    title="Добавить недельный план"
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
            {/* Метаданные: отдел, процесс и статус */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {/* Отдел */}
                <div
                  className="inline-flex items-center rounded-full text-blue-600 shadow-sm backdrop-blur-sm border border-blue-100 px-2 py-1"
                  style={{ background: 'linear-gradient(90deg, rgba(191, 219, 254, 0.5), rgba(147, 197, 253, 0.3))' }}
                >
                  <span className="truncate max-w-[100px] text-xs">{selectedPlan.department_name || 'Не указан'}</span>
                </div>
                {/* Процесс */}
                {selectedPlan.process_name && (
                  <div className="flex items-center text-xs text-blue-700 mt-0.5">
                    <svg className="h-4 w-4 mr-1 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2a4 4 0 014-4h3" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    <span className="truncate" title={selectedPlan.process_name}>{selectedPlan.process_name}</span>
                  </div>
                )}
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
      
      {/* Список недельных планов */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredPlans.length > 0 ? (
          filteredPlans
            .map(plan => (
              <div 
                key={plan.weekly_id} 
                className="border border-gray-200 rounded-xl bg-white shadow hover:shadow-lg transition-all duration-200 cursor-pointer hover:bg-blue-50 transform hover:scale-[1.01] relative"
                onClick={() => onSelectPlan(plan.weekly_id)}
              >
                {/* Верхняя полоса с цветом статуса */}
                <div 
                  className="h-2 w-full rounded-t-xl"
                  style={{ background: getPlanStatusGradient(plan.status) }}
                ></div>
                
                {/* Кнопка редактирования — закреплена в правом верхнем углу */}
                <button
                  className="absolute top-3 right-3 z-10 p-1 rounded-full text-indigo-600 shadow-sm backdrop-blur-sm border border-indigo-200 transition-all duration-200 hover:shadow-md hover:scale-110"
                  style={{
                    background: 'linear-gradient(90deg, rgba(199, 210, 254, 0.5), rgba(165, 180, 252, 0.3))'
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    onEditPlan(plan.weekly_id);
                  }}
                  title="Редактировать недельный план"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 0L11.828 15.1l-2.12.636.636-2.12 9.192-9.192z" />
                  </svg>
                </button>
                
                {/* Весь остальной контент с p-4 */}
                <div className="p-4 relative">
                  {/* Заголовок и описание */}
                  <div className="mb-2">
                    <div className="text-sm text-gray-600 line-clamp-2 overflow-hidden" style={{ minHeight: '40px', maxHeight: '40px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{plan.expected_result}</div>
                  </div>
                  {/* Нижняя строка: чипы и статус */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex gap-2 flex-wrap">
                      {/* Неделя */}
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100 min-w-max flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {formatWeekDate(plan)}
                      </span>
                      {/* Сотрудники */}
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100 min-w-max flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {plan.assignees_count || 0}
                      </span>
                      {/* Часы */}
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100 min-w-max flex items-center gap-1">
                        <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l2 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                        </svg>
                        {plan.planned_hours ?? 0}
                      </span>
                      {/* Компании */}
                      {plan.company_names && plan.company_names.length > 0 && (
                        <>
                          {plan.company_names?.slice(0, 2).map((name: string, idx: number) => {
                            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
                            return (
                              <span
                                key={name + idx}
                                className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100 min-w-max truncate"
                                title={name}
                              >
                                {plan.company_names?.length === 1 ? name : initials}
                              </span>
                            );
                          })}
                          {plan.company_names && plan.company_names.length > 2 && (
                            <span
                              className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium border border-green-200 min-w-max"
                              title={plan.company_names?.slice(2).join(', ')}
                            >
                              +{plan.company_names?.length - 2}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {/* Статус */}
                    <span 
                      className="ml-auto px-3 py-1 rounded text-xs font-semibold text-white shadow-sm"
                      style={{ background: getPlanStatusGradient(plan.status as any) }}
                    >
                      {getPlanStatusText(plan.status as any)}
                    </span>
                  </div>
                </div>
              </div>
            ))
        ) : (
          <div className="col-span-2 text-center py-10 bg-gray-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-600">Нет недельных планов по выбранному фильтру</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeeklyPlansView;
