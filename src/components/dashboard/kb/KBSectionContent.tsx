'use client';

import React, { useState } from 'react';
import { BarChart3, BookOpen, ShieldCheck, Search, Scale } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import DashboardTopTabs, { DashboardTopTabItem } from '../shared/DashboardTopTabs';
import KBContent from './KBContent';
import KBAnalyticsContent from './KBAnalyticsContent';
import KBValidatorContent from './KBValidatorContent';
import KBSearchContent from './KBSearchContent';
import KBLawsContent from './KBLawsContent';

type KBView = 'search' | 'documents' | 'analytics' | 'validator' | 'laws';

const KB_TABS: DashboardTopTabItem<KBView>[] = [
  { id: 'search',     label: 'Пошук',         shortLabel: 'Пошук',    icon: Search,      tone: 'indigo' },
  { id: 'documents',  label: 'Документи',     shortLabel: 'Доки',     icon: BookOpen,    tone: 'indigo' },
  { id: 'laws',       label: 'Законодавство', shortLabel: 'Закони',   icon: Scale,       tone: 'blue' },
  { id: 'analytics',  label: 'Аналітика',     shortLabel: 'Аналіт.',  icon: BarChart3,   tone: 'purple' },
  { id: 'validator',  label: 'Перевірка',     shortLabel: 'Перевір.', icon: ShieldCheck, tone: 'emerald'},
];

interface Props {
  user: UserInfo;
}

export default function KBSectionContent({ user }: Props) {
  const [view, setView] = useState<KBView>('search');
  const [autoOpenUpload, setAutoOpenUpload] = useState(false);

  const handleRequestUpload = () => {
    setView('documents');
    setAutoOpenUpload(true);
  };

  const tabs = (
    <DashboardTopTabs
      selected={view}
      items={KB_TABS}
      onSelect={setView}
      ariaLabel="Навигация по базе знаний"
      iconOnly
    />
  );

  return (
    <div className="h-full overflow-hidden bg-indigo-50/30">
      {view === 'validator' ? (
        <KBValidatorContent user={user} tabsSlot={tabs} onRequestUpload={handleRequestUpload} />
      ) : view === 'analytics' ? (
        <KBAnalyticsContent user={user} tabsSlot={tabs} />
      ) : view === 'search' ? (
        <KBSearchContent user={user} tabsSlot={tabs} />
      ) : view === 'laws' ? (
        <KBLawsContent user={user} tabsSlot={tabs} />
      ) : (
        <KBContent
          user={user}
          tabsSlot={tabs}
          autoOpenUpload={autoOpenUpload}
          onAutoOpenUploadHandled={() => setAutoOpenUpload(false)}
        />
      )}
    </div>
  );
}
