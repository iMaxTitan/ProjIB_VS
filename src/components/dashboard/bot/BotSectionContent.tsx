'use client';

/**
 * Bot section — обгортка з табами: Налаштування | Голосовий бот.
 */

import React, { useState } from 'react';
import { Bot, Mic } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import DashboardTopTabs, { DashboardTopTabItem } from '../shared/DashboardTopTabs';
import BotSettingsContent from './BotSettingsContent';
import VoiceBotContent from '@/components/dashboard/voice/VoiceBotContent';

type BotView = 'settings' | 'voice';

const BOT_TABS: DashboardTopTabItem<BotView>[] = [
  { id: 'settings', label: 'Налаштування', shortLabel: 'Налашт.', icon: Bot,  tone: 'indigo' },
  { id: 'voice',    label: 'Голосовий бот', shortLabel: 'Голос',   icon: Mic, tone: 'emerald' },
];

interface Props {
  user: UserInfo;
}

export default function BotSectionContent({ user }: Props) {
  const [view, setView] = useState<BotView>('settings');

  const voiceEnabled = process.env.NEXT_PUBLIC_VOICE_BOT_ENABLED === 'true';

  // Якщо Voice Bot вимкнений — показуємо без табів
  if (!voiceEnabled) {
    return <BotSettingsContent user={user} />;
  }

  const tabs = (
    <DashboardTopTabs
      selected={view}
      items={BOT_TABS}
      onSelect={setView}
      ariaLabel="Bot navigation"
      iconOnly
    />
  );

  return (
    <div className="h-full overflow-hidden bg-indigo-50/30">
      {view === 'voice' ? (
        <VoiceBotContent user={user} tabsSlot={tabs} />
      ) : (
        <BotSettingsContent user={user} tabsSlot={tabs} />
      )}
    </div>
  );
}
