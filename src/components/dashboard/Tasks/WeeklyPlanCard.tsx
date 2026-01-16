import React, { useState, useEffect } from "react";
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import AddTaskModal from './AddTaskModal';
import { getTasksByWeeklyPlanId } from '@/lib/tasks/task-service';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';

interface AssigneeInfo {
  user_id: string;
  full_name: string;
  spent_hours: number;
}

interface WeeklyPlanCardProps {
  plan: {
    weekly_id: string;
    weekly_date: string;
    company_names: string[];
    planned_hours: string;
    total_spent_hours: string;
    assignees_info: AssigneeInfo[];
    expected_result?: string;
  };
  isSelected: boolean;
}

const badgeColors = [
  'bg-indigo-500', 'bg-blue-500', 'bg-green-500', 'bg-pink-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-red-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500',
];

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function getInitials(str: string) {
  return str
    .split(' ')
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2);
}

function getColor(idx: number) {
  return badgeColors[idx % badgeColors.length];
}

function getWeekRange(dateStr: string) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const startDay = pad2(monday.getDate());
  const startMonth = pad2(monday.getMonth() + 1);
  const endDay = pad2(friday.getDate());
  const endMonth = pad2(friday.getMonth() + 1);
  if (startMonth === endMonth) {
    return `${startDay}.${startMonth}-${endDay}.${endMonth}`;
  } else {
    return `${startDay}.${startMonth}-${endDay}.${endMonth}`;
  }
}

// Функция для группировки задач по дням недели
function groupTasksByDay(tasks: any[]) {
  if (!tasks || tasks.length === 0) return {};
  
  return tasks.reduce((acc: any, task: any) => {
    // Используем completed_at если есть, иначе created_at
    const dateKey = task.completed_at || task.created_at;
    if (!dateKey) return acc;
    
    // Группируем по дате в формате YYYY-MM-DD
    const dayKey = dayjs(dateKey).locale('ru').format('YYYY-MM-DD');
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(task);
    return acc;
  }, {});
}

// Функция для суммирования часов в задачах
function sumTaskHours(tasks: any[]) {
  if (!tasks || tasks.length === 0) return 0;
  return tasks.reduce((sum: number, task: any) => sum + (Number(task.spent_hours) || 0), 0);
}

// --- Новый компонент для компаний ---
const MAX_COMPANY_BADGES = 2;
const CompanyBadges: React.FC<{ companies: string[] }> = ({ companies }) => {
  if (!companies || companies.length === 0) return <span className="bg-gray-100 text-gray-400 px-2 py-1 rounded-full text-xs">—</span>;
  if (companies.length <= MAX_COMPANY_BADGES) {
    // Показываем полные названия, без truncate и max-w
    return (
      <>
        {companies.map((company, idx) => (
          <span key={company + idx} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold mr-1 inline-block" title={company}>
            {company}
          </span>
        ))}
      </>
    );
  }
  // Если компаний больше лимита
  const visible = companies.slice(0, MAX_COMPANY_BADGES);
  const hidden = companies.slice(MAX_COMPANY_BADGES);
  return (
    <>
      {visible.map((company, idx) => (
        <span key={company + idx} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold mr-1 max-w-[120px] truncate inline-block" title={company}>
          {company}
        </span>
      ))}
      <span
        className="bg-green-200 text-green-900 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer"
        title={hidden.join(', ')}
      >
        +{hidden.length}
      </span>
    </>
  );
};

const WeeklyPlanCard: React.FC<WeeklyPlanCardProps & { userId: string }> = ({ plan, userId, isSelected }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<any | null>(null);

  // Загрузка задач при монтировании компонента
  useEffect(() => {
    const fetchTasks = async () => {
      if (!plan.weekly_id) return;
      
      setLoading(true);
      try {
        const tasksData = await getTasksByWeeklyPlanId(plan.weekly_id);
        setTasks(tasksData);
      } catch (err: any) {
        console.error('Ошибка при загрузке задач:', err);
        setError(err.message || 'Не удалось загрузить задачи');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTasks();
  }, [plan.weekly_id]);

  // Обработка успешного добавления/редактирования задачи
  const handleTaskSuccess = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    // Перезагрузка задач после успешного добавления/редактирования
    if (plan.weekly_id) {
      getTasksByWeeklyPlanId(plan.weekly_id)
        .then(tasksData => setTasks(tasksData))
        .catch(err => console.error('Ошибка при обновлении задач:', err));
    }
  };

  // Открытие модального окна для редактирования задачи
  const handleEditTask = (task: any) => {
    setEditingTask(task);
  };

  // Переключение раскрытия/скрытия списка задач для дня
  const toggleDay = (day: string) => {
    setExpandedDay(expandedDay === day ? null : day);
  };

  // Группировка задач по дням
  const groupedTasks = groupTasksByDay(tasks);
  const sortedDays = Object.keys(groupedTasks).sort();
  
  const planned = Number(plan.planned_hours) || 0;
  const spent = Number(plan.total_spent_hours) || 0;
  const percent = planned > 0 ? Math.round((spent / planned) * 100) : 0;
  const progressColor = spent > planned ? 'bg-red-400' : 'bg-green-400';
  const showProgress = planned > 0;
  const weekRange = getWeekRange(plan.weekly_date);

  return (
    <div className={`relative w-full h-full bg-white rounded-2xl border border-gray-100 min-w-[18rem] max-w-xs group transition-all duration-200 p-5
      ${isSelected ? 'shadow-2xl' : 'shadow-xl'}`}>
      {isSelected && (
        <div className="absolute inset-0 z-10 bg-indigo-400/10 pointer-events-none rounded-2xl transition-all duration-200"></div>
      )}
      <button
        className={`absolute top-2 right-2 z-20 h-8 w-8 rounded-full flex items-center justify-center shadow focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-50 transition-colors ${isSelected ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}
        title="Добавить задачу"
        onClick={() => setIsModalOpen(true)}
        type="button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-lg font-bold text-gray-800">
          <CalendarDaysIcon className="w-6 h-6 text-indigo-400" />
          <span>{weekRange}</span>
        </div>
      </div>
      <div className="mb-3 min-h-[2.7em] max-h-[2.7em] overflow-hidden text-gray-800 italic leading-tight" style={{WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', display: '-webkit-box'}}>
        {plan.expected_result || '(нет данных)'}
      </div>
      <div className="flex gap-2 mb-4 items-center">
        <CompanyBadges companies={plan.company_names} />
      </div>
      <div className="flex gap-4 mb-4 items-end">
        {plan.assignees_info && plan.assignees_info.length > 0 ? (
          plan.assignees_info.map((a, idx) => (
            <div key={a.user_id} className="flex flex-col items-center">
              <div className={`w-8 h-8 flex items-center justify-center rounded-full text-white font-bold text-sm shadow-sm cursor-default ${getColor(idx + 4)}`}
                title={a.full_name}
              >
                {getInitials(a.full_name)}
              </div>
              <span className="text-xs text-gray-600 mt-1">{a.spent_hours} ч</span>
            </div>
          ))
        ) : (
          <span className="text-gray-400 italic text-xs">Нет исполнителей</span>
        )}
      </div>
      <div className="mb-4">
        <div className="text-xs font-medium text-gray-600 mb-1">
          Затрачено времени: <span className={spent > planned ? 'text-red-600 font-bold' : 'text-green-700 font-bold'}>
            {spent} из {planned} ч ({percent}%)
          </span>
        </div>
        {showProgress && (
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* Список задач по дням */}
      {loading ? (
        <div className="text-center text-gray-500 text-sm py-2">Загрузка задач...</div>
      ) : error ? (
        <div className="text-center text-red-500 text-sm py-2">{error}</div>
      ) : tasks.length > 0 ? (
        <div className="divide-y divide-gray-200 mt-4 border-t pt-3" onClick={e => e.stopPropagation()}>
          {sortedDays.map(day => {
            const dayTasks = groupedTasks[day];
            const hours = sumTaskHours(dayTasks);
            return (
              <div key={`${plan.weekly_id}-day-${day}`} className="py-1">
                {/* Заголовок дня (кликабельный) */}
                <div
                  className="flex justify-between items-center cursor-pointer hover:bg-gray-50 rounded px-1 py-1"
                  onClick={e => { e.stopPropagation(); toggleDay(day); }}
                >
                  <span className="text-sm text-gray-700 font-medium">
                    {expandedDay === day ? '▼' : '▶'} {dayjs(day).locale('ru').format('dddd')}
                  </span>
                  <span className="font-semibold text-sm text-gray-600">{hours} ч</span>
                </div>
                {/* Список задач дня (если раскрыт) */}
                {expandedDay === day && (
                  <div className="pl-4 pt-1 pb-1 space-y-1">
                    {dayTasks.map((task: any) => (
                      <div key={task.weekly_tasks_id || task.id || `task-${Math.random()}`} className="flex justify-between items-center text-sm">
                        <span className="text-gray-800 flex-1 mr-2" title={task.description}>• {task.description}</span>
                        <div className="flex items-center flex-shrink-0">
                          <span className="text-xs text-gray-500 mr-2">({task.spent_hours || 0} ч)</span>
                          <button
                            className="text-indigo-500 hover:text-indigo-800 p-0.5 rounded hover:bg-indigo-50"
                            onClick={(e) => {
                              e.stopPropagation(); // Предотвращаем всплытие события
                              handleEditTask(task);
                            }}
                            title="Редактировать задачу"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl mt-4 p-3 flex items-center justify-center border border-gray-100 text-sm text-gray-500 italic">
          Нет задач
        </div>
      )}

      {/* Модалка добавления задачи к плану */}
      <AddTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleTaskSuccess}
        weeklyPlanId={plan.weekly_id}
        userId={userId}
      />
        
      {/* Модалка редактирования задачи */}
      <AddTaskModal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSuccess={handleTaskSuccess}
        weeklyPlanId={plan.weekly_id}
        userId={userId}
        task={editingTask}
      />
    </div>
  );
};

export default WeeklyPlanCard;
