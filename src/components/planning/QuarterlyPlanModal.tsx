import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { UserInfo } from '@/types/azure';
import { manageQuarterlyPlan } from '@/lib/plans/plan-service';
import { QuarterlyPlan, PlanStatus, AnnualPlan } from '@/types/planning';
import { getCurrentUser } from '@/lib/auth';
import { useProcesses } from '@/hooks/useProcesses';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';
import { Modal, ErrorAlert, ModalFooter } from '@/components/ui/Modal';

interface QuarterlyPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  annualPlanId: string | null;
  planToEdit?: QuarterlyPlan | null;
}

export default function QuarterlyPlanModal({ isOpen, onClose, onSuccess, annualPlanId, planToEdit }: QuarterlyPlanModalProps) {
  const [quarter, setQuarter] = useState<number>(1);
  const [goal, setGoal] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [annualPlans, setAnnualPlans] = useState<AnnualPlan[]>([]);
  const [selectedAnnualPlan, setSelectedAnnualPlan] = useState<string | null>(annualPlanId);
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const { processes, loading: loadingProcesses, error: errorProcesses } = useProcesses();
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');

  // Получаем пользователя при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      getCurrentUser().then(setUser).catch(console.error);
    }
  }, [isOpen]);

  // --- Синхронизация выбранного процесса с planToEdit ---
  useEffect(() => {
    if (isOpen) {
      if (planToEdit && planToEdit.process_id) {
        setSelectedProcessId(planToEdit.process_id);
      } else {
        setSelectedProcessId('');
      }
    }
  }, [isOpen, planToEdit]);

  // Если пользователь начальник отдела — сразу выставляем его отдел
  useEffect(() => {
    if (user && user.role === 'head' && user.department_id) {
      setSelectedDepartment(user.department_id);
    }
  }, [user]);

  // Определяем, находимся ли мы в режиме редактирования
  const isEditMode = !!planToEdit;

  // Определяем роли пользователя
  const isChief = user?.role === 'chief';
  const isHead = user?.role === 'head';

  // Состояние для статуса
  const [status, setStatus] = useState<PlanStatus>('draft');

  // Используем хук для получения доступных статусов
  const availableStatuses = useAvailableStatuses({
    user,
    currentStatus: status,
    isEditMode,
    planType: 'quarterly',
  });

  // Загрузка годовых планов
  useEffect(() => {
    async function fetchAnnualPlans() {
      try {
        const { data, error } = await supabase
          .from('v_annual_plans')
          .select('*')
          .order('year', { ascending: false });

        if (error) throw error;
        setAnnualPlans(data || []);
      } catch (err) {
        console.error('Ошибка при загрузке годовых планов:', err);
      }
    }

    if (isOpen) {
      fetchAnnualPlans();
    }
  }, [isOpen]);

  // --- загрузка отделов ---
  const fetchDepartments = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('department_id, department_name');
      if (error) throw error;
      setDepartments(
        (data ?? []).map((d: any) => ({
          id: d.department_id,
          name: d.department_name,
        }))
      );
    } catch (err: any) {
      setError('Ошибка загрузки отделов: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
    }
  }, [isOpen]);

  // Заполнение формы данными для редактирования
  useEffect(() => {
    if (isOpen && planToEdit) {
      setQuarter(planToEdit.quarter || 1);
      setGoal(planToEdit.goal || '');
      setExpectedResult(planToEdit.expected_result || '');
      setSelectedAnnualPlan(planToEdit.annual_plan_id || null);
      setSelectedDepartment(planToEdit.department_id || null);
      setStatus(planToEdit.status || 'draft');
    } else if (isOpen && annualPlanId) {
      setSelectedAnnualPlan(annualPlanId);
    }
  }, [isOpen, planToEdit, annualPlanId]);

  // Обработчик отправки формы
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Для head отдел всегда user.department_id
    const departmentId = isHead && user?.department_id ? user.department_id : selectedDepartment;
    if (!quarter || !selectedAnnualPlan || !departmentId || !goal || !expectedResult || !selectedProcessId) {
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

      // Используем manageQuarterlyPlan для создания/обновления квартального плана
      const result = await manageQuarterlyPlan({
        quarterlyId: isEditMode ? planToEdit?.quarterly_id : undefined,
        annualPlanId: selectedAnnualPlan!,
        departmentId: departmentId,
        quarter,
        goal,
        expectedResult,
        status,
        process_id: selectedProcessId,
        userId: user?.user_id || '',
        action: isEditMode ? 'update' : 'create',
      });

      if (!result) {
        throw new Error(`Не удалось ${isEditMode ? 'обновить' : 'создать'} квартальный план`);
      }

      // Сначала вызываем onSuccess для обновления данных
      onSuccess();
      // Затем закрываем модальное окно
      onClose();
    } catch (err: any) {
      setError(err.message || `Не удалось ${isEditMode ? 'обновить' : 'создать'} квартальный план`);
    } finally {
      setLoading(false);
    }
  };

  // Сброс формы
  const resetForm = () => {
    setGoal('');
    setExpectedResult('');
    setQuarter(1);
    setSelectedDepartment(null);
    setSelectedAnnualPlan(annualPlanId);
    setStatus('draft');
    setSelectedProcessId('');
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
      title={isEditMode ? 'Редактирование квартального плана' : 'Добавление квартального плана'}
    >
      <ErrorAlert message={error} />
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="annualPlan">
              Годовой план*
            </label>
            <div className="relative">
              <select
                id="annualPlan"
                className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2.5 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={selectedAnnualPlan || ''}
                onChange={(e) => setSelectedAnnualPlan(e.target.value || null)}
                disabled={!!annualPlanId}
                required
              >
                <option value="">Выберите годовой план</option>
                {annualPlans.map((plan) => (
                  <option key={plan.annual_id} value={plan.annual_id}>
                    {plan.goal} ({plan.year})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-4 mb-4">
            <div className="w-1/3">
              {isChief && (
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="department">
                    Отдел*
                  </label>
                  <div className="relative">
                    <select
                      id="department"
                      className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      value={selectedDepartment || ''}
                      onChange={(e) => setSelectedDepartment(e.target.value)}
                      required
                      disabled={loading}
                    >
                      <option value="" disabled>
                        {loading ? 'Загрузка отделов...' : 'Выберите отдел'}
                      </option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
              {isHead && user?.department_name && (
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Отдел
                  </label>
                  <div className="px-4 py-2 bg-gray-100 rounded border border-gray-200 text-gray-700">
                    {user.department_name}
                  </div>
                </div>
              )}
            </div>
            
            <div className="w-1/3">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Квартал*
              </label>
              <div className="flex space-x-1">
                {[1, 2, 3, 4].map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`flex-1 py-2.5 px-3 border rounded-lg transition-all ${
                      quarter === q 
                        ? 'bg-blue-500 text-white border-blue-600 shadow-sm' 
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => setQuarter(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="w-1/3">
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
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="process">
              Процесс*
            </label>
            <div className="relative">
              <select
                id="process"
                className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={selectedProcessId}
                onChange={(e) => setSelectedProcessId(e.target.value)}
                required
                disabled={loadingProcesses}
              >
                <option value="" disabled>
                  {loadingProcesses ? 'Загрузка процессов...' : 'Выберите процесс'}
                </option>
                {processes.map((proc) => (
                  <option key={proc.process_id} value={proc.process_id}>
                    {proc.process_name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
            {errorProcesses && (
              <div className="text-red-600 text-xs mt-1">Ошибка загрузки процессов: {errorProcesses}</div>
            )}
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="goal">
              Цель*
            </label>
            <textarea
              id="goal"
              className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all h-20"
              placeholder="Введите цель квартального плана"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="expectedResult">
              Ожидаемый результат*
            </label>
            <textarea
              id="expectedResult"
              className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all h-20"
              placeholder="Введите ожидаемый результат"
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              required
            />
          </div>
          
          <ModalFooter
            onCancel={handleCancel}
            loading={loading}
            isEditMode={isEditMode}
            editLabel="Обновить"
            submitLabel="Создать"
          />
        </form>
    </Modal>
  );
}