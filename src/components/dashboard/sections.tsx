import React from 'react';
import dynamic from 'next/dynamic';
import { UserInfo } from '@/types/azure';
import { Spinner } from '@/components/ui/Spinner';

// Lazy-load each section — only the active one is fetched
const ActivityContent = dynamic(() => import('@/components/dashboard/activity/ActivityContent'), { loading: () => <SectionLoader /> });
const PlannerContent = dynamic(() => import('@/components/dashboard/planner/PlannerContent'), { loading: () => <SectionLoader /> });
const ReportsContent = dynamic(() => import('@/components/dashboard/reports/ReportsContent'), { loading: () => <SectionLoader /> });
const SummaryTabContent = dynamic(() => import('@/components/dashboard/reports/SummaryTabContent'), { loading: () => <SectionLoader /> });
const KPIContent = dynamic(() => import('@/components/dashboard/kpi/KPIContent'), { loading: () => <SectionLoader /> });
const ReferencesContent = dynamic(() => import('@/components/dashboard/references/ReferencesContent'), { loading: () => <SectionLoader /> });
const BotSectionContent = dynamic(() => import('@/components/dashboard/bot/BotSectionContent'), { loading: () => <SectionLoader /> });
const KBSectionContent = dynamic(() => import('@/components/dashboard/kb/KBSectionContent'), { loading: () => <SectionLoader /> });
const CabinetContent = dynamic(() => import('@/components/dashboard/cabinet/CabinetContent'), { loading: () => <SectionLoader /> });
const PlansV2Content = dynamic(() => import('@/components/dashboard/plans/v2/PlansV2Content'), { loading: () => <SectionLoader /> });

function SectionLoader() {
  return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  );
}

export type DashboardSectionKey = 'statistics' | 'plans' | 'planner' | 'reports' | 'summary' | 'kpi' | 'references' | 'bot' | 'kb' | 'cabinet';

interface DashboardSectionRenderProps {
  user: UserInfo;
}

const SECTION_RENDERERS: Record<
  DashboardSectionKey,
  (props: DashboardSectionRenderProps) => React.ReactNode
> = {
  statistics: ({ user }) => <ActivityContent user={user} />,
  plans: ({ user }) => <PlansV2Content user={user} />,
  planner: () => <PlannerContent />,
  reports: () => <ReportsContent />,
  summary: ({ user }) => <SummaryTabContent user={user} />,
  kpi: ({ user }) => <KPIContent user={user} />,
  references: ({ user }) => <ReferencesContent user={user} />,
  bot: ({ user }) => <BotSectionContent user={user} />,
  kb: ({ user }) => <KBSectionContent user={user} />,
  cabinet: ({ user }) => <CabinetContent user={user} />,
};

export function getDashboardSectionFromPath(activePath: string): DashboardSectionKey {
  if (activePath === '/' || activePath === '/dashboard') return 'statistics';

  const section = activePath.split('/').pop();
  switch (section) {
    case 'statistics':
    case 'plans':
    case 'planner':
    case 'reports':
    case 'summary':
    case 'kpi':
    case 'references':
    case 'bot':
    case 'kb':
    case 'cabinet':
      return section;
    default:
      return 'statistics';
  }
}

export function renderDashboardSection(
  section: DashboardSectionKey,
  props: DashboardSectionRenderProps
): React.ReactNode {
  return SECTION_RENDERERS[section](props);
}

export function isDashboardSectionFullHeight(_section: DashboardSectionKey): boolean {
  // All sections use full-height inner scroll
  return true;
}
