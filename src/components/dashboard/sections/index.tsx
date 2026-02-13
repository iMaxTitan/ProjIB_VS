import React from 'react';
import { UserInfo } from '@/types/azure';
import ActivityContent from '@/components/dashboard/content/ActivityContent';
import ReportsContent from '@/components/dashboard/content/ReportsContent';
import ReferencesContent from '@/components/dashboard/content/ReferencesContent';
import KPIContent from '@/components/dashboard/content/KPIContent';
import PlansContent from '@/components/plans/PlansContent';
import SummaryTabContent from '@/components/dashboard/content/reports/SummaryTabContent';

export type DashboardSectionKey = 'statistics' | 'plans' | 'reports' | 'summary' | 'kpi' | 'references';

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
  reports: () => <ReportsContent />,
  summary: ({ user }) => <SummaryTabContent user={user} />,
  kpi: () => <KPIContent />,
  references: ({ user }) => <ReferencesContent user={user} />,
};

export function getDashboardSectionFromPath(activePath: string): DashboardSectionKey {
  if (activePath === '/' || activePath === '/dashboard') return 'statistics';

  const section = activePath.split('/').pop();
  switch (section) {
    case 'statistics':
    case 'plans':
    case 'reports':
    case 'summary':
    case 'kpi':
    case 'references':
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
  return section === 'statistics' || section === 'plans' || section === 'reports' || section === 'summary' || section === 'references' || section === 'kpi';
}
