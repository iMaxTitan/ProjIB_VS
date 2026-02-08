'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Loader2, Mail, Pencil, RotateCcw, Search, UserCog, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { GraphUsersService } from '@/services/graph';
import { Button } from '@/components/ui/Button';
import { SupabaseUserInfo, UserStatus } from '@/types/supabase';
import { UserInfo } from '@/types/azure';
import { getAvatarGradient, getInitials, getRoleLabel, getStatusConfig } from './EmployeeCard';
import { useIsMobile } from '@/hooks/useMediaQuery';

interface Department {
  id: string;
  name: string;
}

interface EmployeeDetailsProps {
  employee: SupabaseUserInfo | null;
  mode?: 'view' | 'create';
  currentUser: UserInfo;
  onClose: () => void;
  onSave: (employee: SupabaseUserInfo) => void;
  canEdit?: boolean;
  preselectedDepartmentName?: string | null;
}

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: 'active', label: 'Активный' },
  { value: 'vacation', label: 'Отпуск' },
  { value: 'sick_leave', label: 'Больничный' },
  { value: 'business_trip', label: 'Командировка' },
  { value: 'day_off', label: 'Отгул' },
  { value: 'blocked', label: 'Заблокирован' },
];

export default function EmployeeDetails({
  employee,
  mode = 'view',
  currentUser,
  onClose,
  onSave,
  canEdit = false,
  preselectedDepartmentName = null,
}: EmployeeDetailsProps) {
  const isMobile = useIsMobile();
  const isCreateMode = mode === 'create';

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [searchEmail, setSearchEmail] = useState('');
  const [userFound, setUserFound] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const [status, setStatus] = useState<UserStatus>('active');
  const [role, setRole] = useState<string>('employee');
  const [departmentId, setDepartmentId] = useState<string>('');

  const [departments, setDepartments] = useState<Department[]>([]);

  const canChangeRole = currentUser.role === 'chief';
  const canChangeDepartment = currentUser.role === 'chief';

  const statusConfig = useMemo(
    () => getStatusConfig(status),
    [status]
  );

  useEffect(() => {
    const loadDepartments = async () => {
      const { data } = await supabase
        .from('departments')
        .select('department_id, department_name')
        .order('department_name');

      setDepartments(
        (data || []).map((d: { department_id: string; department_name: string }) => ({
          id: d.department_id,
          name: d.department_name,
        }))
      );
    };

    loadDepartments();
  }, []);

  useEffect(() => {
    if (isCreateMode) {
      setIsEditing(true);
      setSearchEmail('');
      setUserFound(false);
      setFullName('');
      setEmail('');
      setPhotoBase64(null);
      setStatus('active');
      setRole(currentUser.role === 'chief' ? 'employee' : 'employee');
      setDepartmentId(currentUser.role === 'head' ? currentUser.department_id || '' : '');
      setError(null);
      setSearchError(null);
      return;
    }

    if (employee) {
      setIsEditing(false);
      setSearchEmail(employee.email || '');
      setUserFound(true);
      setFullName(employee.full_name || '');
      setEmail(employee.email || '');
      setPhotoBase64(employee.photo_base64 || null);
      setStatus(employee.status || 'active');
      setRole(employee.role || 'employee');
      setDepartmentId(employee.department_id || '');
      setError(null);
      setSearchError(null);
    }
  }, [isCreateMode, employee, currentUser.department_id, currentUser.role]);

  useEffect(() => {
    if (!isCreateMode || !preselectedDepartmentName || !departments.length || departmentId) return;
    const found = departments.find((d) => d.name === preselectedDepartmentName);
    if (found) setDepartmentId(found.id);
  }, [isCreateMode, preselectedDepartmentName, departments, departmentId]);

  const handleSearchUser = async () => {
    const query = searchEmail.trim();
    if (!query) {
      setSearchError('Введите email для поиска');
      return;
    }

    try {
      setSearching(true);
      setSearchError(null);

      const users = await GraphUsersService.searchUserByEmail(query);
      if (!users.length) {
        setUserFound(false);
        setSearchError('Пользователь не найден');
        return;
      }

      const user = users[0];
      const photo = await GraphUsersService.getUserPhoto(user.id);
      const resolvedEmail = user.mail || user.userPrincipalName || query;

      setFullName(user.displayName || '');
      setEmail(resolvedEmail);
      setSearchEmail(resolvedEmail);
      setPhotoBase64(photo);
      setUserFound(true);
    } catch (err: unknown) {
      setUserFound(false);
      setSearchError(err instanceof Error ? err.message : 'Ошибка поиска пользователя');
    } finally {
      setSearching(false);
    }
  };

  const handleResetSearch = () => {
    setUserFound(false);
    setSearchEmail('');
    setFullName('');
    setEmail('');
    setPhotoBase64(null);
    setSearchError(null);
  };

  const handleCancelEdit = () => {
    if (isCreateMode) {
      onClose();
      return;
    }

    if (employee) {
      setFullName(employee.full_name || '');
      setEmail(employee.email || '');
      setPhotoBase64(employee.photo_base64 || null);
      setStatus(employee.status || 'active');
      setRole(employee.role || 'employee');
      setDepartmentId(employee.department_id || '');
    }

    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    if (isCreateMode && !userFound) {
      setError('Сначала найдите сотрудника по email');
      return;
    }

    if (!fullName.trim() || !email.trim()) {
      setError('Заполните имя и email');
      return;
    }

    const finalDepartmentId = canChangeDepartment ? departmentId : (currentUser.department_id || departmentId);
    const finalRole = canChangeRole ? role : (employee?.role || 'employee');

    if (!finalDepartmentId) {
      setError('Выберите отдел');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { data, error: saveError } = await supabase.rpc('upsert_user_profile', {
        p_email: email,
        p_full_name: fullName,
        p_department_id: finalDepartmentId,
        p_photo_base64: photoBase64,
        p_role: finalRole,
        p_status: status,
      });

      if (saveError) throw saveError;
      if (data) onSave(data);

      if (isCreateMode) {
        onClose();
      } else {
        setIsEditing(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  const titleName = fullName || (isCreateMode ? 'Новый сотрудник' : 'Без имени');
  const resolvedDepartmentName = departments.find((d) => d.id === departmentId)?.name
    || employee?.department_name
    || currentUser.department_name
    || 'Не указан';
  return (
    <div
      className={cn(
        'rounded-3xl shadow-glass border border-white/30 overflow-hidden flex flex-col glass-card',
        isMobile ? '' : 'm-4 max-w-xl animate-scale'
      )}
    >
      <div className="relative pl-24 pr-3 py-2 sm:pl-28 sm:pr-4 sm:py-2 min-h-[72px] sm:min-h-[96px] bg-gradient-to-r from-emerald-400/80 to-teal-400/80 text-white backdrop-blur-md">
        {isMobile && (
          <div className="flex justify-center mb-2 -mt-1">
            <div className="w-10 h-1 rounded-full bg-white/40" aria-hidden="true" />
          </div>
        )}

        <div className="absolute left-1 top-1 sm:left-2 sm:top-2">
          <div className="relative flex-shrink-0">
            {photoBase64 ? (
              <img
                src={photoBase64}
                alt=""
                aria-hidden="true"
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover border-2 border-white shadow-lg"
              />
            ) : (
              <div
                className={cn(
                  'h-16 w-16 sm:h-20 sm:w-20 rounded-2xl flex items-center justify-center text-white text-lg sm:text-xl font-bold shadow-lg border-2 border-white bg-gradient-to-br',
                  getAvatarGradient(titleName)
                )}
              >
                {getInitials(titleName)}
              </div>
            )}
            <span
              className={cn('absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white shadow-sm', statusConfig.dot)}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="flex min-h-[64px] sm:min-h-[80px] items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate drop-shadow-sm">{titleName}</h2>
              {isCreateMode ? <p className="text-xs sm:text-sm text-white/80 truncate">Создание сотрудника</p> : null}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && !isCreateMode && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label="Редактировать сотрудника"
                className="p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            {(isEditing || isCreateMode) && (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  aria-label="Отменить"
                  className="p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  aria-label="Сохранить"
                  className="p-2 hover:bg-white/20 rounded-xl transition-all text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                </button>
              </>
            )}

            {!isEditing && !isCreateMode && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="hidden md:flex p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={cn('p-4 sm:p-6 space-y-5', isMobile && 'flex-1 overflow-y-auto')}>
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        <section>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Контактная информация</h3>
          <div className="space-y-3">
            <div className="p-3 bg-white/60 rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg flex-shrink-0">
                  <Mail className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  {isCreateMode ? (
                    <>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
                          <input
                            type="email"
                            placeholder="Введите email"
                            value={searchEmail}
                            onChange={(e) => setSearchEmail(e.target.value)}
                            disabled={searching || userFound}
                            className={cn(
                              'w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border transition-all',
                              'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
                              userFound ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-white border-slate-300'
                            )}
                          />
                        </div>
                        {!userFound ? (
                          <Button
                            type="button"
                            onClick={handleSearchUser}
                            disabled={searching || !searchEmail.trim()}
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                          >
                            {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                            <span className="hidden sm:inline">Поиск</span>
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" onClick={handleResetSearch} className="gap-2">
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Сброс</span>
                          </Button>
                        )}
                      </div>
                      {searchError && <p className="mt-2 text-sm text-red-600">{searchError}</p>}
                    </>
                  ) : (
                    <p className="text-sm font-medium text-slate-700 truncate">{email || 'Не указан'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Организация</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100">
              <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <Building2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                {(isEditing || isCreateMode) && canChangeDepartment ? (
                  <select
                    id="edit-department"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  >
                    <option value="">Выберите отдел</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm font-medium text-slate-700 truncate">{resolvedDepartmentName}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100">
              <div className="p-2 bg-violet-100 rounded-lg flex-shrink-0">
                <UserCog className="h-4 w-4 text-violet-600" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                {(isEditing || isCreateMode) && canChangeRole ? (
                  <select
                    id="edit-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  >
                    <option value="employee">{getRoleLabel('employee')}</option>
                    <option value="head">{getRoleLabel('head')}</option>
                    <option value="chief">{getRoleLabel('chief')}</option>
                  </select>
                ) : (
                  <p className="text-sm font-medium text-slate-700">{getRoleLabel(role)}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Статус</h3>
          {(isEditing || isCreateMode) ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((item) => {
                const selected = status === item.value;
                const optionStatus = getStatusConfig(item.value);
                return (
                  <label
                    key={item.value}
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all',
                      'focus-within:ring-2 focus-within:ring-emerald-500',
                      selected ? optionStatus.color.replace('text-', 'border-').replace('bg-', 'bg-') : 'border-slate-200 hover:bg-slate-50 bg-white/60'
                    )}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={item.value}
                      checked={selected}
                      onChange={() => setStatus(item.value)}
                      className="sr-only"
                    />
                    <span className={cn('h-2.5 w-2.5 rounded-full', selected ? optionStatus.dot : 'bg-slate-300')} aria-hidden="true" />
                    <span className={cn('text-sm font-medium', selected ? optionStatus.color.split(' ').find((cls) => cls.startsWith('text-')) : 'text-slate-700')}>{item.label}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100">
              <span className={cn('h-2.5 w-2.5 rounded-full', statusConfig.dot)} aria-hidden="true" />
              <span className={cn('text-sm font-medium px-2 py-0.5 rounded-full', statusConfig.color)}>{statusConfig.label}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
