'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Briefcase, Building2, Clock, Loader2, Mail, RotateCcw, Search, UserCog, Bot, Key, Bell } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { ensurePhotoSize } from '@/lib/ops/photo-resize';
import { useDepartments, useEmployeeSave, useBotStatus, type Department } from '@/hooks/useEmployees';
import { GraphUsersService } from '@/lib/ops/graph';
import { Button } from '@/components/ui/Button';
import { DbUserInfo, UserStatus } from '@/types/db-user';
import { UserInfo } from '@/types/azure';
import { getAvatarGradient, getInitials, getRoleLabel, getStatusConfig } from './EmployeeCard';
import { GradientDetailCard, DetailSection } from '@/components/dashboard/shared';

interface EmployeeDetailsProps {
  employee: DbUserInfo | null;
  mode?: 'view' | 'create';
  currentUser: UserInfo;
  onClose: () => void;
  onSave: (employee: DbUserInfo) => void;
  canEdit?: boolean;
  preselectedDepartmentName?: string | null;
}

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: 'active', label: 'Активный' },
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
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [searchEmail, setSearchEmail] = useState('');
  const [userFound, setUserFound] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const [position, setPosition] = useState('');
  const [workRate, setWorkRate] = useState<number>(1.0);
  const [status, setStatus] = useState<UserStatus>('active');
  const [role, setRole] = useState<string>('employee');
  const [departmentId, setDepartmentId] = useState<string>('');

  const { departments } = useDepartments();
  const { saving, saveEmployee } = useEmployeeSave();

  const canChangeRole = currentUser.role === 'chief';
  const canChangeDepartment = currentUser.role === 'chief';

  const statusConfig = useMemo(
    () => getStatusConfig(status),
    [status]
  );

  useEffect(() => {
    if (isCreateMode) {
      setIsEditing(true);
      setSearchEmail('');
      setUserFound(false);
      setFullName('');
      setEmail('');
      setPhotoBase64(null);
      setPosition('');
      setWorkRate(1.0);
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
      setWorkRate(employee.work_rate ?? 1.0);
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
      setWorkRate(employee.work_rate ?? 1.0);
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
      setError(null);

      // Ensure photo is within size limits (max 200×200, JPEG 0.7)
      const resizedPhoto = await ensurePhotoSize(photoBase64);

      const saved = await saveEmployee({
        email, fullName, departmentId: finalDepartmentId,
        photoBase64: resizedPhoto, role: finalRole, status,
        position: position || null, workRate,
      });
      if (saved) onSave(saved);

      if (isCreateMode) {
        onClose();
      } else {
        setIsEditing(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка при сохранении');
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
      headerIcon={<UserCog />}
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
          <div className="p-3 bg-white/60 rounded-xl border border-slate-100">
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
          <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
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

          <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
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
                  placeholder="Должність"
                  aria-label="Должність"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                />
              ) : (
                <p className="text-sm font-medium text-slate-700">{position || 'Не вказана'}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
            <div className="p-2 bg-cyan-100 rounded-lg flex-shrink-0">
              <Clock className="h-4 w-4 text-cyan-600" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              {(isEditing || isCreateMode) ? (
                <select
                  id="edit-work-rate"
                  value={String(workRate)}
                  onChange={(e) => setWorkRate(Number(e.target.value))}
                  aria-label="Ставка сотрудника"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                >
                  <option value="0.25">0.25 ставки</option>
                  <option value="0.5">0.5 ставки</option>
                  <option value="0.75">0.75 ставки</option>
                  <option value="1">Повна ставка</option>
                </select>
              ) : (
                <p className="text-sm font-medium text-slate-700">
                  {workRate === 1 ? 'Повна ставка' : `${workRate} ставки`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
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
          <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
            <span className={cn('h-2.5 w-2.5 rounded-full', statusConfig.dot)} aria-hidden="true" />
            <span className={cn('text-sm font-medium px-2 py-0.5 rounded-full', statusConfig.color)}>{statusConfig.label}</span>
          </div>
        )}
      </DetailSection>

      {/* Бот — read-only статус */}
      {!isCreateMode && employee?.user_id && (
        <BotStatusSection userId={employee.user_id} />
      )}
    </GradientDetailCard>
  );
}

// ─── Read-only статус бота ─────────────────────────────────────────────────────

function BotStatusSection({ userId }: { userId: string }) {
  const { data, isLoading } = useBotStatus(userId);

  const CHANNEL_LABELS: Record<string, string> = { telegram: 'Telegram', teams: 'Teams', both: 'Обидва' };

  return (
    <DetailSection title="Бот" colorScheme="indigo">
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {/* Telegram */}
          <div className="flex items-center gap-2 p-2.5 bg-white/60 rounded-xl border border-slate-100">
            <Bot className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Telegram</p>
              {data?.telegram_is_active ? (
                <p className="text-xs font-medium text-emerald-600 truncate">
                  {data.telegram_username ? `@${data.telegram_username}` : 'підключено'}
                </p>
              ) : (
                <p className="text-xs text-slate-400">не підключено</p>
              )}
            </div>
          </div>

          {/* Teams */}
          <div className="flex items-center gap-2 p-2.5 bg-white/60 rounded-xl border border-slate-100">
            <Bot className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Teams</p>
              {data?.teams_is_active ? (
                <p className="text-xs font-medium text-emerald-600">підключено</p>
              ) : (
                <p className="text-xs text-slate-400">не підключено</p>
              )}
            </div>
          </div>

          {/* AI ключ */}
          <div className="flex items-center gap-2 p-2.5 bg-white/60 rounded-xl border border-slate-100">
            <Key className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">AI ключ</p>
              {data?.ai_provider ? (
                <p className="text-xs font-medium text-emerald-600">{data.ai_provider}</p>
              ) : (
                <p className="text-xs text-slate-400">не налаштовано</p>
              )}
            </div>
          </div>

          {/* Канал сповіщень */}
          <div className="flex items-center gap-2 p-2.5 bg-white/60 rounded-xl border border-slate-100">
            <Bell className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Сповіщення</p>
              <p className="text-xs font-medium text-indigo-600">
                {CHANNEL_LABELS[data?.notification_channel ?? 'telegram'] ?? 'Telegram'}
              </p>
            </div>
          </div>
        </div>
      )}
    </DetailSection>
  );
}
