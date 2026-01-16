"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/Spinner';
import { KPIData, Period } from './kpi/types';
import { generatePeriods } from './kpi/kpiUtils';
import { kpi as kpiDesign } from '@/styles/design-system';

// Мини-график для визуализации KPI
const SimpleBarChart = React.memo(({ data }: { data: KPIData[] }) => {
  if (!data || data.length === 0) return <div className="text-center text-gray-500 py-8">Данных KPI нет</div>;
  
  const maxValue = useMemo(() => 
    Math.max(...data.map(item => item.actual_value || 0), 1), [data]
  ); // Используем 1 как минимальный максимум во избежание деления на ноль

  return (
    <div className="flex justify-around items-end h-32 bg-gray-50 p-4 rounded-lg shadow-inner overflow-x-auto">
      {data.map((item, idx) => {
        const barHeightPx = Math.min(Math.round((item.actual_value / maxValue) * 112), 112); // Уменьшим макс. высоту, чтобы поместилось с отступами

        return (
          <div key={`${item.metric_id || 'metric'}-${idx}`} className="flex flex-col items-center justify-end mx-1">
            <div
              className="kpi-bar kpi-bar-gradient"
              style={{ 
                height: `${barHeightPx}px`,
                minHeight: '4px',
                width: '1.5rem',
                borderRadius: '0.375rem 0.375rem 0 0',
                background: 'linear-gradient(90deg, #6366f1, #a5b4fc)',
                transition: 'height 0.3s ease-in-out'
              }}
            ></div>
            <span className="text-xs text-gray-600 mt-1 truncate w-10 text-center" title={item.metric_name}>{item.metric_name}</span>
          </div>
        );
      })}
    </div>
  );
});

SimpleBarChart.displayName = 'SimpleBarChart';

const KPIContent: React.FC = () => {
  // Состояния для KPI
  const [kpis, setKpis] = useState<KPIData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'processes' | 'departments'>('processes');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('current');
  const [periods, setPeriods] = useState<Period[]>([]);

  useEffect(() => {
    setPeriods(generatePeriods());
    setSelectedPeriod('current');
  }, []);

  useEffect(() => {
    let isCancelled = false;
    
    const fetchKPIs = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await supabase
          .from('v_kpi_current')
          .select('*');
          
        if (isCancelled) return; // Отменяем обновление состояния если компонент размонтирован
        
        if (error) {
          setError('Ошибка загрузки KPI: ' + error.message);
          setKpis([]);
        } else {
          setKpis(data || []);
        }
      } catch (err) {
        if (!isCancelled) {
          setError('Ошибка загрузки KPI: ' + (err as Error).message);
          setKpis([]);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchKPIs();
    
    return () => {
      isCancelled = true; // Отменяем запрос при размонтировании
    };
  }, []); // Убираем selectedPeriod из зависимостей, так как он не используется в запросе

  // Фильтрация по типу сущности
  const processKPIs = useMemo(() => {
    const filtered = kpis.filter(kpi => kpi.entity_type === 'process');
    return filtered;
  }, [kpis]);
  
  const departmentKPIs = useMemo(() => {
    const filtered = kpis.filter(kpi => kpi.entity_type === 'department');
    return filtered;
  }, [kpis]);

  // Мемоизированные обработчики событий
  const handleTabChange = useCallback((tab: 'processes' | 'departments') => {
    setActiveTab(tab);
  }, []);

  const handlePeriodChange = useCallback((period: string) => {
    setSelectedPeriod(period);
  }, []);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full py-20">
        <Spinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          <p>{error}</p>
          <button
            className="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
            onClick={handleRefresh}
          >
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-0 bg-gray-50 min-h-screen">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Ключевые показатели эффективности</h1>
        <p className="text-gray-600 text-sm mb-2">Обзор ключевых показателей эффективности по процессам и отделам</p>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <div className="flex border-b">
          <button
            className={`px-4 py-2 font-medium text-sm ${activeTab === 'processes' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => handleTabChange('processes')}
          >
            Процессы
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm ${activeTab === 'departments' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => handleTabChange('departments')}
          >
            Отделы
          </button>
        </div>
        <div className="flex items-center">
          <label htmlFor="period-select" className="text-sm text-gray-600 mr-2">Период:</label>
          <select
            id="period-select"
            className="bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2"
            value={selectedPeriod}
            onChange={e => handlePeriodChange(e.target.value)}
            aria-label="Выберите период для отображения KPI"
          >
            <option value="current">Текущий месяц</option>
            {periods.slice(1).map((period, idx) => (
              <option key={`period-${idx}`} value={period.label}>{period.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        {loading ? (
          <div className="flex justify-center items-center h-40"><Spinner size="large" /></div>
        ) : error ? (
          <div className="flex flex-col items-center text-red-600">
            <span className="mb-2">{error}</span>
            <button className="text-sm underline" onClick={handleRefresh}>Обновить страницу</button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-4">
              {activeTab === 'processes' ? 'Эффективность по процессам' : 'Эффективность по отделам'}
            </h2>
            <div className="overflow-hidden"> 
              <SimpleBarChart data={activeTab === 'processes' ? processKPIs : departmentKPIs} />
            </div>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(activeTab === 'processes' ? processKPIs : departmentKPIs).map((kpi, idx) => {
                const barFillPercent = Number(kpi.target_value) > 0 ? (Number(kpi.actual_value) / Number(kpi.target_value)) * 100 : 0;
                const kpiStatus = kpiDesign.getStatus(Number(kpi.actual_value), Number(kpi.target_value));
                const statusColor = kpiDesign.getColor(kpiStatus);

                return (
                  <div key={kpi.metric_id + '-' + idx} className="bg-white p-4 rounded-lg shadow-md hover:shadow-xl transition-all duration-200 border border-gray-200">
                    <h3 className="font-medium text-gray-800 mb-2 truncate" title={kpi.metric_name}>{kpi.metric_name}</h3>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-2xl font-bold">{barFillPercent.toFixed(2)}%</span>
                      <span className="text-gray-500 ml-2">из {Number(kpi.target_value).toFixed(2)}%</span>
                      <span className={`ml-4 flex items-center ${(kpi.change_value ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {(kpi.change_value ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(Number(kpi.change_value ?? 0)).toFixed(2)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full"
                        style={{ 
                          width: `${Math.min(barFillPercent, 100)}%`,
                          backgroundColor: statusColor 
                        }}
                      ></div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500 truncate" title={kpi.metric_description || undefined}>{kpi.metric_description || 'Описание отсутствует'}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default KPIContent;
