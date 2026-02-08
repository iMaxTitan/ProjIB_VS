import React, { useState } from 'react';
import { PlanStatus } from '@/types/planning';
import { getStatusColorClasses } from '@/lib/utils/planning-utils';

interface QuarterlyReportCardProps {
  report: {
    quarterly_id: string;
    quarter: number;
    department_name: string;
    goal: string;
    expected_result: string;
    status: string;
    process_name: string;
    completion_percentage: number;
  };
}

export const QuarterlyReportCard: React.FC<QuarterlyReportCardProps> = ({ report }) => {
  const [expanded, setExpanded] = useState(false);
  const statusClass = getStatusColorClasses(report.status as PlanStatus);

  return (
    <div className="bg-white rounded-xl shadow-md p-5 flex flex-col gap-2 border border-gray-100 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold text-base text-indigo-700">Квартал {report.quarter}</div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusClass}`}>{report.status}</span>
      </div>
      <div className="text-sm text-gray-700 font-medium line-clamp-1">{report.goal}</div>
      <div className="text-xs text-gray-500 line-clamp-2 mb-1">{report.expected_result}</div>
      <div className="flex flex-wrap gap-2 text-xs mb-1">
        <div className="bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 text-blue-600">{report.department_name}</div>
        {report.process_name && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5 text-indigo-700">{report.process_name}</div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-2 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full"
            style={{ width: `${report.completion_percentage || 0}%` }}
          ></div>
        </div>
        <span className="text-xs font-semibold text-gray-600 min-w-[32px] text-right">{report.completion_percentage}%</span>
      </div>
      {expanded && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p><strong>Цель:</strong> {report.goal}</p>
          <p><strong>Ожидаемый результат:</strong> {report.expected_result}</p>
        </div>
      )}
      <button
        className="self-end mt-2 text-indigo-600 text-xs font-medium hover:underline focus:outline-none"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? 'Скрыть ▲' : 'Подробнее ▼'}
      </button>
    </div>
  );
};
