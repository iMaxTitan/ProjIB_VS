import React, { useState, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { supabase } from '@/lib/supabase';
import { SupabaseUserInfo, UserStatus } from '@/types/supabase';
import EmployeeFormModal from '@/components/employees/EmployeeFormModal';

interface EmployeesContentProps {
  user: UserInfo;
}

export default function EmployeesContent({ user }: EmployeesContentProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [employees, setEmployees] = useState<SupabaseUserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departmentStats, setDepartmentStats] = useState<Record<string, number>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<SupabaseUserInfo | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Загрузка данных о сотрудниках из Supabase
  useEffect(() => {
    fetchEmployees();
  }, []);

  // Функция для загрузки данных о сотрудниках
  const fetchEmployees = async () => {
    try {
      setLoading(true);

      // Получаем данные из представления v_user_details
      const { data, error } = await supabase
        .from('v_user_details')
        .select('*');

      if (error) {
        throw error;
      }

      if (data) {
        // Устанавливаем статус "active" по умолчанию, если он не задан
        const employeesWithStatus = data.map(emp => ({
          ...emp,
          status: emp.status || 'active'
        }));

        setEmployees(employeesWithStatus);

        // Подсчет сотрудников по отделам
        const deptStats: Record<string, number> = {};
        employeesWithStatus.forEach(emp => {
          if (emp.department_name) {
            deptStats[emp.department_name] = (deptStats[emp.department_name] || 0) + 1;
          }
        });
        setDepartmentStats(deptStats);
      }
    } catch (err) {
      console.error('Ошибка при загрузке сотрудников:', err);
      setError('Не удалось загрузить данные о сотрудниках');
    } finally {
      setLoading(false);
    }
  };

  // Обработчик добавления/обновления сотрудника
  const handleEmployeeUpserted = (employee: SupabaseUserInfo) => {
    // Проверяем, существует ли уже сотрудник в списке
    const existingIndex = employees.findIndex(emp => emp.user_id === employee.user_id);
    
    if (existingIndex >= 0) {
      // Обновляем существующего сотрудника
      const updatedEmployees = [...employees];
      updatedEmployees[existingIndex] = employee;
      setEmployees(updatedEmployees);
    } else {
      // Добавляем нового сотрудника
      setEmployees([...employees, employee]);
    }
  };
  
  // Обновление статистики
  const updateStats = (employeeList: SupabaseUserInfo[]) => {
    // Подсчет сотрудников по отделам
    const deptStats: Record<string, number> = {};
    employeeList.forEach(emp => {
      if (emp.department_name) {
        deptStats[emp.department_name] = (deptStats[emp.department_name] || 0) + 1;
      }
    });
    setDepartmentStats(deptStats);
  };

  // Фильтрация сотрудников по поисковому запросу и статусу
  const filteredEmployees = employees.filter(emp => {
    // Если есть фильтр по статусу, применяем его
    if (statusFilter) {
      if (statusFilter === 'active' && emp.status !== 'active') {
        return false;
      } else if (statusFilter === 'vacation' && emp.status !== 'vacation') {
        return false;
      } else if (statusFilter === 'absent' && !['sick_leave', 'business_trip', 'day_off'].includes(emp.status || '')) {
        return false;
      }
    }
    return true;
  });

  // Группировка сотрудников по отделам
  const employeesByDepartment: Record<string, SupabaseUserInfo[]> = {};
  employees.forEach(emp => {
    if (emp.department_name) {
      if (!employeesByDepartment[emp.department_name]) {
        employeesByDepartment[emp.department_name] = [];
      }
      employeesByDepartment[emp.department_name].push(emp);
    }
  });

  // Функция для разделения полного имени на имя и фамилию
  const splitFullName = (fullName: string | null): { firstName: string, lastName: string } => {
    if (!fullName) return { firstName: 'Без', lastName: 'имени' };
    
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    
    return { firstName, lastName };
  };

  // Получение инициалов из полного имени
  const getInitials = (name: string | null) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 1).toUpperCase();
  };

  // Получение цвета для роли
  const getRoleColor = (role: string | null) => {
    if (!role) return 'bg-gray-100 text-gray-800';

    switch (role.toLowerCase()) {
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

  // Получение отображаемого названия роли
  const getRoleDisplay = (role: string | null) => {
    if (!role) return 'Не указана';

    switch (role.toLowerCase()) {
      case 'chief':
        return 'Руководитель';
      case 'head':
        return 'Начальник';
      case 'employee':
        return 'Сотрудник';
      default:
        return role;
    }
  };

  // Получение цвета для статуса
  const getStatusColor = (status: UserStatus | null) => {
    if (!status) return 'bg-gray-100 text-gray-800';

    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'blocked':
        return 'bg-red-100 text-red-800';
      case 'business_trip':
        return 'bg-blue-100 text-blue-800';
      case 'sick_leave':
        return 'bg-yellow-100 text-yellow-800';
      case 'day_off':
        return 'bg-indigo-100 text-indigo-800';
      case 'vacation':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Получение отображаемого названия статуса
  const getStatusDisplay = (status: UserStatus | null) => {
    if (!status) return 'Не указан';

    switch (status) {
      case 'active':
        return 'Активный';
      case 'blocked':
        return 'Заблокирован';
      case 'business_trip':
        return 'Командировка';
      case 'sick_leave':
        return 'Больничный';
      case 'day_off':
        return 'Отгул';
      case 'vacation':
        return 'Отпуск';
      default:
        return status;
    }
  };

  // Получение иконки для статуса
  const getStatusIcon = (status: UserStatus | null) => {
    if (!status) return '';

    switch (status) {
      case 'active':
        return '';
      case 'blocked':
        return '';
      case 'business_trip':
        return '';
      case 'sick_leave':
        return '';
      case 'day_off':
        return '';
      case 'vacation':
        return '';
      default:
        return '';
    }
  };

  // Получение цвета для аватара на основе имени
  const getAvatarColor = (name: string | null) => {
    if (!name) return 'from-gray-400 to-gray-500';

    // Используем первую букву имени для определения цвета
    const initial = name.charAt(0).toLowerCase();

    // Разные градиенты в зависимости от первой буквы
    const colorMap: Record<string, string> = {
      'а': 'from-red-300 to-red-400',
      'б': 'from-blue-300 to-blue-400',
      'в': 'from-green-300 to-green-400',
      'г': 'from-yellow-300 to-yellow-400',
      'д': 'from-purple-300 to-purple-400',
      'е': 'from-pink-300 to-pink-400',
      'ё': 'from-pink-300 to-pink-400',
      'ж': 'from-indigo-300 to-indigo-400',
      'з': 'from-yellow-300 to-yellow-400',
      'и': 'from-blue-300 to-blue-400',
      'й': 'from-blue-300 to-blue-400',
      'к': 'from-red-300 to-red-400',
      'л': 'from-green-300 to-green-400',
      'м': 'from-purple-300 to-purple-400',
      'н': 'from-indigo-300 to-indigo-400',
      'о': 'from-orange-300 to-orange-400',
      'п': 'from-blue-300 to-blue-400',
      'р': 'from-red-300 to-red-400',
      'с': 'from-green-300 to-green-400',
      'т': 'from-teal-300 to-teal-400',
      'у': 'from-purple-300 to-purple-400',
      'ф': 'from-pink-300 to-pink-400',
      'х': 'from-yellow-300 to-yellow-400',
      'ц': 'from-indigo-300 to-indigo-400',
      'ч': 'from-red-300 to-red-400',
      'ш': 'from-blue-300 to-blue-400',
      'щ': 'from-blue-300 to-blue-400',
      'э': 'from-yellow-300 to-yellow-400',
      'ю': 'from-purple-300 to-purple-400',
      'я': 'from-pink-300 to-pink-400',

      // Латинские буквы
      'a': 'from-red-300 to-red-400',
      'b': 'from-blue-300 to-blue-400',
      'c': 'from-green-300 to-green-400',
      'd': 'from-yellow-300 to-yellow-400',
      'e': 'from-purple-300 to-purple-400',
      'f': 'from-pink-300 to-pink-400',
      'g': 'from-indigo-300 to-indigo-400',
      'h': 'from-teal-300 to-teal-400',
      'i': 'from-blue-300 to-blue-400',
      'j': 'from-yellow-300 to-yellow-400',
      'k': 'from-red-300 to-red-400',
      'l': 'from-green-300 to-green-400',
      'm': 'from-purple-300 to-purple-400',
      'n': 'from-indigo-300 to-indigo-400',
      'o': 'from-orange-300 to-orange-400',
      'p': 'from-blue-300 to-blue-400',
      'q': 'from-pink-300 to-pink-400',
      'r': 'from-red-300 to-red-400',
      's': 'from-green-300 to-green-400',
      't': 'from-teal-300 to-teal-400',
      'u': 'from-purple-300 to-purple-400',
      'v': 'from-pink-300 to-pink-400',
      'w': 'from-yellow-300 to-yellow-400',
      'x': 'from-indigo-300 to-indigo-400',
      'y': 'from-red-300 to-red-400',
      'z': 'from-blue-300 to-blue-400',
    };

    return colorMap[initial] || 'from-blue-300 to-indigo-400';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Сотрудники</h1>

      {/* Статистика по сотрудникам */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div 
          className={`relative ${statusFilter === null 
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg hover:shadow-xl hover:translate-y-[-3px]' 
            : 'bg-white text-gray-800 hover:shadow-md hover:translate-y-[-3px]'} 
            p-4 rounded-lg cursor-pointer transition-all duration-300`}
          onClick={() => setStatusFilter(null)}
        >
          <div className="flex justify-between items-start">
            <div className="text-sm font-medium mb-1">Всего</div>
            <div className={`${statusFilter === null ? 'text-white' : 'text-indigo-600'}`}>
              <span className="text-2xl">👥</span>
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">
            {employees.length}
          </div>
          <div className="mt-1 text-sm opacity-80">
            в {Object.keys(departmentStats).length} отделах
          </div>
          {statusFilter === null && (
            <div className="w-full mt-3 bg-blue-400 bg-opacity-50 h-2 rounded-full overflow-hidden">
              <div className="bg-white h-full rounded-full" style={{ width: '100%' }}></div>
            </div>
          )}
        </div>
        <div 
          className={`relative ${statusFilter === 'active' 
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg hover:shadow-xl hover:translate-y-[-3px]' 
            : 'bg-white text-gray-800 hover:shadow-md hover:translate-y-[-3px]'} 
            p-4 rounded-lg cursor-pointer transition-all duration-300`}
          onClick={() => setStatusFilter('active')}
        >
          <div className="flex justify-between items-start">
            <div className="text-sm font-medium mb-1">Активные</div>
            <div className={`${statusFilter === 'active' ? 'text-white' : 'text-green-600'}`}>
              <span className="text-2xl">🟢</span>
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">
            {employees.filter(emp => emp.status === 'active').length}
          </div>
          <div className="mt-1 text-sm opacity-80">
            {employees.length > 0
              ? `${Math.round((employees.filter(emp => emp.status === 'active').length) / employees.length * 100)}% от общего числа`
              : 'Нет данных'}
          </div>
          {statusFilter === 'active' && (
            <div className="w-full mt-3 bg-blue-400 bg-opacity-50 h-2 rounded-full overflow-hidden">
              <div className="bg-white h-full rounded-full" style={{ width: `${Math.round((employees.filter(emp => emp.status === 'active').length) / employees.length * 100)}%` }}></div>
            </div>
          )}
        </div>
        <div 
          className={`relative ${statusFilter === 'vacation' 
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg hover:shadow-xl hover:translate-y-[-3px]' 
            : 'bg-white text-gray-800 hover:shadow-md hover:translate-y-[-3px]'} 
            p-4 rounded-lg cursor-pointer transition-all duration-300`}
          onClick={() => setStatusFilter('vacation')}
        >
          <div className="flex justify-between items-start">
            <div className="text-sm font-medium mb-1">В отпуске</div>
            <div className={`${statusFilter === 'vacation' ? 'text-white' : 'text-purple-600'}`}>
              <span className="text-2xl">🏖️</span>
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">
            {employees.filter(emp => emp.status === 'vacation').length}
          </div>
          <div className="mt-1 text-sm opacity-80">
            {employees.length > 0
              ? `${Math.round((employees.filter(emp => emp.status === 'vacation').length) / employees.length * 100)}% от общего числа`
              : 'Нет данных'}
          </div>
          {statusFilter === 'vacation' && (
            <div className="w-full mt-3 bg-blue-400 bg-opacity-50 h-2 rounded-full overflow-hidden">
              <div className="bg-white h-full rounded-full" style={{ width: `${Math.round((employees.filter(emp => emp.status === 'vacation').length) / employees.length * 100)}%` }}></div>
            </div>
          )}
        </div>
        <div 
          className={`relative ${statusFilter === 'absent' 
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg hover:shadow-xl hover:translate-y-[-3px]' 
            : 'bg-white text-gray-800 hover:shadow-md hover:translate-y-[-3px]'} 
            p-4 rounded-lg cursor-pointer transition-all duration-300`}
          onClick={() => setStatusFilter('absent')}
        >
          <div className="flex justify-between items-start">
            <div className="text-sm font-medium mb-1">Отсутствуют</div>
            <div className={`${statusFilter === 'absent' ? 'text-white' : 'text-yellow-600'}`}>
              <span className="text-2xl">🏥</span>
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">
            {employees.filter(emp => ['sick_leave', 'business_trip', 'day_off'].includes(emp.status || '')).length}
          </div>
          <div className="mt-1 text-sm opacity-80">больничный, командировка, отгул</div>
          {statusFilter === 'absent' && (
            <div className="w-full mt-3 bg-blue-400 bg-opacity-50 h-2 rounded-full overflow-hidden">
              <div className="bg-white h-full rounded-full" style={{ width: `${Math.round((employees.filter(emp => ['sick_leave', 'business_trip', 'day_off'].includes(emp.status || '')).length) / employees.length * 100)}%` }}></div>
            </div>
          )}
        </div>
      </div>

      {/* Список сотрудников с табами и поиском */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 py-4 px-6 text-center font-medium ${activeTab === 'all' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('all')}
          >
            Все сотрудники
          </button>
          <button
            className={`flex-1 py-4 px-6 text-center font-medium ${activeTab === 'departments' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('departments')}
          >
            По отделам
          </button>
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex-1"></div>
            <div className="flex space-x-2">
              <button 
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                onClick={() => setShowAddModal(true)}
              >
                Добавить сотрудника
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 text-lg">{error}</div>
            </div>
          ) : (
            <>
              {activeTab === 'all' && (
                <div className="bg-white shadow rounded-lg p-6">
                  {filteredEmployees.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      Нет данных о сотрудниках
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredEmployees.map(emp => (
                        <div key={emp.user_id} className="relative flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:translate-y-[-3px] transition-all duration-300">
                          <button 
                            className="absolute top-2 right-2 text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100 transition-colors"
                            title="Редактировать"
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setShowEditModal(true);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <div className="flex items-center space-x-3">
                            {emp.photo_base64 ? (
                              <img
                                className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm"
                                src={emp.photo_base64}
                                alt={emp.full_name || ''}
                              />
                            ) : (
                              <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${getAvatarColor(emp.full_name)} flex items-center justify-center text-white text-sm font-bold shadow-sm border-2 border-white`}>
                                {getInitials(emp.full_name)}
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {(() => {
                                  const { firstName, lastName } = splitFullName(emp.full_name);
                                  return (
                                    <>
                                      <div>{firstName}</div>
                                      <div>{lastName}</div>
                                    </>
                                  );
                                })()}
                              </div>
                              <div className="text-xs text-gray-500">{emp.email || 'Нет email'}</div>
                              <div className="mt-1 text-sm text-gray-500">
                                {emp.department_name || 'Отдел не указан'}
                              </div>
                              <div className="mt-1">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleColor(emp.role)}`}>
                                  {getRoleDisplay(emp.role)}
                                </span>
                                <span className={`ml-1 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(emp.status as UserStatus)}`}>
                                  {getStatusDisplay(emp.status as UserStatus)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'departments' && (
                <div className="space-y-6">
                  {Object.keys(employeesByDepartment).length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      Нет данных по отделам
                    </div>
                  ) : (
                    Object.entries(employeesByDepartment).map(([deptId, deptEmployees]) => (
                      <div key={deptId} className="bg-white border border-gray-200 rounded-lg p-5">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-medium text-gray-800">{deptId}</h3>
                          <span className="text-sm text-gray-500">{deptEmployees.length} сотрудников</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {deptEmployees.map(emp => (
                            <div key={emp.user_id} className="relative flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:translate-y-[-3px] transition-all duration-300">
                              <button 
                                className="absolute top-2 right-2 text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-100 transition-colors"
                                title="Редактировать"
                                onClick={() => {
                                  setSelectedEmployee(emp);
                                  setShowEditModal(true);
                                }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <div className="flex items-center space-x-3">
                                {emp.photo_base64 ? (
                                  <img
                                    className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm"
                                    src={emp.photo_base64}
                                    alt={emp.full_name || ''}
                                  />
                                ) : (
                                  <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${getAvatarColor(emp.full_name)} flex items-center justify-center text-white text-sm font-bold shadow-sm border-2 border-white`}>
                                    {getInitials(emp.full_name)}
                                  </div>
                                )}
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {(() => {
                                      const { firstName, lastName } = splitFullName(emp.full_name);
                                      return (
                                        <>
                                          <div>{firstName}</div>
                                          <div>{lastName}</div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                  <div className="text-xs text-gray-500">{emp.email || 'Нет email'}</div>
                                  <div className="mt-1 flex space-x-1">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleColor(emp.role)}`}>
                                      {getRoleDisplay(emp.role)}
                                    </span>
                                    <span className={`ml-1 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(emp.status as UserStatus)}`}>
                                      {getStatusDisplay(emp.status as UserStatus)}
                                    </span>
                                  </div>
                                  <div className="mt-2">
                                    <div className="flex space-x-2">
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Модальное окно для добавления сотрудника */}
      {showAddModal && (
        <EmployeeFormModal
          currentUser={user}
          onClose={() => setShowAddModal(false)}
          onEmployeeUpserted={handleEmployeeUpserted}
        />
      )}
      
      {/* Модальное окно для редактирования сотрудника */}
      {showEditModal && selectedEmployee && (
        <EmployeeFormModal
          currentUser={user}
          onClose={() => {
            setShowEditModal(false);
            setSelectedEmployee(null);
          }}
          onEmployeeUpserted={handleEmployeeUpserted}
          editMode={true}
          employeeData={selectedEmployee}
        />
      )}
    </div>
  );
}
