import { KPIMetric, Period } from './types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export function uniqueById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export const calculateAverageKPI = (metrics: KPIMetric[]): number => {
  if (!metrics || metrics.length === 0) return 75;
  const sum = metrics.reduce((acc, metric) => acc + metric.actual_value, 0);
  return Math.round(sum / metrics.length);
};

export const calculateKPIChange = (metrics: KPIMetric[]): number => {
  if (!metrics || metrics.length === 0) return 0;
  const validMetrics = metrics.filter(metric => metric.change_value !== null);
  if (validMetrics.length === 0) return 0;
  const sum = validMetrics.reduce((acc, metric) => acc + (metric.change_value || 0), 0);
  return Math.round(sum / validMetrics.length);
};

export const calculateKPIByCategory = (metrics: KPIMetric[], category: string): number => {
  if (!metrics || metrics.length === 0) return 80;
  const categoryMetrics = metrics.filter(metric => 
    metric.metric_name.toLowerCase().includes(category.toLowerCase()));
  if (categoryMetrics.length === 0) return 80;
  return calculateAverageKPI(categoryMetrics);
};

export const calculateKPIChangeByCategory = (metrics: KPIMetric[], category: string): number => {
  if (!metrics || metrics.length === 0) return 0;
  const categoryMetrics = metrics.filter(metric => 
    metric.metric_name.toLowerCase().includes(category.toLowerCase()));
  if (categoryMetrics.length === 0) return 0;
  return calculateKPIChange(categoryMetrics);
};

export const generatePeriods = (): Period[] => {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const periods: Period[] = [];
  periods.push({
    label: `${format(currentMonth, 'LLLL yyyy', { locale: ru })}`,
    start: format(currentMonth, 'yyyy-MM-dd'),
    end: format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd')
  });
  for (let i = 1; i <= 3; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    periods.push({
      label: `${format(monthStart, 'LLLL yyyy', { locale: ru })}`,
      start: format(monthStart, 'yyyy-MM-dd'),
      end: format(monthEnd, 'yyyy-MM-dd')
    });
  }
  return periods;
};
