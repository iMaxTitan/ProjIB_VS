'use client';

import React from 'react';
import type { InfrastructureHistory } from '@/types/infrastructure';

interface InfrastructureHistoryTableProps {
  history: InfrastructureHistory[];
  loading?: boolean;
  onDelete?: (infrastructureId: string) => void;
  canDelete?: boolean;
}

export default function InfrastructureHistoryTable({
  history,
  loading = false,
  onDelete,
  canDelete = false
}: InfrastructureHistoryTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex justify-center items-center">
          <svg className="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="ml-2 text-gray-500">Загрузка...</span>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="mt-4 text-gray-500">Нет данных об инфраструктуре</p>
        <p className="text-sm text-gray-400">Додайте перший запис</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Период
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Авгвери
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Рабочие станции
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Всього
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ким додано
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Дата
              </th>
              {canDelete && (
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {history.map((item, index) => (
              <tr
                key={item.infrastructure_id}
                className={index === 0 ? 'bg-blue-50' : 'hover:bg-gray-50'}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center">
                    {index === 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                        Поточний
                      </span>
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {item.period_label}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-sm text-gray-900 font-medium">
                    {item.servers_count.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-sm text-gray-900 font-medium">
                    {item.workstations_count.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-sm font-semibold text-gray-900">
                    {item.total_endpoints.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600">
                    {item.created_by_name || '-'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-500">
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString('uk-UA')
                      : '-'}
                  </span>
                </td>
                {canDelete && onDelete && (
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button
                      onClick={() => onDelete(item.infrastructure_id)}
                      className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                      title="Удалить"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Примечание последней записи */}
      {history[0]?.notes && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Примечание:</span> {history[0].notes}
          </p>
        </div>
      )}
    </div>
  );
}
