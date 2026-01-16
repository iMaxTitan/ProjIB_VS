"use client";
import React, { useEffect, useState } from "react";
import { getWeeklyPlansWithAssigneesHours } from "@/lib/plans/plan-service";
import WeeklyPlanCard from "./WeeklyPlanCard";
import { useAuth } from '@/lib/auth';
import { GraphService } from "@/services/graph-service";
import { CalendarEvent } from "@/types/graph-types";
import AddTaskModal from "./AddTaskModal";

const WeeklyPlansTasksBoard: React.FC = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Состояние для событий календаря
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  // Состояние для модального окна добавления задачи
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  // Состояние для выбранного плана
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);

  useEffect(() => {
    if (!user?.user_id) return;
    setLoading(true);
    setError(null);
    getWeeklyPlansWithAssigneesHours(user.user_id)
      .then((data) => setPlans(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message || "Ошибка загрузки недельных планов"))
      .finally(() => setLoading(false));
  }, [user?.user_id]);

  // Загрузка событий календаря
  useEffect(() => {
    if (!user?.user_id) return;
    const loadCalendarEvents = async () => {
      setLoadingEvents(true);
      setEventsError(null);
      try {
        const now = new Date();
        const startOfPrevWeek = new Date(now);
        startOfPrevWeek.setDate(now.getDate() - now.getDay() - 6);
        startOfPrevWeek.setHours(0, 0, 0, 0);
        const endOfCurrentWeek = new Date(now);
        endOfCurrentWeek.setDate(now.getDate() + (7 - now.getDay()));
        endOfCurrentWeek.setHours(23, 59, 59, 999);
        const events = await GraphService.getCalendarEvents({
          startDate: startOfPrevWeek,
          endDate: endOfCurrentWeek
        });
        events.sort((a, b) => new Date(b.start.dateTime).getTime() - new Date(a.start.dateTime).getTime());
        setCalendarEvents(events);
      } catch (error: any) {
        setEventsError(error.message || "Ошибка загрузки событий календаря");
        console.error("Ошибка загрузки событий календаря:", error);
      } finally {
        setLoadingEvents(false);
      }
    };
    loadCalendarEvents();
  }, [user?.user_id]);

  // Форматирование даты и времени
  const formatDateTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr);
    return date.toLocaleString('ru-RU', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit'
    });
  };
  
  // Расчет длительности события в часах
  const calculateEventDuration = (event: CalendarEvent): number => {
    const startTime = new Date(event.start.dateTime).getTime();
    const endTime = new Date(event.end.dateTime).getTime();
    const durationMs = endTime - startTime;
    const durationHours = durationMs / (1000 * 60 * 60);
    return parseFloat(durationHours.toFixed(1));
  };
  
  const formatDateForInput = (dateTimeStr: string): string => {
    const date = new Date(dateTimeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const handleAddEventAsTask = (event: CalendarEvent) => {
    if (!selectedPlan) return;
    setSelectedEvent(event);
    setIsAddTaskModalOpen(true);
  };

  const handleSelectPlan = (plan: any) => {
    if (selectedPlan && selectedPlan.weekly_id === plan.weekly_id) {
      setSelectedPlan(null);
    } else {
      setSelectedPlan(plan);
    }
  };

  const handleTaskAdded = () => {
    setIsAddTaskModalOpen(false);
    setSelectedEvent(null);
    if (user?.user_id) {
      setLoading(true);
      getWeeklyPlansWithAssigneesHours(user.user_id)
        .then((data) => setPlans(Array.isArray(data) ? data : []))
        .catch((e) => setError(e.message || "Ошибка загрузки недельных планов"))
        .finally(() => setLoading(false));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-4">Недельные планы</h2>
      <div 
        className="grid gap-6" 
        style={{gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'}}
      >
        {plans.map((plan) => {
          const isSelected = selectedPlan && selectedPlan.weekly_id === plan.weekly_id;
          return (
            <div
              key={plan.weekly_id}
              className="relative transition-all duration-200 cursor-pointer flex flex-col"
              onClick={() => handleSelectPlan(plan)}
            >
              <WeeklyPlanCard plan={plan} userId={user?.user_id || ''} isSelected={isSelected} />
            </div>
          );
        })}
      </div>
      {/* Остальной функционал (например, календарь Outlook, модалка задач) оставляем без изменений */}
      {/* Таблица с событиями календаря */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">События календаря Outlook</h2>
        
        {loadingEvents && (
          <div className="flex items-center justify-center py-6 bg-gray-50 rounded-xl shadow-sm">
            <div className="flex flex-col items-center">
              <svg className="animate-spin h-6 w-6 text-indigo-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-600 text-sm">Загрузка событий календаря...</p>
            </div>
          </div>
        )}
        
        {eventsError && (
          <div className="flex items-center justify-center py-6 bg-red-50 rounded-xl shadow-sm border border-red-100">
            <div className="flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-red-600 font-medium text-sm">{eventsError}</p>
            </div>
          </div>
        )}
        
        {!loadingEvents && calendarEvents.length === 0 && !eventsError && (
          <div className="flex items-center justify-center py-6 bg-gray-50 rounded-xl shadow-sm">
            <div className="flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-600">Нет событий календаря на текущую и предыдущую неделю</p>
            </div>
          </div>
        )}
        
        {!loadingEvents && calendarEvents.length > 0 && !eventsError && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[70%]">Тема</th>
                    <th scope="col" className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[30%]">Организатор</th>
                    <th scope="col" className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">Начало</th>
                    <th scope="col" className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[60px]">Длит.</th>
                    {selectedPlan && (
                      <th scope="col" className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[60px]">Добавить</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {calendarEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2 max-w-[70%] truncate">
                        <div className="text-sm font-medium text-gray-900 truncate" title={event.subject}>
                          {event.subject}
                        </div>
                      </td>
                      <td className="px-2 py-2 max-w-[30%] truncate">
                        <div className="text-sm text-gray-700 truncate" title={event.organizer?.emailAddress.name || 'Н/Д'}>
                          {event.organizer?.emailAddress.name || 'Н/Д'}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap w-[120px]">
                        <div className="text-sm text-gray-700">{formatDateTime(event.start.dateTime)}</div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap w-[60px]">
                        <div className="text-sm text-gray-700">{calculateEventDuration(event)} ч</div>
                      </td>
                      {selectedPlan && (
                        <td className="px-2 py-2 text-center w-[60px]">
                          <button 
                            onClick={() => handleAddEventAsTask(event)}
                            className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-50 transition-colors"
                            title="Добавить в план"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      {/* Модальное окно добавления задачи из события */}
      {isAddTaskModalOpen && selectedEvent && selectedPlan && (
        <AddTaskModal
          isOpen={isAddTaskModalOpen}
          onClose={() => {
            setIsAddTaskModalOpen(false);
            setSelectedEvent(null);
          }}
          onSuccess={handleTaskAdded}
          weeklyPlanId={selectedPlan.weekly_id || selectedPlan.id || selectedPlan.weekly_plan_id}
          userId={user?.user_id || ''}
          task={{
            description: selectedEvent.subject,
            spent_hours: calculateEventDuration(selectedEvent),
            completed_at: formatDateForInput(selectedEvent.start.dateTime),
            attachment_url: selectedEvent.onlineMeetingUrl || selectedEvent.onlineMeeting?.joinUrl || '',
          }}
        />
      )}
    </div>
  );
};

export default WeeklyPlansTasksBoard;
