'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Copy, Check, Loader2, Unlink, Bell } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DetailSection } from '@/components/dashboard/shared';
import {
  telegramStatusQueryOptions,
  teamsLinkStatusQueryOptions,
  useGenerateVerifyCode,
  useUnlinkTelegram,
  useLinkTeams,
  useUnlinkTeams,
  useUpdateNotificationChannel,
} from '@/lib/ops/telegram-queries';

interface BotSectionProps {
  isOwnProfile: boolean;
}

export default function BotSection({ isOwnProfile }: BotSectionProps) {
  if (!isOwnProfile) return null;

  return (
    <>
      <ChannelsSection />
      <NotificationSection />
    </>
  );
}

// ─── Канали зв'язку ────────────────────────────────────────────────────────────

function ChannelsSection() {
  const { data: tgStatus, isLoading: tgLoading } = useQuery(telegramStatusQueryOptions());
  const { data: teamsStatus, isLoading: teamsLoading } = useQuery(teamsLinkStatusQueryOptions());
  const generateCode = useGenerateVerifyCode();
  const unlinkTg = useUnlinkTelegram();
  const linkTeams = useLinkTeams();
  const unlinkTeams = useUnlinkTeams();
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DetailSection title="Канали зв'язку" colorScheme="indigo">
      <div className="space-y-2">
        {/* Telegram */}
        <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
          <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
            <Bot className="h-4 w-4 text-blue-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Telegram</p>
            {tgLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
            ) : tgStatus?.linked ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-700">
                  {tgStatus.username ? `@${tgStatus.username}` : 'Привʼязано'}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unlinkTg.mutate()}
                  disabled={unlinkTg.isPending}
                  aria-label="Відвʼязати Telegram"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-95"
                >
                  {unlinkTg.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Unlink className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-500 mb-2">Не підключено</p>
                {generateCode.data?.code ? (
                  <div className="flex items-center gap-2">
                    <code className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg font-mono text-sm tracking-wider">
                      {generateCode.data.code}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(generateCode.data!.code)}
                      aria-label="Скопіювати код"
                      className="p-1.5 rounded-lg hover:bg-slate-100 focus-ring active:scale-95 transition-[background-color,transform] duration-base"
                    >
                      {copied
                        ? <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
                        : <Copy className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                    </button>
                    <span className="text-xs text-slate-400">10 хв</span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => generateCode.mutate()}
                    disabled={generateCode.isPending}
                    aria-label="Отримати код привʼязки Telegram"
                    className="gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95"
                  >
                    {generateCode.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    <span>Отримати код</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
          <div className="p-2 bg-indigo-100 rounded-lg flex-shrink-0">
            <Bot className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Teams</p>
            {teamsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
            ) : teamsStatus?.linked ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-700">Підключено</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unlinkTeams.mutate()}
                  disabled={unlinkTeams.isPending}
                  aria-label="Відʼєднати Teams"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-95"
                >
                  {unlinkTeams.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Unlink className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-500">Не підключено</p>
                <Button
                  size="sm"
                  onClick={() => linkTeams.mutate()}
                  disabled={linkTeams.isPending}
                  aria-label="Підключити Teams"
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95"
                >
                  {linkTeams.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  <span>Підключити</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </DetailSection>
  );
}

// ─── Сповіщення ────────────────────────────────────────────────────────────────

const CHANNEL_OPTIONS: { value: 'telegram' | 'teams' | 'both'; label: string }[] = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'teams', label: 'Teams' },
  { value: 'both', label: 'Обидва' },
];

function NotificationSection() {
  const { data: tgStatus, isLoading } = useQuery(telegramStatusQueryOptions());
  const updateChannel = useUpdateNotificationChannel();

  const current = tgStatus?.notificationChannel ?? 'telegram';

  return (
    <DetailSection title="Сповіщення" colorScheme="indigo">
      <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100">
        <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
          <Bell className="h-4 w-4 text-blue-600" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Канал для сповіщень</p>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
          ) : (
            <div className="flex gap-1.5" role="group" aria-label="Вибір каналу сповіщень">
              {CHANNEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (opt.value !== current) updateChannel.mutate(opt.value);
                  }}
                  disabled={updateChannel.isPending}
                  aria-pressed={current === opt.value}
                  aria-label={`Сповіщення через ${opt.label}`}
                  className={[
                    'px-3 py-1.5 text-sm rounded-lg border',
                    'transition-[background-color,border-color,color,transform] duration-base',
                    'focus-ring active:scale-95',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    current === opt.value
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </DetailSection>
  );
}
