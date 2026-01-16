import React from 'react';
import { getKPIBarColor } from '../../../../utils/kpi';

export interface KPICardProps {
  title: string;
  value: number;
  target: number;
  change: number;
  icon: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, target, change, icon }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-gray-800">{title}</h3>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-3xl font-bold">{value}%</span>
          <span className="text-gray-500 ml-2">/ {target}%</span>
        </div>
        <div
          className={`flex items-center ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}
        >
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
        {(() => {
          const percentForColor = value; 
          const barFillPercent = target > 0 ? (value / target) * 100 : 0;
          const colorName = getKPIBarColor(percentForColor);
          const barColorClass = colorName === 'red' ? 'bg-red-500' : colorName === 'yellow' ? 'bg-yellow-500' : 'bg-green-500';
          return (
            <div
              className={`h-2.5 rounded-full ${barColorClass} w-[${Math.min(barFillPercent, 100)}%]`}
            ></div>
          );
        })()}
      </div>
    </div>
  );
};

export default KPICard;
