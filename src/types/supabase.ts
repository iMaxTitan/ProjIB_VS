export type UserRole = 'chief' | 'head' | 'employee';

// Статусы пользователя
export type UserStatus = 'active' | 'blocked' | 'business_trip' | 'sick_leave' | 'day_off' | 'vacation';

// Данные пользователя системы из Supabase (v_user_details)
export type SupabaseUserInfo = {
  user_id: string | null;        // ID пользователя
  email: string | null;          // Email
  full_name: string | null;      // Полное имя
  photo_base64: string | null;   // Фото профиля
  role: string | null;           // Роль в системе
  department_id: string | null;  // ID отдела
  department_name: string | null; // Название отдела
  department_code: string | null; // Код отдела
  status: UserStatus | null;     // Статус пользователя
  last_seen_at: string | null;    // Последний раз в сети (HTTP пульс)
  position: string | null;        // Должность
};

// Данные участника проекта
export type EmployeeDetails = {
  user_id: string | null;       // ID пользователя
  full_name: string | null;     // Полное имя
  short_name: string | null;    // Сокращенное имя
  role: string | null;          // Роль в проекте
  department: string | null;    // Название отдела
  department_code: string | null; // Код отдела
  department_id: string | null;  // ID отдела
  email: string | null;         // Email
  status: UserStatus | null;    // Статус пользователя
};

export type Department = {
  id: string;
  name: string;
  code: string;
  created_at: string | null;
};

// Типы для базы данных
export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          user_id: string;
          email: string;
          full_name: string | null;
          role: UserRole;
          department_id: string | null;
          department_name: string | null;
          department_code: string | null;
          azure_id: string;
          photo_base64: string | null;
          created_at: string;
          updated_at: string;
          last_seen_at: string | null;
          status: UserStatus;
          position: string | null;
        };
        Insert: Omit<Database['public']['Tables']['user_profiles']['Row'], 'user_id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Database['public']['Tables']['user_profiles']['Row'], 'user_id' | 'created_at' | 'updated_at'>>;
      };
      departments: {
        Row: Department;
        Insert: Omit<Department, 'id' | 'created_at'>;
        Update: Partial<Omit<Department, 'id' | 'created_at'>>;
      };
      project_employees: {
        Row: EmployeeDetails;
        Insert: Omit<EmployeeDetails, 'user_id'>;
        Update: Partial<Omit<EmployeeDetails, 'user_id'>>;
      };
    };
    Views: {
      v_user_details: {
        Row: SupabaseUserInfo;
      };
    };
  };
};