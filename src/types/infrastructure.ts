/**
 * Типы для учета инфраструктуры предприятий.
 */

// Базовая информация о компании
export interface Company {
  company_id: string;
  company_name: string;
}

// Запись инфраструктуры за месяц
export interface CompanyInfrastructure {
  infrastructure_id: string;
  company_id: string;
  period_year: number;
  period_month: number;
  servers_count: number;
  workstations_count: number;
  coefficient?: number | null; // Ручной коэффициент трудоемкости (0-1)
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

// Компания с текущей инфраструктурой (из view v_companies_with_infrastructure)
export interface CompanyWithInfrastructure extends Company {
  infrastructure_id?: string | null;
  period_year?: number | null;
  period_month?: number | null;
  servers_count: number;
  workstations_count: number;
  coefficient?: number | null; // Ручной коэффициент трудоемкости (0-1)
  notes?: string | null;
  infrastructure_updated_at?: string | null;
  created_by?: string | null;

  // Вычисляемые поля
  has_servers: boolean;
  total_endpoints: number;
  total_servers: number;
  total_workstations: number;
  workstations_percentage: number;
  servers_percentage: number;
  history_records_count: number;
}

// История инфраструктуры (из RPC get_company_infrastructure_history)
export interface InfrastructureHistory {
  infrastructure_id: string;
  period_year: number;
  period_month: number;
  period_label: string; // "Январь 2026"
  servers_count: number;
  workstations_count: number;
  total_endpoints: number;
  notes?: string | null;
  created_at: string;
  created_by_name?: string | null;
}

// Параметры для создания/обновления инфраструктуры
export interface InfrastructureParams {
  action: 'create' | 'update' | 'delete';
  infrastructureId?: string;
  companyId: string;
  periodYear: number;
  periodMonth: number;
  serversCount: number;
  workstationsCount: number;
  coefficient?: number | null; // Ручной коэффициент трудоемкости (0-1)
  notes?: string;
  userId: string;
}

// Типы распределения трудозатрат
export type WorkloadDistributionType = 'ATBi7' | 'ATBi5' | 'ATB7' | 'ATB3' | 'custom';

// Информация о типе распределения
export interface WorkloadDistributionInfo {
  type: WorkloadDistributionType;
  label: string;
  description: string;
  participantsCount: number;
}

// Компании, которые исключаются из ATBi5 (по имени)
export const EXCLUDED_COMPANIES_ATBi5 = ['КФ Квитень', 'МФ Фаворит'];

// Типы распределения с метаданными
export const WORKLOAD_DISTRIBUTION_TYPES: WorkloadDistributionInfo[] = [
  {
    type: 'ATBi7',
    label: 'ATBi7',
    description: 'Все 7 предприятий по доле компьютеров',
    participantsCount: 7,
  },
  {
    type: 'ATBi5',
    label: 'ATBi5',
    description: '5 предприятий (без КФК и МФФ) по доле компьютеров',
    participantsCount: 5,
  },
  {
    type: 'ATB7',
    label: 'ATB7',
    description: 'Поровну на все 7 предприятий (1/7)',
    participantsCount: 7,
  },
  {
    type: 'ATB3',
    label: 'ATB3',
    description: 'Поровну на 3 предприятия с серверами (1/3)',
    participantsCount: 3,
  },
  {
    type: 'custom',
    label: 'Вручную',
    description: 'Выбор предприятий вручную',
    participantsCount: 0,
  },
];

// Названия месяцев (рус)
export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель',
  'Май', 'Июнь', 'Июль', 'Август',
  'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// Получить название месяца по номеру (1-12)
export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || '';
}

// Получить метку периода "Январь 2026"
export function getPeriodLabel(year: number, month: number): string {
  return `${getMonthName(month)} ${year}`;
}

// Проверить актуальность данных (не старше 60 дней)
export function isDataFresh(periodYear: number, periodMonth: number): boolean {
  const now = new Date();
  const dataDate = new Date(periodYear, periodMonth - 1, 1);
  const diffDays = Math.floor((now.getTime() - dataDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 60;
}

// Статистика по инфраструктуре
export interface InfrastructureStats {
  totalCompanies: number;
  companiesWithServers: number;
  totalServers: number;
  totalWorkstations: number;
  totalEndpoints: number;
  companiesWithFreshData: number;
  companiesWithStaleData: number;
}

// Рассчитать статистику по компаниям
export function calculateInfrastructureStats(companies: CompanyWithInfrastructure[]): InfrastructureStats {
  const companiesWithFreshData = companies.filter(
    (c) => c.period_year && c.period_month && isDataFresh(c.period_year, c.period_month)
  );

  return {
    totalCompanies: companies.length,
    companiesWithServers: companies.filter((c) => c.has_servers).length,
    totalServers: companies.reduce((sum, c) => sum + c.servers_count, 0),
    totalWorkstations: companies.reduce((sum, c) => sum + c.workstations_count, 0),
    totalEndpoints: companies.reduce((sum, c) => sum + c.total_endpoints, 0),
    companiesWithFreshData: companiesWithFreshData.length,
    companiesWithStaleData: companies.length - companiesWithFreshData.length,
  };
}
