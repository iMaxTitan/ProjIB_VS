'use client';

import React, { useState } from 'react';
import type { UserInfo } from '@/types/azure';
import { MONTH_NAMES_UK } from '@/types/planning';
import { usePlansV2 } from '@/hooks/usePlansV2';
import { usePlansV2Detail } from '@/hooks/usePlansV2Detail';
import { cn } from '@/lib/shared/utils';
import { PlansV2Provider } from './PlansV2Context';
import { Spinner } from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { Network, ListTree, Users } from 'lucide-react';
import { ThreePanelLayout } from '@/components/dashboard/shared';
import ProcessListPanel from './ProcessListPanel';
import ProcedureDetailPanel from './ProcedureDetailPanel';
import EmployeeTasksPanel from './EmployeeTasksPanel';
import { AnnualListView } from './AnnualViews';
import { QuarterlyListView } from './QuarterlyViews';
import { MonthlyCompaniesView, MonthlyUsersView, MonthlyPlansListView } from './MonthlyOverviewView';
import ProcessDetailView from './ProcessDetailView';

interface PlansV2ContentProps {
  user: UserInfo;
}

const MONTHS_BY_QUARTER: Record<number, { idx: number; name: string }[]> = {
  1: [{ idx: 1, name: 'Січень' }, { idx: 2, name: 'Лютий' }, { idx: 3, name: 'Березень' }],
  2: [{ idx: 4, name: 'Квітень' }, { idx: 5, name: 'Травень' }, { idx: 6, name: 'Червень' }],
  3: [{ idx: 7, name: 'Липень' }, { idx: 8, name: 'Серпень' }, { idx: 9, name: 'Вересень' }],
  4: [{ idx: 10, name: 'Жовтень' }, { idx: 11, name: 'Листопад' }, { idx: 12, name: 'Грудень' }],
};


export default function PlansV2Content({ user }: PlansV2ContentProps) {
  const data = usePlansV2(user);
  const {
    processTree, year, quarter, month,
    availableYears, availableQuarters,
    loading, hoursMap, resourceHours, processGoals,
    setYear, setQuarter, setMonth,
    selectProcess, selectProcedure,
    selectedProcessId, selectedProcedureId,
    selectedProcess, selectedProcedure,
    detailPlans, scopeMonths,
    viewLevel, annualPlans, quarterlyPlans,
    selectedAnnualPlan, selectedQuarterlyPlan,
    annualBudgetItems, annualBudgetSumMap, annualBudgetNamesMap, quarterlyBudgetSumMap, quarterlyBudgetItemsMap, quarterlyInitiatives, quarterlyInitiativesMap,
    monthlyPlans, monthlyCompanyHours, monthlyUserProcHours,
    availableBudgetItems,
  } = data;

  const detail = usePlansV2Detail(detailPlans, month);
  const { refreshData } = data;
  const canEdit = user.role === 'chief' || user.role === 'head';
  const isChief = user.role === 'chief';

  const [mobilePanel, setMobilePanel] = useState<string | null>(null);

  const scopeLabel = month
    ? `${MONTH_NAMES_UK[month - 1]} ${year}`
    : quarter
      ? `Q${quarter} ${year}`
      : `${year}`;

  // ─── Content blocks ──

  const centerContent = (
    <>
      {viewLevel === 'year' && !selectedProcess && (
        <AnnualListView annualPlans={annualPlans} processTree={processTree} year={year} annualBudgetSumMap={annualBudgetSumMap} annualBudgetNamesMap={annualBudgetNamesMap} canEdit={canEdit} isChief={isChief} onSelectProcess={selectProcess} onRefresh={refreshData} />
      )}
      {selectedProcess && !selectedProcedure && (
        <ProcessDetailView
          process={selectedProcess} viewLevel={viewLevel} year={year} quarter={quarter} month={month}
          annualPlan={selectedAnnualPlan} annualBudgetItems={annualBudgetItems} availableBudgetItems={availableBudgetItems}
          quarterlyPlan={selectedQuarterlyPlan} initiatives={quarterlyInitiatives}
          hoursMap={hoursMap} dailyTasks={detail.dailyTasks} canEdit={canEdit} onRefresh={refreshData} onClose={() => selectProcess('')}
        />
      )}
      {viewLevel === 'quarter' && !selectedProcess && quarter && (
        <QuarterlyListView quarterlyPlans={quarterlyPlans} processTree={processTree} annualPlans={annualPlans} quarterlyBudgetSumMap={quarterlyBudgetSumMap} quarterlyBudgetItemsMap={quarterlyBudgetItemsMap} quarterlyInitiativesMap={quarterlyInitiativesMap} quarter={quarter} year={year} canEdit={canEdit} isChief={isChief} onSelectProcess={selectProcess} onRefresh={refreshData} />
      )}
      {viewLevel === 'month' && !selectedProcess && month && (
        <MonthlyPlansListView processTree={processTree} monthlyPlans={monthlyPlans} companyHours={monthlyCompanyHours} year={year} month={month} canEdit={canEdit} isChief={isChief} scopeLabel={scopeLabel} onRefresh={refreshData} onSelectProcedure={selectProcedure} />
      )}
      {selectedProcedure && (
        <ProcedureDetailPanel
          selectedProcess={selectedProcess} selectedProcedure={selectedProcedure} viewLevel={viewLevel}
          year={year} month={month} scopeLabel={scopeLabel} scopeMonths={scopeMonths}
          companies={detail.companies} projects={detail.projects} kbDocs={detail.kbDocs}
          assignees={detail.assignees} rawAssignees={detail.rawAssignees}
          hoursMap={hoursMap} processGoals={processGoals} initiatives={quarterlyInitiatives}
          onClose={() => selectProcess('')}
        />
      )}
    </>
  );

  const rightContent = viewLevel === 'month' && !selectedProcess ? (
    <MonthlyUsersView userProcHours={monthlyUserProcHours} processTree={processTree} scopeLabel={scopeLabel} />
  ) : (
    <EmployeeTasksPanel
      selectedProcess={selectedProcess} selectedProcedure={selectedProcedure} detailPlans={detailPlans}
      dailyTasks={detail.dailyTasks} tasksLoading={detail.tasksLoading}
      assignees={detail.assignees} assigneesLoading={detail.assigneesLoading}
      scopeLabel={scopeLabel} scopeMonths={scopeMonths} month={month} resourceHours={resourceHours}
      viewLevel={viewLevel}
    />
  );

  const leftPanel = (
    <ProcessListPanel
      processTree={processTree} viewLevel={viewLevel}
      selectedProcessId={selectedProcessId} selectedProcedureId={selectedProcedureId}
      onSelectProcess={selectProcess} onSelectProcedure={selectProcedure}
      resourceHours={resourceHours} annualPlans={annualPlans} quarterlyPlans={quarterlyPlans}
      quarter={quarter} canEdit={canEdit} onRefresh={refreshData}
    />
  );

  const mobileLeftPanel = (
    <ProcessListPanel
      processTree={processTree} viewLevel={viewLevel}
      selectedProcessId={selectedProcessId} selectedProcedureId={selectedProcedureId}
      onSelectProcess={(id) => { selectProcess(id); setMobilePanel(null); }}
      onSelectProcedure={(procId, procedureId) => { selectProcedure(procId, procedureId); setMobilePanel(null); }}
      resourceHours={resourceHours} annualPlans={annualPlans} quarterlyPlans={quarterlyPlans}
      quarter={quarter} canEdit={canEdit} onRefresh={refreshData}
    />
  );

  const filtersBlock = (
    <div className="glass-panel rounded-xl flex-shrink-0 p-1 lg:p-2">
      <div className="flex flex-col gap-0.5 lg:gap-1">
        <div className="flex items-center gap-0.5">
          <div className="nav-group flex-1 min-w-0">
            {availableYears.map(y => (
              <button key={y} onClick={() => setYear(y)}
                className={cn('nav-btn flex-1 min-w-0', y === year && 'active')}
                style={{ padding: '3px 2px' }}>
                {y}
              </button>
            ))}
          </div>
          <div className="nav-group flex-1 min-w-0">
            {[1, 2, 3, 4].map(q => (
              <button key={q} onClick={() => setQuarter(q === quarter ? null : q)}
                className={cn('nav-btn flex-1 min-w-0', q === quarter && 'active')}
                style={{ padding: '3px 2px' }}>
                Q{q}
              </button>
            ))}
          </div>
        </div>
        <div className="nav-group flex-1">
          {MONTHS_BY_QUARTER[quarter || Math.ceil((new Date().getMonth() + 1) / 3)].map(m => (
            <button key={m.idx} onClick={() => setMonth(m.idx === month ? null : m.idx)}
              className={cn('nav-btn flex-1', m.idx === month && 'active')}
              style={{ width: 'auto', padding: '3px 4px' }}>
              {m.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <PlansV2Provider user={user} onRefresh={refreshData}>
    <div className="px-1 lg:px-2 pt-1 lg:pt-2 pb-2 min-h-full bg-slate-200">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : processTree.length === 0 ? (
        <EmptyState
          variant="centered"
          icon={<Network className="h-12 w-12" />}
          title="Немає процесів"
          description="За обраний період не знайдено планів у розрізі процесів"
        />
      ) : (
        <ThreePanelLayout
          filters={filtersBlock}
          leftPanel={leftPanel}
          centerPanel={centerContent}
          rightPanel={rightContent}
          mobileLeftPanel={mobileLeftPanel}
          mobilePanel={mobilePanel}
          onMobilePanelChange={setMobilePanel}
          mobileFabs={[
            { id: 'procs', label: 'Процеси', icon: ListTree, variant: 'procs' },
            { id: 'employees', label: 'Працівники', icon: Users, variant: 'tasks' },
          ]}
        />
      )}
    </div>
    </PlansV2Provider>
  );
}
