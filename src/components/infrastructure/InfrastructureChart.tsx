'use client';

import React from 'react';
import type { InfrastructureHistory } from '@/types/infrastructure';
import { Spinner } from '@/components/ui/Spinner';

interface InfrastructureChartProps {
  history: InfrastructureHistory[];
  loading?: boolean;
}

export default function InfrastructureChart({
  history,
  loading = false
}: InfrastructureChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-64 flex items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-64 flex items-center justify-center">
        <p className="text-gray-400">Нет данных для графика</p>
      </div>
    );
  }

  // Разворачиваем историю для хронологического порядка
  const chartData = [...history].reverse();

  // Находим максимальное значение для масштабирования
  const maxValue = Math.max(...chartData.map(d => d.total_endpoints), 1);

  // Короткие названия месяцев
  const shortMonthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3 sm:mb-4">Динамика инфраструктуры</h3>

      {/* Легенда */}
      <div className="flex gap-4 mb-3 sm:mb-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-purple-500" aria-hidden="true"></div>
          <span className="text-gray-600">Серверы</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-400" aria-hidden="true"></div>
          <span className="text-gray-600">Рабочие станции</span>
        </div>
      </div>

      {/* График — горизонтальный скролл на мобильных */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="relative h-48 pl-9" style={{ minWidth: `${Math.max(chartData.length * 40, 280)}px` }}>
          {/* Горизонтальные линии сетки */}
          <div className="absolute inset-y-0 left-9 right-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-t border-gray-100 w-full"></div>
            ))}
          </div>

          {/* Столбцы */}
          <div className="absolute inset-y-0 left-9 right-0 flex items-end justify-around gap-1 px-1">
            {chartData.map((item) => {
              const serversHeight = (item.servers_count / maxValue) * 100;
              const workstationsHeight = (item.workstations_count / maxValue) * 100;

              return (
                <div
                  key={item.infrastructure_id}
                  className="flex flex-col items-center flex-1 max-w-16 group relative"
                >
                  {/* Столбцы */}
                  <div className="w-full flex gap-0.5 items-end h-40">
                    <div
                      className="flex-1 bg-purple-500 rounded-t transition-colors group-hover:bg-purple-600"
                      style={{ height: `${serversHeight}%`, minHeight: item.servers_count > 0 ? '4px' : '0' }}
                      title={`Серверы: ${item.servers_count}`}
                    ></div>
                    <div
                      className="flex-1 bg-blue-400 rounded-t transition-colors group-hover:bg-blue-500"
                      style={{ height: `${workstationsHeight}%`, minHeight: item.workstations_count > 0 ? '4px' : '0' }}
                      title={`РС: ${item.workstations_count}`}
                    ></div>
                  </div>

                  {/* Подпись */}
                  <div className="mt-1.5 text-center">
                    <div className="text-2xs sm:text-xs text-gray-500 truncate">
                      {shortMonthNames[item.period_month - 1]}
                    </div>
                    <div className="text-2xs text-gray-400">
                      {item.period_year.toString().slice(-2)}
                    </div>
                  </div>

                  {/* Тултип */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    <div className="font-medium">{item.period_label}</div>
                    <div>Серверы: {item.servers_count.toLocaleString()}</div>
                    <div>РС: {item.workstations_count.toLocaleString()}</div>
                    <div className="border-t border-gray-700 mt-1 pt-1">
                      Всего: {item.total_endpoints.toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ось Y метки */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-2xs text-gray-400 w-8 text-right">
            <span>{maxValue.toLocaleString()}</span>
            <span>{Math.round(maxValue * 0.75).toLocaleString()}</span>
            <span>{Math.round(maxValue * 0.5).toLocaleString()}</span>
            <span>{Math.round(maxValue * 0.25).toLocaleString()}</span>
            <span>0</span>
          </div>
        </div>
      </div>

      {/* Итоговая статистика */}
      {chartData.length > 1 && (
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Изменение за период:</span>
            <span className={`font-medium ${chartData[chartData.length - 1].total_endpoints >= chartData[0].total_endpoints
                ? 'text-green-600'
                : 'text-red-600'
              }`}>
              {chartData[chartData.length - 1].total_endpoints >= chartData[0].total_endpoints ? '+' : ''}
              {(chartData[chartData.length - 1].total_endpoints - chartData[0].total_endpoints).toLocaleString()} од.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
