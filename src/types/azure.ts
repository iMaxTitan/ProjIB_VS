import { UserRole } from './supabase';

// Отображаемые названия ролей
export const roleLabels: Record<UserRole, string> = {
  chief: 'Руководитель',
  head: 'Начальник отдела',
  employee: 'Сотрудник'
};

/**
 * Данные пользователя из Azure AD
 */
export type AzureUserInfo = {
  // Основные данные
  id: string;
  email: string;
  name: string;
  displayName: string;

  // Токены
  accessToken: string;    // Токен доступа
  idToken?: string;       // ID токен (опционально)

  // Опциональные поля
  jobTitle?: string;      // Должность
  departmentAD?: string;  // Отдел из Azure AD
  division?: string;      // Подразделение
  photo?: string;         // Фото профиля (base64)
  mobilePhone?: string;   // Мобильный телефон
};

/**
 * Объединенные данные пользователя:
 * - AzureUserInfo (данные из Azure AD)
 * - department и role из Supabase
 */
export interface UserInfo extends AzureUserInfo {
  // Данные из Supabase
  role: string | null;                  // Код роли пользователя
  role_disp?: string;                   // Отображаемое название роли
  department_name: string | null;       // Название отдела
  department_id?: string | null;        // ID отдела
  department_code?: string | null;      // Код отдела
  
  // Дополнительные поля для совместимости
  photo_base64?: string | null;         // Альтернативное поле для фото из Supabase
  user_id: string;                     // ID пользователя в Supabase
}