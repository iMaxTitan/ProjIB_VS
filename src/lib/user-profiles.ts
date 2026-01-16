import { supabase } from './supabase';
import { SupabaseUserInfo, UserRole } from '@/types/supabase';
import { AzureUserInfo, UserInfo } from '@/types/azure';

/**
 * Объединяет данные пользователя из Azure AD и Supabase
 * @param azureUser Данные из Azure AD
 * @param supabaseUser Данные из Supabase
 * @returns Объединенные данные пользователя
 */
export function combineUserInfo(azureUser: AzureUserInfo, supabaseUser: SupabaseUserInfo): UserInfo {
  return {
    // Данные из Azure AD
    id: azureUser.id,
    name: azureUser.name,
    email: azureUser.email,
    displayName: azureUser.displayName,
    jobTitle: azureUser.jobTitle,
    departmentAD: azureUser.departmentAD,
    division: azureUser.division,
    photo: azureUser.photo,
    accessToken: azureUser.accessToken,
    idToken: azureUser.idToken,

    // Данные из Supabase
    user_id: supabaseUser.user_id || '',
    role: (supabaseUser.role as UserRole) || 'employee',
    department_id: supabaseUser.department_id,
    department_name: supabaseUser.department_name
  };
}

/**
 * Синхронизирует данные текущего пользователя между Azure AD и Supabase
 * @param azureUser Данные пользователя из Azure AD
 * @returns Данные пользователя из Supabase или null в случае ошибки
 */
export async function syncCurrentUser(azureUser: AzureUserInfo): Promise<SupabaseUserInfo | null> {
  try {
    // 1. Проверяем существование пользователя в Supabase
    const { data: existingUser, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', azureUser.email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 - not found
      console.error('Error fetching user:', fetchError);
      return null;
    }

    // 2. Подготавливаем данные для обновления/создания
    const userData = {
      email: azureUser.email,
      display_name: azureUser.displayName,
      job_title: azureUser.jobTitle || null,
      department_ad: azureUser.departmentAD || null,
      division: azureUser.division || null,
      photo_base64: azureUser.photo || null,
      // Сохраняем существующую роль, если пользователь уже есть
      role: existingUser?.role || 'employee',
      // Сохраняем существующий department_id, если пользователь уже есть
      department_id: existingUser?.department_id || null
    };

    // 3. Обновляем или создаем запись
    const { data: updatedUser, error: upsertError } = await supabase
      .from('user_profiles')
      .upsert(userData, { onConflict: 'email' })
      .select()
      .single();

    if (upsertError) {
      console.error('Error syncing user:', upsertError);
      return null;
    }

    return updatedUser;
  } catch (error) {
    console.error('Error in syncCurrentUser:', error);
    return null;
  }
}

/**
 * Получает данные текущего пользователя из Supabase
 * @param email Email текущего пользователя
 * @returns Данные пользователя из Supabase или null в случае ошибки
 */
export async function getCurrentUser(email: string): Promise<SupabaseUserInfo | null> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error fetching current user:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return null;
  }
}

/**
 * Получает данные пользователя из Supabase по email
 * @param email Email пользователя
 * @returns Данные пользователя из Supabase или null в случае ошибки
 */
export async function getUserByEmail(email: string): Promise<SupabaseUserInfo | null> {
  try {
    const { data, error } = await supabase
      .from('v_user_details')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error fetching user by email:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getUserByEmail:', error);
    return null;
  }
} 