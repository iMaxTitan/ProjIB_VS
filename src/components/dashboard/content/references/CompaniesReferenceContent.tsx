'use client';

import React, { useState } from 'react';
import { Building2, Plus, Pencil, Server, Monitor } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useInfrastructure } from '@/hooks/useInfrastructure';
import InfrastructureModal from '@/components/infrastructure/InfrastructureModal';
import InfrastructureChart from '@/components/infrastructure/InfrastructureChart';
import InfrastructureHistoryTable from '@/components/infrastructure/InfrastructureHistoryTable';
import { isDataFresh, getPeriodLabel } from '@/types/infrastructure';
import type { CompanyWithInfrastructure } from '@/types/infrastructure';
import ReferencesTwoPanelLayout from './ReferencesTwoPanelLayout';
import ReferenceLeftPanelShell from './ReferenceLeftPanelShell';
import ReferenceEmptyState from './ReferenceEmptyState';
import ReferenceDetailsEmptyState from './ReferenceDetailsEmptyState';

export default function CompaniesReferenceContent({ user, tabsSlot }: { user: UserInfo; tabsSlot?: React.ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState<CompanyWithInfrastructure | null>(null);
  const [preselectedCompanyId, setPreselectedCompanyId] = useState<string | null>(null);

  const isMobile = useIsMobile();

  const {
    companies,
    selectedCompanyHistory,
    loading,
    historyLoading,
    error,
    selectedCompanyId,
    selectCompany,
    saveInfrastructure,
    deleteInfrastructure,
  } = useInfrastructure();

  const canEdit = user.role === 'chief' || user.role === 'head';
  const canDelete = user.role === 'chief';
  const selectedCompany = companies.find((company) => company.company_id === selectedCompanyId);

  const handleSelectCompany = (company: CompanyWithInfrastructure) => {
    selectCompany(selectedCompanyId === company.company_id ? null : company.company_id);
    if (isMobile && selectedCompanyId !== company.company_id) {
      setIsDrawerOpen(true);
    }
  };

  const handleCloseDetails = () => {
    selectCompany(null);
    setIsDrawerOpen(false);
  };

  const handleAddForCompany = (companyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditData(null);
    setPreselectedCompanyId(companyId);
    setIsModalOpen(true);
  };

  const handleEdit = (company: CompanyWithInfrastructure, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditData(company);
    setPreselectedCompanyId(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (infrastructureId: string) => {
    if (!confirm('Удалить эту запись?')) return;
    await deleteInfrastructure(infrastructureId, user.user_id);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditData(null);
    setPreselectedCompanyId(null);
  };

  const leftPanel = (
    <ReferenceLeftPanelShell
      tabsSlot={tabsSlot}
      loading={loading}
      error={error}
      isEmpty={companies.length === 0}
      loadingColorClass="border-blue-500"
      bodyClassName="space-y-1.5"
      emptyState={<ReferenceEmptyState icon={<Building2 className="h-12 w-12" aria-hidden="true" />} text="Предприятия не найдены" />}
      body={companies.map((company) => {
        const isFresh = company.period_year && company.period_month
          ? isDataFresh(company.period_year, company.period_month)
          : false;
        const isSelected = selectedCompanyId === company.company_id;

        return (
          <div
            key={company.company_id}
            role="button"
            tabIndex={0}
            onClick={() => handleSelectCompany(company)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectCompany(company);
              }
            }}
            aria-label={`Выбрать ${company.company_name}`}
            aria-current={isSelected ? 'true' : undefined}
            className={cn(
              'w-full p-3 rounded-xl border text-left transition-all group cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              'active:scale-[0.98]',
              isSelected
                ? 'bg-blue-50 border-blue-300 shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn('w-2 h-2 rounded-full flex-shrink-0', company.has_servers ? 'bg-purple-500' : 'bg-gray-300')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-medium truncate', isSelected ? 'text-blue-900' : 'text-slate-800')}>
                    {company.company_name}
                  </span>
                  {!isFresh && company.period_year && (
                    <span className="text-2xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Устарело</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Monitor className="h-3 w-3" aria-hidden="true" />
                    {company.workstations_count}
                  </span>
                  {company.has_servers && (
                    <span className="flex items-center gap-1">
                      <Server className="h-3 w-3" aria-hidden="true" />
                      {company.servers_count}
                    </span>
                  )}
                  {company.period_year && company.period_month && (
                    <span className={cn('px-1.5 py-0.5 rounded text-2xs', isFresh ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                      {getPeriodLabel(company.period_year, company.period_month)}
                    </span>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => handleAddForCompany(company.company_id, e)}
                    className="p-1.5 text-blue-500 hover:bg-blue-100 rounded transition-colors"
                    aria-label="Добавить запись"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {company.infrastructure_id && (
                    <button
                      type="button"
                      onClick={(e) => handleEdit(company, e)}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors"
                      aria-label="Редактировать"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      footer={
        <div className="flex items-center gap-2 text-slate-500">
          <Building2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <span className="text-sm">Всего предприятий: {companies.length}</span>
        </div>
      }
    />
  );

  const rightPanel = selectedCompany ? (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">{selectedCompany.company_name}</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-500">Компьютеры:</span>
            <span className="font-medium">{selectedCompany.workstations_count.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Серверы:</span>
            <span className="font-medium">{selectedCompany.servers_count.toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t pt-3">
            <span className="text-gray-500">Всего:</span>
            <span className="font-bold text-lg">{selectedCompany.total_endpoints.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <InfrastructureChart history={selectedCompanyHistory} loading={historyLoading} />

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">История изменений</h3>
        <InfrastructureHistoryTable
          history={selectedCompanyHistory}
          loading={historyLoading}
          onDelete={canDelete ? handleDelete : undefined}
          canDelete={canDelete}
        />
      </div>
    </div>
  ) : (
    <ReferenceDetailsEmptyState
      icon={<Building2 className="h-16 w-16" aria-hidden="true" />}
      title="Выберите предприятие"
      description="Нажмите на предприятие в списке слева для просмотра деталей"
    />
  );

  return (
    <>
      <ReferencesTwoPanelLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={handleCloseDetails}
        rightPanelClassName={cn('overscroll-contain', selectedCompany ? 'bg-blue-50/30' : 'bg-transparent')}
        mobileDrawerContentClassName="bg-slate-50"
        resizerClassName="hover:bg-blue-300/50 active:bg-blue-400/50"
      />

      <InfrastructureModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={saveInfrastructure}
        userId={user.user_id}
        editData={editData}
        preselectedCompanyId={preselectedCompanyId}
      />
    </>
  );
}
