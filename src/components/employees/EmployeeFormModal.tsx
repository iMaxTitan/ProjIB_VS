'use client';

import React, { useState, useEffect } from 'react';
import { Search, Loader2, RotateCcw } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { supabase } from '@/lib/supabase';
import { SupabaseUserInfo, UserStatus } from '@/types/supabase';
import { GraphUsersService } from '@/services/graph';
import { Modal, ErrorAlert } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { getInitials, getAvatarGradient, getStatusConfig, getRoleLabel } from './EmployeeCard';

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
  preselectedDepartmentName?: string | null;
}

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'active', label: 'Активный' },
  { value: 'vacation', label: 'Отпуск' },
  { value: 'sick_leave', label: 'Больничный' },
  { value: 'business_trip', label: 'Командировка' },
  { value: 'day_off', label: 'Отгул' },
  { value: 'blocked', label: 'Заблокирован' },
];

export default function EmployeeFormModal({
  currentUser,
  onClose,
  onEmployeeUpserted,
  editMode = false,
  employeeData = null,
  preselectedDepartmentName = null,
}: EmployeeFormModalProps) {
  // Form state
  const [email, setEmail] = useState(employeeData?.email || '');
  const [searchLoading, setSearchLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [userFound, setUserFound] = useState(editMode);
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
    photoBase64: employeeData?.photo_base64 || null,
  });

  // Синхронизация состояния при открытии/смене employeeData
  useEffect(() => {
    if (employeeData) {
      setEmail(employeeData.email || '');
      setSelectedDepartment(employeeData.department_id || '');
      setSelectedRole(employeeData.role || 'employee');
      setSelectedStatus((employeeData.status as UserStatus) || 'active');
      setUserData({
        displayName: employeeData.full_name || '',
        email: employeeData.email || '',
        photoBase64: employeeData.photo_base64 || null,
      });
      setUserFound(true);
    } else {
      setEmail('');
      setSelectedDepartment('');
      setSelectedRole('employee');
      setSelectedStatus('active');
      setUserData({ displayName: '', email: '', photoBase64: null });
      setUserFound(false);
    }
  }, [employeeData]);

  // Загрузка списка отделов
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
        (data ?? []).map((d: { department_id: string; department_name: string; department_code?: string }) => ({
          id: d.department_id,
          name: d.department_name,
          code: d.department_code || '',
        }))
      );

      // Если текущий пользователь - начальник отдела, фиксируем отдел
      if (currentUser.role === 'head' && currentUser.department_id) {
        setSelectedDepartment(currentUser.department_id);
      } else if (!editMode && preselectedDepartmentName) {
        const selectedDepartmentByName = (data ?? []).find(
          (d: { department_id: string; department_name: string }) => d.department_name === preselectedDepartmentName
        );
        if (selectedDepartmentByName) {
          setSelectedDepartment(selectedDepartmentByName.department_id);
        }
      }
    };

    fetchDepartments();
  }, [currentUser, editMode, preselectedDepartmentName]);

  // Поиск пользователя в Microsoft Graph
  const searchUser = async () => {
    if (!email.trim()) {
      setSearchError('Введите email для поиска');
      return;
    }

    try {
      setSearchLoading(true);
      setSearchError(null);

      const users = await GraphUsersService.searchUserByEmail(email.trim());

      if (users && users.length > 0) {
        const user = users[0];
        let photoBase64 = await GraphUsersService.getUserPhoto(user.id);

        // В режиме редактирования сохраняем текущее фото, если новое не найдено
        if (editMode && !photoBase64 && userData.photoBase64) {
          photoBase64 = userData.photoBase64;
        }

        setUserData({
          displayName: user.displayName || '',
          email: user.mail || user.userPrincipalName || '',
          photoBase64: photoBase64,
        });

        setUserFound(true);
      } else {
        if (!editMode) {
          setSearchError('Пользователь не найден');
          setUserFound(false);
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка при поиске пользователя';
      setSearchError(errorMessage);

      if (!editMode) {
        setUserFound(false);
      }
    } finally {
      setSearchLoading(false);
    }
  };

  // Сброс поиска
  const resetSearch = () => {
    setUserFound(false);
    setUserData({ displayName: '', email: '', photoBase64: null });
    setEmail('');
    setSearchError(null);
  };

  // Сохранение пользователя
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

      const departmentId = currentUser.role === 'head' ? currentUser.department_id : selectedDepartment;
      const role = currentUser.role === 'head' ? 'employee' : selectedRole;

      const { data, error } = await supabase.rpc('upsert_user_profile', {
        p_email: userData.email,
        p_full_name: userData.displayName,
        p_department_id: departmentId,
        p_photo_base64: userData.photoBase64,
        p_role: role,
        p_status: selectedStatus,
      });

      if (error) throw error;

      if (data) {
        onEmployeeUpserted(data);
      }
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка при сохранении пользователя';
      setError(errorMessage);
    } finally {
      setSaveLoading(false);
    }
  };

  const canChangeRole = currentUser.role === 'chief';
  const canChangeDepartment = currentUser.role === 'chief';

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={editMode ? 'Редактирование сотрудника' : 'Добавление сотрудника'}
      headerVariant="gradient-indigo"
    >
      <div className="space-y-6">
        {/* Поиск пользователя (только для добавления) */}
        {!editMode && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Поиск в Microsoft
            </h3>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  placeholder="Введите email пользователя"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={searchLoading || userFound}
                  aria-label="Email для поиска"
                  className={cn(
                    "w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
                    "transition-all",
                    userFound
                      ? "bg-slate-100 text-slate-500 border-slate-200"
                      : "bg-white border-slate-300"
                  )}
                />
              </div>

              {!userFound ? (
                <Button
                  type="button"
                  onClick={searchUser}
                  disabled={searchLoading || !email.trim()}
                  aria-label="Найти пользователя"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {searchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">Найти</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={resetSearch}
                  variant="outline"
                  aria-label="Сбросить поиск"
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Сбросить</span>
                </Button>
              )}
            </div>

            {searchError && (
              <p className="mt-2 text-sm text-red-600">{searchError}</p>
            )}
          </div>
        )}

        {/* Информация о пользователе */}
        {userFound && (
          <>
            <div className="flex items-center gap-4 p-4 bg-emerald-50/50 rounded-xl border border-emerald-200/50">
              {userData.photoBase64 ? (
                <img
                  src={userData.photoBase64}
                  alt=""
                  aria-hidden="true"
                  className="h-16 w-16 rounded-xl object-cover border-2 border-white shadow-sm"
                />
              ) : (
                <div
                  className={cn(
                    "h-16 w-16 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-sm border-2 border-white bg-gradient-to-br",
                    getAvatarGradient(userData.displayName)
                  )}
                >
                  {getInitials(userData.displayName)}
                </div>
              )}
              <div>
                <h4 className="text-lg font-semibold text-slate-800">
                  {userData.displayName}
                </h4>
                <p className="text-sm text-slate-500">{userData.email}</p>
                {editMode && (
                  <p className="text-xs text-slate-400 mt-1">Email нельзя изменить</p>
                )}
              </div>
            </div>

            {/* Отдел и роль */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canChangeDepartment ? (
                <div>
                  <label
                    htmlFor="department"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Отдел
                  </label>
                  <select
                    id="department"
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white
                      focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
                      transition-all"
                  >
                    <option value="">Выберите отдел</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Отдел
                  </label>
                  <div className="px-4 py-2.5 bg-slate-100 rounded-lg border border-slate-200 text-sm text-slate-700">
                    {currentUser.department_name || 'Не указан'}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Роль
                </label>
                <select
                  id="role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  disabled={!canChangeRole}
                  className={cn(
                    "w-full px-4 py-2.5 text-sm border rounded-lg transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
                    canChangeRole
                      ? "border-slate-300 bg-white"
                      : "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                  )}
                >
                  <option value="employee">{getRoleLabel('employee')}</option>
                  {canChangeRole && (
                    <>
                      <option value="head">{getRoleLabel('head')}</option>
                      <option value="chief">{getRoleLabel('chief')}</option>
                    </>
                  )}
                </select>
                {!canChangeRole && !editMode && (
                  <p className="mt-1 text-xs text-slate-500">
                    Добавляемый сотрудник будет иметь роль &quot;{getRoleLabel('employee')}&quot;
                  </p>
                )}
              </div>
            </div>

            {/* Статус */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Статус
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STATUS_OPTIONS.map((statusOption) => {
                  const isSelected = selectedStatus === statusOption.value;
                  const statusConfig = getStatusConfig(statusOption.value);
                  const selectedTextClass = statusConfig.color
                    .split(' ')
                    .find((cls) => cls.startsWith('text-')) || 'text-slate-700';
                  const selectedBgClass = statusConfig.color
                    .split(' ')
                    .find((cls) => cls.startsWith('bg-')) || 'bg-slate-100';
                  const selectedBorderClass = selectedTextClass.replace('text-', 'border-');
                  return (
                    <label
                      key={statusOption.value}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all",
                        "focus-within:ring-2 focus-within:ring-emerald-500",
                        isSelected
                          ? cn(selectedBorderClass, selectedBgClass)
                          : "border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={statusOption.value}
                        checked={isSelected}
                        onChange={() => setSelectedStatus(statusOption.value)}
                        className="sr-only"
                      />
                      <span
                        className={cn("h-2.5 w-2.5 rounded-full", isSelected ? statusConfig.dot : "bg-slate-300")}
                        aria-hidden="true"
                      />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isSelected ? selectedTextClass : "text-slate-700"
                        )}
                      >
                        {statusOption.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Ошибка */}
        <ErrorAlert message={error} />

        {/* Кнопки */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saveLoading}
          >
            Отмена
          </Button>
          <Button
            type="button"
            onClick={saveUser}
            disabled={!userFound || saveLoading}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {saveLoading && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {saveLoading ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
