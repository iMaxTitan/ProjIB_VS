import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { UserInfo } from '@/types/azure';
import { QuarterlyPlan, WeeklyPlan, PlanStatus, PLAN_STATUSES } from '@/types/planning';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';

interface WeeklyPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: UserInfo;
  quarterlyPlanId: string | null;
  planToEdit?: WeeklyPlan | null;
}

async function fetchCompanies() {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('company_id, company_name');
    if (error) throw error;
    return (data ?? []).map((c: any) => ({ id: c.company_id, name: c.company_name }));
  } catch (err) {
    return [];
  }
}

export default function WeeklyPlanModal({ isOpen, onClose, onSuccess, user, quarterlyPlanId, planToEdit }: WeeklyPlanModalProps) {
  const [weeklyDate, setWeeklyDate] = useState<Date | null>(new Date());
  const [expectedResult, setExpectedResult] = useState('');
  const [quarterlyPlan, setQuarterlyPlan] = useState<QuarterlyPlan | null>(null);
  const [selectedQuarterlyPlan, setSelectedQuarterlyPlan] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [availableEmployees, setAvailableEmployees] = useState<{id: string, name: string, department: string, photoBase64?: string}[]>([]);
  const [availableCompanies, setAvailableCompanies] = useState<{id: string, name: string}[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PlanStatus>('draft');
  const [isEditMode, setIsEditMode] = useState(false);
  const [plannedHours, setPlannedHours] = useState<number>(planToEdit?.planned_hours ?? 0);

  // Используем хук для получения доступных статусов
  const baseStatuses = useAvailableStatuses({
    user,
    currentStatus: status,
    isEditMode,
    planType: 'weekly',
  });

  // Добавляем текущий статус, если его нет среди доступных (для корректного отображения)
  const availableStatuses = useMemo(() => {
    if (!baseStatuses.some(s => s.value === status)) {
      const current = PLAN_STATUSES.find(s => s.value === status);
      if (current) return [current, ...baseStatuses];
    }
    return baseStatuses;
  }, [baseStatuses, status]);

  useEffect(() => {
    async function fetchQuarterlyPlan() {
      if (!quarterlyPlanId) return;
      try {
        const { data, error } = await supabase
          .from('v_quarterly_plans')
          .select('*')
          .eq('quarterly_id', quarterlyPlanId)
          .single();
        if (error) throw error;
        setQuarterlyPlan(data);
      } catch (err) {
        setQuarterlyPlan(null);
      }
    }
    fetchQuarterlyPlan();
  }, [quarterlyPlanId]);

  useEffect(() => {
    async function fetchEmployees() {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('v_user_details')
          .select('user_id, full_name, department_id, department_name, role, photo_base64');
        if (user.role === 'head') {
          query = query.eq('department_id', user.department_id);
        }
        const { data, error } = await query;
        if (error) throw error;
        const employees = data.map(emp => ({
          id: emp.user_id,
          name: emp.full_name,
          department: emp.department_name || 'Не указан',
          photoBase64: emp.photo_base64
        }));
        setAvailableEmployees(employees);
      } catch (err) {
        setError('Ошибка при загрузке сотрудников');
        console.error('Ошибка при загрузке сотрудников:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchEmployees();
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      fetchCompanies().then(companies => setAvailableCompanies(companies));
    }
  }, [isOpen]);

  useEffect(() => {
    if (planToEdit && isOpen) {
      setExpectedResult(planToEdit.expected_result || '');
      setWeeklyDate(new Date(planToEdit.weekly_date));
      setStatus(planToEdit.status);
      setIsEditMode(true);
      setPlannedHours(planToEdit.planned_hours ?? 0);
      fetchAssignees(planToEdit.weekly_id);
      fetchLinkedCompanies(planToEdit.weekly_id);
    } else if (isOpen) {
      resetForm();
      setIsEditMode(false);
    }
  }, [planToEdit, isOpen]);

  useEffect(() => {
    if (planToEdit) {
      setSelectedQuarterlyPlan(planToEdit.quarterly_id);
    } else if (quarterlyPlanId) {
      setSelectedQuarterlyPlan(quarterlyPlanId);
    }
  }, [planToEdit, quarterlyPlanId, isOpen]);

  const fetchAssignees = async (weeklyPlanId: string) => {
    try {
      const { data, error } = await supabase
        .from('weekly_plan_assignees')
        .select('user_id')
        .eq('weekly_plan_id', weeklyPlanId);

      if (error) throw error;
      
      if (data && data.length > 0) {
        setAssignees(data.map(a => a.user_id));
      }
    } catch (err) {
      console.error('Ошибка при загрузке назначений:', err);
    }
  };

  const fetchLinkedCompanies = async (weeklyPlanId: string) => {
    const { data, error } = await supabase
      .from('weekly_plan_companies')
      .select('company_id')
      .eq('weekly_id', weeklyPlanId);
    if (!error && data) {
      setSelectedCompanies(data.map((c: any) => c.company_id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weeklyDate || !selectedQuarterlyPlan || !expectedResult) {
      setError('Пожалуйста, заполните все обязательные поля');
      return;
    }
    if (!user) {
      setError('Пользователь не авторизован');
      return;
    }
    const userId = user.user_id;
    if (!userId) {
      setError('Не удалось определить ID пользователя');
      return;
    }
    const departmentId = quarterlyPlan?.department_id;
    if (!departmentId) {
      setError('Не удалось определить ID отдела');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      // Формируем параметры для процедуры
      const isEdit = !!planToEdit;
      const params = {
        p_weekly_id: isEdit ? planToEdit?.weekly_id : null,
        p_quarterly_id: selectedQuarterlyPlan,
        p_department_id: departmentId,
        p_weekly_date: weeklyDate.toISOString().split('T')[0],
        p_expected_result: expectedResult,
        p_status: status,
        p_user_id: userId,
        p_assignees: assignees.length > 0 ? assignees : null,
        p_planned_hours: plannedHours,
        p_action: isEdit ? 'update' : 'create',
      };
      // Вызов процедуры manage_weekly_plan
      const { data, error } = await supabase.rpc('manage_weekly_plan', params);
      if (error || !data || data.success !== true) {
        throw new Error(data?.message || error?.message || 'Не удалось сохранить недельный план');
      }
      // Получаем корректный ID недельного плана (для новых — из data, для редактирования — из planToEdit)
      const newWeeklyId = isEdit ? planToEdit.weekly_id : data.weekly_id;
      // Сохраняем связи с компаниями
      if (selectedCompanies.length > 0) {
        // Удаляем старые связи (если редактирование)
        if (isEditMode && planToEdit) {
          await supabase.from('weekly_plan_companies').delete().eq('weekly_id', planToEdit.weekly_id);
        }
        // Вставляем новые связи
        const companyLinks = selectedCompanies.map(companyId => ({
          weekly_id: newWeeklyId,
          company_id: companyId
        }));
        if (companyLinks.length > 0) {
          await supabase.from('weekly_plan_companies').insert(companyLinks);
        }
      }
      resetForm();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Ошибка при сохранении недельного плана:', err);
      setError(err.message || 'Не удалось сохранить недельный план');
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeChange = (employeeId: string) => {
    setAssignees(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanies(prev =>
      prev.includes(companyId)
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
  };

  const resetForm = () => {
    setWeeklyDate(new Date());
    setExpectedResult('');
    setAssignees([]);
    setSelectedCompanies([]);
    setStatus('draft');
    setSelectedQuarterlyPlan(null);
    setPlannedHours(0);
  };

  // --- Получаем отсортированные списки сотрудников и предприятий с приоритетом выбранных ---
  const sortedEmployees = [...availableEmployees].sort((a, b) => {
    const aSelected = assignees.includes(a.id);
    const bSelected = assignees.includes(b.id);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
  });
  const sortedCompanies = [...availableCompanies].sort((a, b) => {
    const aSelected = selectedCompanies.includes(a.id);
    const bSelected = selectedCompanies.includes(b.id);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full relative">
        {/* Крестик для закрытия — как в AnnualPlansView */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-gray-500 hover:text-red-500 hover:bg-gray-100 transition-all shadow-sm border border-gray-200"
          title="Закрыть"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold mb-6 text-gray-900">
          {isEditMode ? 'Редактировать недельный план' : 'Создать недельный план'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="flex gap-3 items-end mb-4">
            {/* Дата недели */}
            <div className="flex-1">
              <label className="block text-gray-700 text-sm font-bold mb-1" htmlFor="weeklyDate">
                Дата недели*
              </label>
              <DatePicker
                id="weeklyDate"
                selected={weeklyDate}
                onChange={date => setWeeklyDate(date as Date)}
                dateFormat="yyyy-MM-dd"
                className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Плановые часы */}
            <div style={{minWidth:90, maxWidth:120}}>
              <label className="block text-gray-700 text-sm font-bold mb-1" htmlFor="plannedHours">
                Плановые часы*
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={plannedHours}
                onChange={e => setPlannedHours(Number(e.target.value))}
                className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Статус */}
            <div className="flex-1">
              <label className="block text-gray-700 text-sm font-bold mb-1" htmlFor="status">
                Статус*
              </label>
              <select
                id="status"
                value={status}
                onChange={e => setStatus(e.target.value as PlanStatus)}
                className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              >
                {availableStatuses.map((statusOption) => (
                  <option key={statusOption.value} value={statusOption.value}>
                    {statusOption.label}
                  </option>
                ))}
              </select>
            </div>
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
              onChange={e => setExpectedResult(e.target.value)}
              required
            />
          </div>
          {/* --- Выбор сотрудников и предприятий: flex-ряд --- */}
          <div className="flex flex-row gap-6 mb-6">
            {/* Сотрудники */}
            <div className="flex-1 min-w-0 basis-1/2">
              <label className="block font-medium mb-2">Сотрудники</label>
              <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl p-2 shadow-sm bg-white">
                {sortedEmployees.length === 0 && (
                  <div className="text-gray-400 text-sm p-4 text-center">Нет сотрудников</div>
                )}
                {sortedEmployees.map(employee => {
                  const initials = employee.name.split(' ').map(w => w[0]).join('').toUpperCase();
                  const checked = assignees.includes(employee.id);
                  return (
                    <div
                      key={employee.id}
                      className={`flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md cursor-pointer transition select-none
                        ${checked ? 'bg-blue-100 border border-blue-300 shadow-sm' : 'hover:border-blue-200'}
                      `}
                      onClick={() => handleEmployeeChange(employee.id)}
                      style={{ fontSize: 14 }}
                    >
                      {employee.photoBase64 ? (
                        <img src={employee.photoBase64} alt={employee.name} className="w-7 h-7 rounded-full object-cover border border-blue-200" />
                      ) : (
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-300 text-white text-xs font-bold">
                          {initials}
                        </span>
                      )}
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate font-medium text-gray-900" style={{ fontSize: 14 }}>{employee.name}</span>
                        <span className="truncate text-xs text-gray-500" style={{ fontSize: 12 }}>{employee.department}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="w-4 h-4 text-blue-600 bg-gray-100 border border-gray-300 rounded focus:ring-blue-400"
                        style={{ minWidth: 16, minHeight: 16 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Предприятия */}
            <div className="flex-1 min-w-0 basis-1/2">
              <label className="block font-medium mb-2">Предприятия</label>
              <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl p-2 shadow-sm bg-white">
                {sortedCompanies.length === 0 && (
                  <div className="text-gray-400 text-sm p-4 text-center">Нет предприятий</div>
                )}
                {sortedCompanies.map(company => {
                  const checked = selectedCompanies.includes(company.id);
                  return (
                    <div
                      key={company.id}
                      className={`flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md cursor-pointer transition select-none
                        ${checked ? 'bg-green-100 border border-green-300 shadow-sm' : 'hover:border-green-200'}
                      `}
                      onClick={() => handleCompanyChange(company.id)}
                      style={{ fontSize: 14 }}
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-green-300 text-white text-xs font-bold">
                        {company.name.split(' ').map(w => w[0]).join('').toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="truncate font-medium text-gray-900" style={{ fontSize: 14 }}>{company.name}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="w-4 h-4 text-green-600 bg-gray-100 border border-gray-300 rounded focus:ring-green-400"
                        style={{ minWidth: 16, minHeight: 16 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2.5 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50 transition-all"
              disabled={loading}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all shadow-sm ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Сохранение...
                </span>
              ) : (
                isEditMode ? 'Сохранить' : 'Создать'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}