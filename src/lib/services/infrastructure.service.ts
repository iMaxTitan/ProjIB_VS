import { supabase } from '../supabase';
import type {
  Company,
  CompanyInfrastructure,
  CompanyWithInfrastructure,
  InfrastructureHistory,
  InfrastructureParams
} from '@/types/infrastructure';

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
    .select('company_id, company_name')
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
  const { data, error } = await supabase.rpc('get_company_infrastructure_history', {
    p_company_id: companyId,
    p_limit: limit
  });

  if (error) throw error;
  return data || [];
}

/**
 * Управление инфраструктурой (создание, обновление, удаление)
 */
export async function manageInfrastructure(params: InfrastructureParams): Promise<string> {
  const { data, error } = await supabase.rpc('manage_company_infrastructure', {
    p_action: params.action,
    p_infrastructure_id: params.infrastructureId || null,
    p_company_id: params.companyId,
    p_period_year: params.periodYear,
    p_period_month: params.periodMonth,
    p_servers_count: params.serversCount,
    p_workstations_count: params.workstationsCount,
    p_notes: params.notes || null,
    p_user_id: params.userId
  });

  if (error) throw error;
  return data?.infrastructure_id || '';
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
  userId: string
): Promise<string> {
  return manageInfrastructure({
    action: 'create',
    companyId,
    periodYear,
    periodMonth,
    serversCount,
    workstationsCount,
    notes,
    userId
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
  userId: string
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
    userId
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
