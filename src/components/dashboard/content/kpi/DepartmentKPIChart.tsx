import React from 'react';
import { getKPIBarColor } from '../../../../utils/kpi';
import { KPIData } from './types';

interface DepartmentKPIChartProps {
  data: KPIData[];
}

const DepartmentKPIChart: React.FC<DepartmentKPIChartProps> = ({ data }) => {
  const maxValue = Math.max(...data.map(item => item.actual_value), 1);

  return (
    <div className="h-48 flex items-end justify-around bg-indigo-50 p-2 rounded-lg">
      {data.map((item, index) => {
        const barHeightPercent = maxValue > 0 ? (item.actual_value / maxValue) * 100 : 0;
        const percentForColor = item.actual_value;
        const colorName = getKPIBarColor(percentForColor);
        const barColorClass = colorName === 'red' ? 'bg-red-500' : colorName === 'yellow' ? 'bg-yellow-500' : 'bg-green-500';

        return (
          <div key={`${item.entity_id}-${index}`} className="flex flex-col items-center w-16">
            <div
              className={`w-10 ${barColorClass} rounded-t-md h-[${barHeightPercent}%]`}
            ></div>
            <span className="text-xs mt-1 text-center w-full truncate" title={item.entity_name}>
              {item.entity_name}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default DepartmentKPIChart;
