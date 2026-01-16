import React, { useState, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { manageAnnualPlan } from '@/lib/plans/plan-service';
import { AnnualPlan, PlanStatus } from '@/types/planning';
import { getCurrentUser } from '@/lib/auth';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';
import { Modal, ErrorAlert, ModalFooter } from '@/components/ui/Modal';

interface AnnualPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  planToEdit?: AnnualPlan | null;
}

export default function AnnualPlanModal({ isOpen, onClose, onSuccess, planToEdit }: AnnualPlanModalProps) {
  const [goal, setGoal] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [budget, setBudget] = useState('');
  const [expectedResults, setExpectedResults] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [status, setStatus] = useState<PlanStatus>('draft');
  const [user, setUser] = useState<UserInfo | null>(null);

  // Получаем пользователя при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      getCurrentUser().then(setUser).catch(console.error);
    }
  }, [isOpen]);

  // Получаем текущий год и соседние годы
  const currentYear = new Date().getFullYear();
  const availableYears = [currentYear - 1, currentYear, currentYear + 1];

  // Используем хук для получения доступных статусов
  const availableStatuses = useAvailableStatuses({
    user,
    currentStatus: status,
    isEditMode,
    planType: 'annual',
  });

  // Заполнение формы данными для редактирования
  useEffect(() => {
    if (planToEdit && isOpen) {
      setGoal(planToEdit.goal);
      setYear(planToEdit.year);
      setBudget(planToEdit.budget != null ? planToEdit.budget.toString() : '');
      setExpectedResults(planToEdit.expected_result);
      setStatus(planToEdit.status);
      setIsEditMode(true);
    } else if (isOpen) {
      // Сброс формы при открытии в режиме создания
      resetForm();
      setIsEditMode(false);
    }
  }, [planToEdit, isOpen]);

  // Обработчик отправки формы
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!goal || !budget || !expectedResults) {
      setError('Пожалуйста, заполните все обязательные поля');
      return;
    }

    if (!user?.user_id) {
      setError('Пользователь не авторизован');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await manageAnnualPlan({
        userId: user.user_id,
        year: year,
        goal: goal,
        expectedResult: expectedResults,
        budget: parseFloat(budget),
        status: status,
        action: isEditMode ? 'update' : 'create',
        annualId: isEditMode ? planToEdit?.annual_id : undefined,
      });

      if (!result) {
        throw new Error('Не удалось ' + (isEditMode ? 'обновить' : 'создать') + ' годовой план');
      }

      // Сначала вызываем onSuccess для обновления данных
      onSuccess();
      // Затем закрываем модальное окно
      onClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось создать годовой план');
    } finally {
      setLoading(false);
    }
  };

  // Сброс формы
  const resetForm = () => {
    setGoal('');
    setYear(new Date().getFullYear());
    setBudget('');
    setExpectedResults('');
    setStatus('draft');
    setError(null);
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Редактирование годового плана' : 'Добавление годового плана'}
    >
      <ErrorAlert message={error} />
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex space-x-4 mb-4">
            <div className="w-1/2">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="year">
                Год*
              </label>
              <div className="flex space-x-1">
                {availableYears.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`flex-1 py-2.5 px-3 border rounded-lg transition-all ${
                      year === y 
                        ? 'bg-blue-500 text-white border-blue-600 shadow-sm' 
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => setYear(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="w-1/2">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="status">
                Статус*
              </label>
              <div className="relative">
                <select
                  id="status"
                  className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2.5 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PlanStatus)}
                  required
                >
                  {availableStatuses.map((statusOption) => (
                    <option key={statusOption.value} value={statusOption.value}>
                      {statusOption.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="goal">
              Цель*
            </label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2.5 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all h-20"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="expectedResults">
              Результат*
            </label>
            <textarea
              id="expectedResults"
              value={expectedResults}
              onChange={(e) => setExpectedResults(e.target.value)}
              className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2.5 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all h-20"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="budget">
              Бюджет ($)*
            </label>
            <div className="relative">
              <input
                id="budget"
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                min="0"
                step="0.01"
                className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2.5 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>
          </div>
          
          <ModalFooter
            onCancel={handleCancel}
            loading={loading}
            isEditMode={isEditMode}
          />
        </form>
    </Modal>
  );
}