import { supabase } from '../supabase';
import type {
  Company,
  CompanyInfrastructure,
  CompanyWithInfrastructure,
  InfrastructureHistory,
  InfrastructureParams
} from '@/types/infrastructure';
import { MONTH_NAMES } from '@/types/infrastructure';

// Запись инфраструктуры с названием компании (для редактирования)
export interface InfrastructureRecord extends CompanyInfrastructure {
  companies?: { company_name: string }[];
}

/**
 * Получение списка всех компаний
 */
export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('company_id, company_name, company_full_name, director, contract_number, contract_date, rate_per_hour')
    .order('company_name');

  if (error) throw error;
  return data || [];
}

/**
 * Получение компаний с текущей инфраструктурой (из view)
 */
export async function getCompaniesWithInfrastructure(): Promise<CompanyWithInfrastructure[]> {
  const { data, error } = await supabase
    .from('v_companies_with_infrastructure')
    .select('*')
    .order('company_name');

  if (error) throw error;
  return data || [];
}

/**
 * Получение истории инфраструктуры компании
 */
export async function getCompanyInfrastructureHistory(
  companyId: string,
  limit: number = 12
): Promise<InfrastructureHistory[]> {
  const { data, error } = await supabase
    .from('company_infrastructure')
    .select(`
      infrastructure_id,
      period_year,
      period_month,
      servers_count,
      workstations_count,
      notes,
      created_at,
      created_by,
      company_full_name,
      director,
      contract_number,
      contract_date,
      rate_per_hour
    `)
    .eq('company_id', companyId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Собираем user_id для подтягивания имён
  const userIds = Array.from(new Set((data || []).map(r => r.created_by).filter(Boolean)));
  let userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('user_profiles')
      .select('user_id, full_name')
      .in('user_id', userIds);
    if (users) {
      userMap = new Map(users.map(u => [u.user_id, u.full_name]));
    }
  }

  return (data || []).map((row) => ({
    infrastructure_id: row.infrastructure_id,
    period_year: row.period_year,
    period_month: row.period_month,
    period_label: `${MONTH_NAMES[row.period_month - 1] || ''} ${row.period_year}`,
    servers_count: row.servers_count || 0,
    workstations_count: row.workstations_count || 0,
    total_endpoints: (row.servers_count || 0) + (row.workstations_count || 0),
    notes: row.notes,
    created_at: row.created_at,
    created_by_name: (row.created_by && userMap.get(row.created_by)) || null,
    company_full_name: row.company_full_name,
    director: row.director,
    contract_number: row.contract_number,
    contract_date: row.contract_date,
    rate_per_hour: row.rate_per_hour,
  }));
}

/**
 * Управление инфраструктурой (создание, обновление, удаление)
 * Прямые CRUD через таблицу (RLS настроен, RPC имеет устаревшую сигнатуру)
 */
export async function manageInfrastructure(params: InfrastructureParams): Promise<string> {
  if (params.action === 'delete') {
    if (!params.infrastructureId) throw new Error('infrastructureId is required for delete');
    const { error } = await supabase
      .from('company_infrastructure')
      .delete()
      .eq('infrastructure_id', params.infrastructureId);
    if (error) throw error;
    return params.infrastructureId;
  }

  const record = {
    company_id: params.companyId,
    period_year: params.periodYear,
    period_month: params.periodMonth,
    servers_count: params.serversCount,
    workstations_count: params.workstationsCount,
    notes: params.notes || null,
    created_by: params.userId,
    company_full_name: params.companyFullName || null,
    director: params.director || null,
    contract_number: params.contractNumber || null,
    contract_date: params.contractDate || null,
    rate_per_hour: params.ratePerHour ?? null,
  };

  if (params.action === 'update' && params.infrastructureId) {
    const { data, error } = await supabase
      .from('company_infrastructure')
      .update(record)
      .eq('infrastructure_id', params.infrastructureId)
      .select('infrastructure_id')
      .single();
    if (error) throw error;
    return data.infrastructure_id;
  }

  // create
  const { data, error } = await supabase
    .from('company_infrastructure')
    .insert(record)
    .select('infrastructure_id')
    .single();
  if (error) throw error;
  return data.infrastructure_id;
}

/**
 * Создание записи инфраструктуры
 */
export async function createInfrastructure(
  companyId: string,
  periodYear: number,
  periodMonth: number,
  serversCount: number,
  workstationsCount: number,
  notes: string | undefined,
  userId: string,
  companyFullName?: string | null,
  director?: string | null,
  contractNumber?: string | null,
  ratePerHour?: number | null
): Promise<string> {
  return manageInfrastructure({
    action: 'create',
    companyId,
    periodYear,
    periodMonth,
    serversCount,
    workstationsCount,
    notes,
    userId,
    companyFullName,
    director,
    contractNumber,
    ratePerHour
  });
}

/**
 * Обновление записи инфраструктуры
 */
export async function updateInfrastructure(
  infrastructureId: string,
  companyId: string,
  periodYear: number,
  periodMonth: number,
  serversCount: number,
  workstationsCount: number,
  notes: string | undefined,
  userId: string,
  companyFullName?: string | null,
  director?: string | null,
  contractNumber?: string | null,
  ratePerHour?: number | null
): Promise<string> {
  return manageInfrastructure({
    action: 'update',
    infrastructureId,
    companyId,
    periodYear,
    periodMonth,
    serversCount,
    workstationsCount,
    notes,
    userId,
    companyFullName,
    director,
    contractNumber,
    ratePerHour
  });
}

/**
 * Удаление записи инфраструктуры
 */
export async function deleteInfrastructure(
  infrastructureId: string,
  userId: string
): Promise<string> {
  return manageInfrastructure({
    action: 'delete',
    infrastructureId,
    companyId: '',
    periodYear: 0,
    periodMonth: 0,
    serversCount: 0,
    workstationsCount: 0,
    userId
  });
}

/**
 * Получение инфраструктуры по ID
 */
export async function getInfrastructureById(
  infrastructureId: string
): Promise<InfrastructureRecord | null> {
  const { data, error } = await supabase
    .from('company_infrastructure')
    .select(`
      infrastructure_id,
      company_id,
      period_year,
      period_month,
      servers_count,
      workstations_count,
      notes,
      created_at,
      created_by,
      company_full_name,
      director,
      contract_number,
      contract_date,
      rate_per_hour,
      companies (
        company_name
      )
    `)
    .eq('infrastructure_id', infrastructureId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Проверка существования записи за период
 */
export async function checkInfrastructureExists(
  companyId: string,
  periodYear: number,
  periodMonth: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from('company_infrastructure')
    .select('infrastructure_id')
    .eq('company_id', companyId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle();

  if (error) throw error;
  return data?.infrastructure_id || null;
}

/**
 * Обновление реквизитов предприятия (директор, договор, нормочас, полное название)
 */
export async function updateCompanyDetails(
  companyId: string,
  data: {
    company_full_name?: string | null;
    director?: string | null;
    contract_number?: string | null;
    contract_date?: string | null;
    rate_per_hour?: number | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('companies')
    .update(data)
    .eq('company_id', companyId);

  if (error) throw error;
}

export type InfraMap = Map<string, { servers_count: number; workstations_count: number }>;

/**
 * Получение инфраструктуры всех компаний за конкретный период.
 * Если за период нет данных — fallback на последние из view.
 */
export async function getInfrastructureForPeriod(
  periodYear: number,
  periodMonth: number,
  db?: typeof supabase
): Promise<InfraMap> {
  const client = db || supabase;
  const { data, error } = await client
    .from('company_infrastructure')
    .select('company_id, servers_count, workstations_count')
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth);

  if (error) throw error;

  const result: InfraMap = new Map();

  if (data && data.length > 0) {
    for (const row of data) {
      result.set(row.company_id, {
        servers_count: row.servers_count || 0,
        workstations_count: row.workstations_count || 0,
      });
    }
    return result;
  }

  // Fallback: последние известные данные
  const { data: latest, error: latestError } = await client
    .from('v_companies_with_infrastructure')
    .select('company_id, servers_count, workstations_count');

  if (latestError) throw latestError;

  for (const row of (latest || [])) {
    result.set(row.company_id, {
      servers_count: row.servers_count || 0,
      workstations_count: row.workstations_count || 0,
    });
  }

  return result;
}
