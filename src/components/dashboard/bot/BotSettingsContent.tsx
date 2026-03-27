'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Bot, Loader2, Shield, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { UserInfo } from '@/types/azure';
import {
  telegramPermissionsQueryOptions,
  useUpdatePermission,
  telegramNotificationSettingsQueryOptions,
  useUpdateNotificationSetting,
  type TelegramPermission,
  type TelegramToolInfo,
} from '@/lib/ops/telegram-queries';

interface Props {
  user: UserInfo;
  tabsSlot?: React.ReactNode;
}

const ROLES = ['employee', 'head', 'chief'] as const;
const ROLE_LABELS: Record<string, string> = {
  employee: 'Співробітник',
  head: 'Керівник',
  chief: 'Начальник',
};
const SCOPE_LABELS: Record<string, string> = {
  own: 'Свої',
  department: 'Відділ',
  all: 'Всі',
};

export default function BotSettingsContent({ user, tabsSlot }: Props) {
  const isChief = user.role === 'chief';

  const { data, isLoading, error } = useQuery(telegramPermissionsQueryOptions());
  const updatePerm = useUpdatePermission();

  const { data: notifData, isLoading: notifLoading } = useQuery(telegramNotificationSettingsQueryOptions());
  const updateNotif = useUpdateNotificationSetting();
  const notifSettings = notifData?.settings || [];

  const permissions = data?.permissions || [];
  const tools = data?.tools || [];

  const getPerm = (role: string, toolName: string): TelegramPermission | undefined =>
    permissions.find(p => p.role === role && p.tool_name === toolName);

  const handleToggle = (role: string, toolName: string, currentEnabled: boolean) => {
    updatePerm.mutate({ role, toolName, isEnabled: !currentEnabled });
  };

  const handleScopeChange = (role: string, toolName: string, newScope: string) => {
    updatePerm.mutate({ role, toolName, scope: newScope });
  };

  if (!isChief) {
    return (
      <div className="h-full flex flex-col">
        {tabsSlot}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <Shield className="h-12 w-12 mx-auto mb-3 text-slate-300" aria-hidden="true" />
            <p className="text-sm">Управління ботом доступне тільки начальнику</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {tabsSlot}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Notification settings */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 rounded-xl">
              <Bell className="h-5 w-5 text-amber-600" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Бот — Сповіщення</h2>
              <p className="text-sm text-slate-500">Глобальне увімкнення/вимкнення типів сповіщень</p>
            </div>
          </div>

          {notifLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" aria-hidden="true" />
              <span className="text-sm text-slate-500">Завантаження...</span>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              {notifSettings.map((s, idx) => (
                <div
                  key={s.event_type}
                  className={cn(
                    'flex items-center justify-between px-4 py-3',
                    idx < notifSettings.length - 1 && 'border-b border-slate-100'
                  )}
                >
                  <span className="text-sm font-medium text-slate-800">{s.label}</span>
                  <button
                    type="button"
                    onClick={() => updateNotif.mutate({ eventType: s.event_type, isEnabled: !s.is_enabled })}
                    disabled={updateNotif.isPending}
                    aria-label={`${s.is_enabled ? 'Вимкнути' : 'Увімкнути'} ${s.label}`}
                    className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                  >
                    {s.is_enabled ? (
                      <ToggleRight className="h-7 w-7 text-blue-600" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-slate-300" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tool permissions matrix */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-xl">
              <Bot className="h-5 w-5 text-blue-600" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Бот — Дозволи</h2>
              <p className="text-sm text-slate-500">Матриця дозволів: які інструменти доступні кожній ролі</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" aria-hidden="true" />
              <span className="ml-2 text-sm text-slate-500">Завантаження...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              Помилка завантаження: {error instanceof Error ? error.message : 'Unknown'}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-700 min-w-[140px]">Інструмент</th>
                      {ROLES.map(role => (
                        <th key={role} className="text-center px-4 py-3 font-semibold text-slate-700 min-w-[160px]">
                          {ROLE_LABELS[role]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool: TelegramToolInfo, idx: number) => (
                      <tr key={tool.name} className={cn('border-b border-slate-100', idx % 2 === 1 && 'bg-slate-50/50')}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{tool.label}</div>
                          <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{tool.description}</div>
                        </td>
                        {ROLES.map(role => {
                          const perm = getPerm(role, tool.name);
                          const enabled = perm?.is_enabled ?? false;
                          const scope = perm?.scope ?? 'own';

                          return (
                            <td key={role} className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggle(role, tool.name, enabled)}
                                  disabled={updatePerm.isPending}
                                  aria-label={`${enabled ? 'Вимкнути' : 'Увімкнути'} ${tool.label} для ${ROLE_LABELS[role]}`}
                                  className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                                >
                                  {enabled ? (
                                    <ToggleRight className="h-6 w-6 text-blue-600" />
                                  ) : (
                                    <ToggleLeft className="h-6 w-6 text-slate-300" />
                                  )}
                                </button>
                                {enabled && (
                                  <select
                                    value={scope}
                                    onChange={(e) => handleScopeChange(role, tool.name, e.target.value)}
                                    disabled={updatePerm.isPending}
                                    aria-label={`Scope ${tool.label} для ${ROLE_LABELS[role]}`}
                                    className="text-xs px-2 py-1 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    {tool.supportedScopes.map(s => (
                                      <option key={s} value={s}>{SCOPE_LABELS[s] || s}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
