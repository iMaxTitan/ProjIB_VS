import React, { ReactNode } from 'react';
import { UserRole } from '@/types/supabase';

interface ContentByRoleProps {
  role?: UserRole;
  children: ReactNode;
}

const roleLabels: Record<UserRole, string> = {
  chief: 'Руководитель',
  head: 'Начальник отдела',
  employee: 'Сотрудник'
};

const ContentByRole: React.FC<ContentByRoleProps> = ({ role = 'employee', children }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {roleLabels[role]}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default ContentByRole; 