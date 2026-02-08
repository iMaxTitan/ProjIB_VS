import { supabase } from '@/lib/supabase';
import logger from '@/lib/logger';

export interface Employee {
    user_id: string;
    full_name: string;
    department_id: string | null;
    department_name: string | null;
    role: string;
    photo_base64: string | null;
    email: string;
}

export const employeeService = {
    /**
     * Получить список всех сотрудников.
     * Если передан departmentId, фильтрует по отделу.
     */
    async getEmployees(departmentId?: string): Promise<Employee[]> {
        try {
            let query = supabase
                .from('v_user_details')
                .select('*')
                .order('full_name');

            if (departmentId) {
                query = query.eq('department_id', departmentId);
            }

            const { data, error } = await query;

            if (error) {
                throw error;
            }

            return (data || []) as Employee[];
        } catch (error: unknown) {
            logger.error('Ошибка при получении сотрудников:', error);
            throw error;
        }
    },

    /**
     * Получить сотрудников для списка назначения (упрощенная модель).
     */
    async getAssignees(departmentId?: string) {
        const employees = await this.getEmployees(departmentId);
        return employees.map(emp => ({
            id: emp.user_id,
            name: emp.full_name,
            department: emp.department_name || 'Не указан',
            photoBase64: emp.photo_base64
        }));
    }
};

