import React, { useState, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { supabase } from '@/lib/supabase';
import { SupabaseUserInfo, UserStatus } from '@/types/supabase';
import { GraphService } from '@/services/graph-service';

interface Department {
  id: string;
  name: string;
  code: string;
}

interface EmployeeFormModalProps {
  currentUser: UserInfo;
  onClose: () => void;
  onEmployeeUpserted: (employee: SupabaseUserInfo) => void;
  editMode?: boolean;
  employeeData?: SupabaseUserInfo | null;
}

export default function EmployeeFormModal({ 
  currentUser, 
  onClose, 
  onEmployeeUpserted,
  editMode = false,
  employeeData = null
}: EmployeeFormModalProps) {
  const [email, setEmail] = useState(employeeData?.email || '');
  const [searchLoading, setSearchLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [userFound, setUserFound] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>(employeeData?.department_id || '');
  const [selectedRole, setSelectedRole] = useState<string>(employeeData?.role || 'employee');
  const [selectedStatus, setSelectedStatus] = useState<UserStatus>(
    (employeeData?.status as UserStatus) || 'active'
  );
  const [userData, setUserData] = useState<{
    displayName: string;
    email: string;
    photoBase64: string | null;
  }>({
    displayName: employeeData?.full_name || '',
    email: employeeData?.email || '',
    photoBase64: employeeData?.photo_base64 || null
  });

  // --- Синхронизация состояния при открытии/смене employeeData ---
  useEffect(() => {
    if (employeeData) {
      setEmail(employeeData.email || '');
      setSelectedDepartment(employeeData.department_id || '');
      setSelectedRole(employeeData.role || 'employee');
      setSelectedStatus((employeeData.status as UserStatus) || 'active');
      setUserData({
        displayName: employeeData.full_name || '',
        email: employeeData.email || '',
        photoBase64: employeeData.photo_base64 || null
      });
      setUserFound(true);
    } else {
      setEmail('');
      setSelectedDepartment('');
      setSelectedRole('employee');
      setSelectedStatus('active');
      setUserData({
        displayName: '',
        email: '',
        photoBase64: null
      });
      setUserFound(false);
    }
  }, [employeeData]);

  // Загрузка списка отделов из Supabase
  useEffect(() => {
    const fetchDepartments = async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('department_id, department_name, department_code');
      if (error) {
        setError('Ошибка загрузки отделов: ' + error.message);
        return;
      }
      setDepartments(
        (data ?? []).map((d: any) => ({
          id: d.department_id,
          name: d.department_name,
          code: d.department_code || ''
        }))
      );
      // Если текущий пользователь - начальник отдела, фиксируем отдел
      if (currentUser.role === 'head' && currentUser.department_id) {
        setSelectedDepartment(currentUser.department_id);
      }
    };
    fetchDepartments();
  }, [currentUser]);

  // Выделенная функция для поиска пользователя в Microsoft Graph
  const searchUserInGraph = async (emailToSearch: string) => {
    try {
      setSearchLoading(true);
      setSearchError(null);
      
      // Используем GraphService для поиска пользователя
      const users = await GraphService.searchUserByEmail(emailToSearch);
      
      if (users && users.length > 0) {
        const user = users[0];
        
        // Запрашиваем фото пользователя через GraphService
        let photoBase64 = await GraphService.getUserPhoto(user.id);
        
        // В режиме редактирования сохраняем текущее фото, если новое не найдено
        if (editMode && !photoBase64 && userData.photoBase64) {
          photoBase64 = userData.photoBase64;
        }
        
        setUserData({
          displayName: user.displayName || '',
          email: user.mail || user.userPrincipalName || '',
          photoBase64: photoBase64
        });
        
        setUserFound(true);
      } else {
        if (!editMode) {
          // В режиме добавления показываем ошибку, если пользователь не найден
          setSearchError('Пользователь не найден');
          setUserFound(false);
        }
        // В режиме редактирования оставляем существующие данные
      }
    } catch (err: any) {
      console.error('Ошибка при поиске пользователя:', err);
      setSearchError(err.message || 'Произошла ошибка при поиске пользователя');
      
      // В режиме редактирования не сбрасываем флаг userFound, чтобы можно было продолжить редактирование
      if (!editMode) {
        setUserFound(false);
      }
    } finally {
      setSearchLoading(false);
    }
  };

  // Поиск пользователя в Microsoft Graph
  const searchUser = async () => {
    if (!email.trim()) {
      setSearchError('Введите email для поиска');
      return;
    }
    
    await searchUserInGraph(email.trim());
  };
  
  // Сохранение пользователя в Supabase
  const saveUser = async () => {
    if (!userFound) {
      setError('Сначала найдите пользователя');
      return;
    }
    
    if (!selectedDepartment && currentUser.role !== 'head') {
      setError('Выберите отдел');
      return;
    }
    
    try {
      setSaveLoading(true);
      setError(null);
      
      // Определяем отдел (для начальника отдела - его собственный отдел)
      const departmentId = currentUser.role === 'head' ? currentUser.department_id : selectedDepartment;
      
      // Определяем роль (для начальника отдела - только 'employee')
      const role = currentUser.role === 'head' ? 'employee' : selectedRole;
      
      // Используем хранимую процедуру для добавления/обновления пользователя
      const { data, error } = await supabase
        .rpc('upsert_user_profile', {
          p_email: userData.email,
          p_full_name: userData.displayName,
          p_department_id: departmentId,
          p_photo_base64: userData.photoBase64,
          p_role: role,
          p_status: selectedStatus
        });
      
      if (error) {
        throw error;
      }
      
      // Вызываем колбэк для обновления списка сотрудников
      if (data) {
        onEmployeeUpserted(data);
      }
      onClose();
    } catch (err: any) {
      console.error('Ошибка при сохранении пользователя:', err);
      setError(err.message || 'Произошла ошибка при сохранении пользователя');
    } finally {
      setSaveLoading(false);
    }
  };

  // Получение инициалов из имени для аватара
  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 1).toUpperCase();
  };

  // Получение отображаемого названия роли на русском
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
    if (!status) return '❓';
    
    switch (status) {
      case 'active':
        return '🟢';
      case 'blocked':
        return '🔴';
      case 'business_trip':
        return '✈️';
      case 'sick_leave':
        return '🏥';
      case 'day_off':
        return '🏠';
      case 'vacation':
        return '🏖️';
      default:
        return '❓';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {editMode ? 'Редактирование сотрудника' : 'Добавление нового сотрудника'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Поиск пользователя */}
        {!editMode && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-md font-medium text-gray-700 mb-3">Поиск пользователя в Microsoft</h3>
            
            <div className="flex space-x-2">
              <div className="flex-1">
                <input 
                  type="email" 
                  placeholder="Введите email пользователя" 
                  className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={searchLoading || userFound}
                />
              </div>
              <button 
                onClick={searchUser}
                disabled={searchLoading || !email.trim() || userFound}
                className={`px-4 py-2 rounded-md text-white ${
                  searchLoading || !email.trim() || userFound
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                } transition-colors flex items-center`}
              >
                {searchLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Поиск...
                  </>
                ) : userFound ? 'Найден' : 'Найти'}
              </button>
              
              {userFound && !editMode && (
                <button 
                  onClick={() => {
                    setUserFound(false);
                    setUserData({ displayName: '', email: '', photoBase64: null });
                    setEmail('');
                  }}
                  className="px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
                >
                  Сбросить
                </button>
              )}
            </div>
            
            {searchError && (
              <div className="mt-2 text-sm text-red-600">
                {searchError}
              </div>
            )}
          </div>
        )}
        
        {/* Результаты поиска и форма */}
        {userFound && (
          <>
            <div className="mb-6">
              <h3 className="text-md font-medium text-gray-700 mb-3">Информация о пользователе</h3>
              
              <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0 mr-4">
                  {userData.photoBase64 ? (
                    <img 
                      src={userData.photoBase64} 
                      alt={userData.displayName} 
                      className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm" 
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-300 to-indigo-400 flex items-center justify-center text-white text-xl font-bold shadow-sm border-2 border-white">
                      {getInitials(userData.displayName)}
                    </div>
                  )}
                </div>
                
                <div>
                  <h4 className="text-lg font-medium text-gray-800">{userData.displayName}</h4>
                  <p className="text-gray-600">{userData.email}</p>
                  {editMode && (
                    <p className="text-xs text-gray-500 mt-1">Email нельзя изменить</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {currentUser.role === 'chief' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Отдел
                  </label>
                  <select 
                    className={`w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                  >
                    <option value="">Выберите отдел</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {currentUser.role === 'head' && currentUser.department_name && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Отдел
                  </label>
                  <div className="px-4 py-2 bg-gray-100 rounded border border-gray-200 text-gray-700">
                    {currentUser.department_name}
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Роль
                </label>
                <select 
                  className={`w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    (currentUser.role === 'head' && !editMode) ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  disabled={currentUser.role === 'head' && !editMode}
                >
                  <option value="employee">{getRoleDisplay('employee')}</option>
                  {currentUser.role === 'chief' && (
                    <>
                      <option value="head">{getRoleDisplay('head')}</option>
                      <option value="chief">{getRoleDisplay('chief')}</option>
                    </>
                  )}
                </select>
                {currentUser.role === 'head' && !editMode && (
                  <p className="mt-1 text-xs text-gray-500">
                    Добавляемый сотрудник будет иметь роль "{getRoleDisplay('employee')}"
                  </p>
                )}
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Статус
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {['active', 'blocked', 'business_trip', 'sick_leave', 'day_off', 'vacation'].map((status) => (
                  <label 
                    key={status} 
                    className={`flex items-center p-3 rounded-lg border ${
                      selectedStatus === status 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:bg-gray-50'
                    } cursor-pointer transition-colors`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={status}
                      checked={selectedStatus === status}
                      onChange={() => setSelectedStatus(status as UserStatus)}
                      className="sr-only"
                    />
                    <span className="text-xl mr-3">{getStatusIcon(status as UserStatus)}</span>
                    <span className="text-gray-800">{getStatusDisplay(status as UserStatus)}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <div className="flex justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
          >
            Отмена
          </button>
          
          <button
            type="button"
            onClick={saveUser}
            disabled={!userFound || saveLoading}
            className={`px-4 py-2 text-white rounded-md ${
              !userFound || saveLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } transition-colors flex items-center`}
          >
            {saveLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Сохранение...
              </>
            ) : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
