import React, { useEffect, useState } from 'react';
import { getWeeklyPlansByQuarter, WeeklyPlan } from '@/lib/services/weekly-report-service';

interface WeeklyPlansDetailsProps {
  quarterlyId: string;
}

export const WeeklyPlansDetails: React.FC<WeeklyPlansDetailsProps> = ({ quarterlyId }) => {
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getWeeklyPlansByQuarter(quarterlyId)
      .then((data) => {
        setWeeklyPlans(data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError('Ошибка загрузки недельных задач: ' + (err?.message || err?.toString() || ''));
        setLoading(false);
      });
  }, [quarterlyId]);

  if (loading) {
    return <div className="py-3 text-gray-400">Загрузка недельных задач...</div>;
  }
  if (error) {
    return <div className="py-3 text-red-500">{error}</div>;
  }
  if (!weeklyPlans.length) {
    return <div className="py-3 text-gray-500">Нет недельных задач для этого квартала.</div>;
  }

  return (
    <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700">
      <div className="mb-2 font-semibold text-gray-800">Детализация по неделям</div>
      <div className="divide-y divide-gray-200">
        {weeklyPlans.map((plan, idx) => (
          <div key={plan.weekly_id} className="py-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-semibold">Неделя {idx + 1}</span>
              <span className="font-medium text-gray-700">{plan.expected_result}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(plan.status)}`}>{plan.status}</span>
              {plan.assignees_count !== undefined && (
                <span className="text-gray-500">Исполнителей: {plan.assignees_count}</span>
              )}
              {plan.department_name && (
                <span className="text-gray-400">{plan.department_name}</span>
              )}
              {plan.process_name && (
                <span className="text-gray-400">{plan.process_name}</span>
              )}
              <span className="text-gray-400">{formatDate(plan.weekly_date)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-700';
    case 'active':
      return 'bg-blue-100 text-blue-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'pending':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
