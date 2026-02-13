'use client';

import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { InfrastructureHistory } from '@/types/infrastructure';
import { Spinner } from '@/components/ui/Spinner';

interface InfrastructureHistoryTableProps {
  history: InfrastructureHistory[];
  loading?: boolean;
  onEdit?: (item: InfrastructureHistory) => void;
  onDelete?: (infrastructureId: string) => void;
  canDelete?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export default function InfrastructureHistoryTable({
  history,
  loading = false,
  onEdit,
  onDelete,
  canDelete = false
}: InfrastructureHistoryTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const hasActions = onEdit || (canDelete && onDelete);
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <Spinner />
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
        <p className="text-sm text-gray-400">Добавьте первую запись</p>
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
                Період
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Договір
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                ₴/год
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Директор
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Серверы
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Рабочие станции
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Всего
              </th>
              <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Автор
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Дата
              </th>
              {hasActions && (
                <th scope="col" className="px-4 py-3 w-16">
                  <span className="sr-only">Действия</span>
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
                  <span className="text-sm font-medium text-gray-900">
                    {item.period_label}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600 truncate max-w-[140px] inline-block" title={item.contract_number || undefined}>
                    {item.contract_number || '—'}
                  </span>
                  {item.contract_date && (
                    <span className="block text-2xs text-gray-400">
                      від {new Date(item.contract_date).toLocaleDateString('uk-UA')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-sm text-gray-600">
                    {item.rate_per_hour != null ? `${Number(item.rate_per_hour).toFixed(2)}` : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600 truncate max-w-[120px] inline-block" title={item.director || undefined}>
                    {item.director || '—'}
                  </span>
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
                <td className="px-4 py-3 whitespace-nowrap text-center">
                  {item.created_by_name ? (
                    <span
                      title={item.created_by_name}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-2xs font-bold cursor-default"
                    >
                      {getInitials(item.created_by_name)}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-500">
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString('uk-UA')
                      : '-'}
                  </span>
                </td>
                {hasActions && (
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onEdit && index === 0 && (
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                          title="Редактировать"
                          aria-label="Редактировать"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {canDelete && onDelete && (
                        confirmDeleteId === item.infrastructure_id ? (
                          <div className="flex items-center gap-0.5 bg-red-50 rounded-lg px-0.5 py-0.5 animate-fade-in">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="Отмена удаления"
                              title="Отмена"
                              className="p-1 hover:bg-red-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { onDelete(item.infrastructure_id); setConfirmDeleteId(null); }}
                              aria-label="Подтвердить удаление"
                              title="Подтвердить"
                              className="p-1 hover:bg-red-200 rounded-lg transition-colors text-red-600 hover:text-red-800"
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.infrastructure_id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                            title="Удалить"
                            aria-label="Удалить"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )
                      )}
                    </div>
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
