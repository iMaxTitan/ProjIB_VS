import React from 'react';
import dynamic from 'next/dynamic';
import { UserInfo } from '@/types/azure';
import { Spinner } from '@/components/ui/Spinner';

// Lazy-load each section — only the active one is fetched
const ActivityContent = dynamic(() => import('@/components/dashboard/activity/ActivityContent'), { loading: () => <SectionLoader /> });
const PlansContent = dynamic(() => import('@/components/dashboard/plans/PlansContent'), { loading: () => <SectionLoader /> });
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

export type DashboardSectionKey = 'statistics' | 'plans' | 'plans-v2' | 'planner' | 'reports' | 'summary' | 'kpi' | 'references' | 'bot' | 'kb' | 'cabinet';

interface DashboardSectionRenderProps {
  user: UserInfo;
  fetchPlanCounts?: () => void;
}

const SECTION_RENDERERS: Record<
  DashboardSectionKey,
  (props: DashboardSectionRenderProps) => React.ReactNode
> = {
  statistics: ({ user }) => <ActivityContent user={user} />,
  plans: ({ user, fetchPlanCounts }) => <PlansContent user={user} fetchPlanCounts={fetchPlanCounts} />,
  'plans-v2': ({ user }) => <PlansV2Content user={user} />,
  planner: () => <PlannerContent />,
  reports: () => <ReportsContent />,
  summary: ({ user }) => <SummaryTabContent user={user} />,
  kpi: () => <KPIContent />,
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
    case 'plans-v2':
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

export function isDashboardSectionFullHeight(section: DashboardSectionKey): boolean {
  return section === 'statistics' || section === 'plans' || section === 'plans-v2' || section === 'planner' || section === 'reports' || section === 'summary' || section === 'references' || section === 'kpi' || section === 'bot' || section === 'kb' || section === 'cabinet';
}
