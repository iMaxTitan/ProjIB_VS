import React from 'react';
import { getKPIBarColor } from '../../../../utils/kpi';
import { KPIData } from './types';

interface ProcessKPIChartProps {
  data: KPIData[];
}

const ProcessKPIChart: React.FC<ProcessKPIChartProps> = ({ data }) => {
  // Масштабируем высоту относительно максимального value
  const maxValue = Math.max(...data.map(item => item.actual_value || 0), 1);
  const bars = data.map((item, index) => {
    const barHeight = maxValue > 0 ? (item.actual_value / maxValue) * 90 : 0; 
    const percentForColor = item.actual_value;
    const colorName = getKPIBarColor(percentForColor);
    const barColorClass = colorName === 'red' ? 'bg-red-500' : colorName === 'yellow' ? 'bg-yellow-500' : 'bg-green-500';

    return (
      <div key={`${item.metric_id}-${index}`} className="flex flex-col items-center">
        <div
          className={`w-12 ${barColorClass} h-[${barHeight}%]`}
        ></div>
        <span className="text-xs mt-2 text-center w-16 truncate" title={item.entity_name}>
          {item.entity_name}
        </span>
        {/* ВРЕМЕННО: вывод значения actual_value для наглядности */}
        <span className="text-[10px] text-gray-500">{item.actual_value}</span>
      </div>
    );
  });

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <h3 className="text-lg font-medium mb-4">График эффективности процессов</h3>
      {/* ВРЕМЕННО: фон и масштабирование высоты для диагностики */}
      <div className="h-64 flex items-end justify-between bg-blue-50">
        {bars}
      </div>
    </div>
  );
};

export default ProcessKPIChart;
