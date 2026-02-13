import type { HourDistributionType } from '@/types/infrastructure';

export interface CompanyHourShare {
  company_id: string;
  share: number;  // доля 0..1
  hours: number;  // абсолютные часы
}

interface InfraData {
  servers_count: number;
  workstations_count: number;
}

/**
 * Рассчитывает пропорциональное распределение часов по предприятиям.
 *
 * - `even` → totalHours / N каждому
 * - `by_servers` → пропорционально servers_count
 * - `by_workstations` → пропорционально workstations_count
 *
 * Если total инфраструктуры = 0, fallback на even.
 * Последняя компания получает остаток → сумма = totalHours точно.
 */
export function calculateHourDistribution(
  totalHours: number,
  companyIds: string[],
  infraMap: Map<string, InfraData>,
  distributionType: HourDistributionType
): CompanyHourShare[] {
  if (companyIds.length === 0) return [];

  if (distributionType === 'even') {
    return distributeEvenly(totalHours, companyIds);
  }

  const field: keyof InfraData = distributionType === 'by_servers' ? 'servers_count' : 'workstations_count';

  const values = companyIds.map(id => ({
    id,
    val: infraMap.get(id)?.[field] || 0,
  }));

  const total = values.reduce((s, v) => s + v.val, 0);

  // Нет данных инфраструктуры — fallback на even
  if (total === 0) {
    return distributeEvenly(totalHours, companyIds);
  }

  const result: CompanyHourShare[] = [];
  let distributed = 0;

  for (let i = 0; i < values.length; i++) {
    const share = values[i].val / total;

    if (i === values.length - 1) {
      // Последняя компания получает остаток
      const hours = Math.round((totalHours - distributed) * 100) / 100;
      result.push({ company_id: values[i].id, share, hours });
    } else {
      const hours = Math.round(totalHours * share * 100) / 100;
      distributed += hours;
      result.push({ company_id: values[i].id, share, hours });
    }
  }

  return result;
}

function distributeEvenly(totalHours: number, companyIds: string[]): CompanyHourShare[] {
  const n = companyIds.length;
  const share = 1 / n;
  const result: CompanyHourShare[] = [];
  let distributed = 0;

  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      const hours = Math.round((totalHours - distributed) * 100) / 100;
      result.push({ company_id: companyIds[i], share, hours });
    } else {
      const hours = Math.round(totalHours * share * 100) / 100;
      distributed += hours;
      result.push({ company_id: companyIds[i], share, hours });
    }
  }

  return result;
}

/**
 * Быстро получить долю одной компании в распределении.
 * Возвращает число 0..1.
 */
export function getCompanyShare(
  companyId: string,
  allCompanyIds: string[],
  infraMap: Map<string, InfraData>,
  distributionType: HourDistributionType
): number {
  if (allCompanyIds.length === 0) return 0;
  const dist = calculateHourDistribution(1, allCompanyIds, infraMap, distributionType);
  return dist.find(d => d.company_id === companyId)?.share ?? 0;
}
