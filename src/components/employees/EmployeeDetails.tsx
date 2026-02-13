'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Briefcase, Building2, Loader2, Mail, RotateCcw, Search, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { ensurePhotoSize } from '@/lib/utils/photo-resize';
import { GraphUsersService } from '@/services/graph';
import { Button } from '@/components/ui/Button';
import { SupabaseUserInfo, UserStatus } from '@/types/supabase';
import { UserInfo } from '@/types/azure';
import { getAvatarGradient, getInitials, getRoleLabel, getStatusConfig } from './EmployeeCard';
import { GradientDetailCard, DetailSection } from '@/components/dashboard/content/shared';

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

  const [position, setPosition] = useState('');
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
      setPosition('');
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
      setPosition(employee.position || '');
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
      setPosition(employee.position || '');
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

      // Ensure photo is within size limits (max 200×200, JPEG 0.7)
      const resizedPhoto = await ensurePhotoSize(photoBase64);

      const { data, error: saveError } = await supabase.rpc('upsert_user_profile', {
        p_email: email,
        p_full_name: fullName,
        p_department_id: finalDepartmentId,
        p_photo_base64: resizedPhoto,
        p_role: finalRole,
        p_status: status,
        p_position: position || null,
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

  const modeLabel = isCreateMode ? 'Создать' : isEditing ? 'Редактирование' : 'Просмотр';

  return (
    <GradientDetailCard
      modeLabel={modeLabel}
      isEditing={isEditing}
      canEdit={canEdit}
      gradientClassName="from-emerald-400/80 to-teal-400/80"
      onEdit={() => setIsEditing(true)}
      onSave={handleSave}
      onCancel={handleCancelEdit}
      onClose={onClose}
      saving={saving}
    >
      {/* Avatar + Name */}
      <section>
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            {photoBase64 ? (
              <Image
                src={photoBase64}
                alt=""
                width={80}
                height={80}
                unoptimized
                aria-hidden="true"
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover border-2 border-emerald-200 shadow-lg"
              />
            ) : (
              <div
                className={cn(
                  'h-16 w-16 sm:h-20 sm:w-20 rounded-2xl flex items-center justify-center text-white text-lg sm:text-xl font-bold shadow-lg border-2 border-emerald-200 bg-gradient-to-br',
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
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{titleName}</h2>
            {isCreateMode && (
              <p className="text-sm text-emerald-600 font-medium">Создание сотрудника</p>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Contact info */}
      <DetailSection title="Контактная информация" colorScheme="emerald">
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
                            'w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border transition-colors',
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
      </DetailSection>

      {/* Organization */}
      <DetailSection title="Организация" colorScheme="emerald">
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
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
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
            <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
              <Briefcase className="h-4 w-4 text-amber-600" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              {(isEditing || isCreateMode) ? (
                <input
                  id="edit-position"
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Должность"
                  aria-label="Должность"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                />
              ) : (
                <p className="text-sm font-medium text-slate-700">{position || 'Не указана'}</p>
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
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
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
      </DetailSection>

      {/* Status */}
      <DetailSection title="Статус" colorScheme="emerald">
        {(isEditing || isCreateMode) ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((item) => {
              const selected = status === item.value;
              const optionStatus = getStatusConfig(item.value);
              return (
                <label
                  key={item.value}
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors',
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
      </DetailSection>
    </GradientDetailCard>
  );
}
