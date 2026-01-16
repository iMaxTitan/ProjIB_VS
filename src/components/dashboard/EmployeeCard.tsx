import React from 'react';
import { EmployeeDetails } from '@/types/supabase';

interface EmployeeCardProps {
  employee: EmployeeDetails;
}

export default function EmployeeCard({ employee }: EmployeeCardProps) {
  const getRoleColor = (role: string | null) => {
    switch (role) {
      case 'chief':
        return 'bg-purple-100 text-purple-800';
      case 'head':
        return 'bg-blue-100 text-blue-800';
      case 'employee':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center space-x-4">
        <div className="flex-shrink-0">
          <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-primary-700 font-medium">
              {employee.short_name || employee.full_name?.charAt(0) || '?'}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-secondary-900 truncate">
            {employee.full_name || 'Не указано'}
          </h3>
          <p className="text-sm text-secondary-500 truncate">
            {employee.department || 'Отдел не указан'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(employee.role)}`}>
            {employee.role || 'Роль не указана'}
          </span>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center text-sm text-secondary-500">
          <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-secondary-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
          </svg>
          {employee.email || 'Email не указан'}
        </div>
        <div className="mt-2 flex items-center text-sm text-secondary-500">
          <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-secondary-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd" />
          </svg>
          {employee.department_code || 'Код отдела не указан'}
        </div>
      </div>
    </div>
  );
} 