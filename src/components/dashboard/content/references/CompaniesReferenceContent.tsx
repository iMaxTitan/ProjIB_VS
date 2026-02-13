'use client';

import React, { useState, useCallback } from 'react';
import { Building2, Plus, Server, Monitor, Hash, User, FileSignature, Banknote, CalendarDays } from 'lucide-react';

import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useInfrastructure } from '@/hooks/useInfrastructure';
import InfrastructureModal from '@/components/infrastructure/InfrastructureModal';
import InfrastructureChart from '@/components/infrastructure/InfrastructureChart';
import InfrastructureHistoryTable from '@/components/infrastructure/InfrastructureHistoryTable';
import { isDataFresh, getPeriodLabel } from '@/types/infrastructure';
import type { CompanyWithInfrastructure, InfrastructureHistory } from '@/types/infrastructure';
import { TwoPanelLayout, GradientDetailCard, DetailSection, StatBox, ReferenceListItem } from '../shared';
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
    updateCompanyDetails,
  } = useInfrastructure();

  // Inline-редактирование реквизитов
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    company_full_name: '',
    director: '',
    contract_number: '',
    contract_date: '',
    rate_per_hour: '',
  });
  const [detailsSaving, setDetailsSaving] = useState(false);

  const canEdit = user.role === 'chief' || user.role === 'head';
  const canDelete = user.role === 'chief';
  const selectedCompany = companies.find((company) => company.company_id === selectedCompanyId);

  const handleStartEditDetails = useCallback(() => {
    if (!selectedCompany) return;
    setDetailsForm({
      company_full_name: selectedCompany.company_full_name || '',
      director: selectedCompany.director || '',
      contract_number: selectedCompany.contract_number || '',
      contract_date: selectedCompany.contract_date || '',
      rate_per_hour: selectedCompany.rate_per_hour != null ? String(selectedCompany.rate_per_hour) : '',
    });
    setIsEditingDetails(true);
  }, [selectedCompany]);

  const handleCancelEditDetails = useCallback(() => {
    setIsEditingDetails(false);
  }, []);

  const handleSaveDetails = useCallback(async () => {
    if (!selectedCompany) return;
    setDetailsSaving(true);
    const success = await updateCompanyDetails(selectedCompany.company_id, {
      company_full_name: detailsForm.company_full_name.trim() || null,
      director: detailsForm.director.trim() || null,
      contract_number: detailsForm.contract_number.trim() || null,
      contract_date: detailsForm.contract_date || null,
      rate_per_hour: detailsForm.rate_per_hour ? parseFloat(detailsForm.rate_per_hour) : null,
    });
    setDetailsSaving(false);
    if (success) setIsEditingDetails(false);
  }, [selectedCompany, detailsForm, updateCompanyDetails]);

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

  const handleAddRecord = () => {
    if (!selectedCompanyId) return;
    setEditData(null);
    setPreselectedCompanyId(selectedCompanyId);
    setIsModalOpen(true);
  };

  const handleEditHistoryRecord = (item: InfrastructureHistory) => {
    if (!selectedCompany) return;
    setEditData({
      ...selectedCompany,
      infrastructure_id: item.infrastructure_id,
      period_year: item.period_year,
      period_month: item.period_month,
      servers_count: item.servers_count,
      workstations_count: item.workstations_count,
      notes: item.notes,
      // Снапшот реквизитов из исторической записи, а не текущие!
      company_full_name: item.company_full_name,
      director: item.director,
      contract_number: item.contract_number,
      contract_date: item.contract_date,
      rate_per_hour: item.rate_per_hour,
    });
    setPreselectedCompanyId(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (infrastructureId: string) => {
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
      bodyClassName="space-y-1.5"
      emptyState={<ReferenceEmptyState icon={<Building2 className="h-12 w-12" aria-hidden="true" />} text="Предприятия не найдены" />}
      body={companies.map((company) => {
        const isFresh = company.period_year && company.period_month
          ? isDataFresh(company.period_year, company.period_month)
          : false;
        const isSelected = selectedCompanyId === company.company_id;

        return (
          <ReferenceListItem
            key={company.company_id}
            tone="blue"
            isSelected={isSelected}
            onClick={() => handleSelectCompany(company)}
            ariaLabel={`Выбрать ${company.company_name}`}
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
                {company.director && (
                  <p className="text-xs text-slate-400 truncate mt-0.5">{company.director}</p>
                )}
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
            </div>
          </ReferenceListItem>
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
    <GradientDetailCard
      modeLabel={isEditingDetails ? "Редагування" : "Просмотр"}
      isEditing={isEditingDetails}
      canEdit={canEdit}
      gradientClassName="from-blue-400/80 to-cyan-400/80"
      cardClassName="max-w-none"
      onEdit={canEdit ? handleStartEditDetails : undefined}
      onSave={handleSaveDetails}
      onCancel={handleCancelEditDetails}
      saving={detailsSaving}
      onClose={handleCloseDetails}
      headerContent={
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold truncate flex-1">{selectedCompany.company_name}</span>
          {canEdit && !isEditingDetails && (
            <button
              type="button"
              onClick={handleAddRecord}
              aria-label="Добавить запись инфраструктуры"
              className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      }
    >
      {/* Реквізити предприятия */}
      <DetailSection
        title="Реквізити"
        colorScheme="blue"
        titleIcon={<FileSignature />}
      >
        {isEditingDetails ? (
          <div className="space-y-3">
            <div>
              <label className="text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1 block">Повна назва</label>
              <input
                type="text"
                value={detailsForm.company_full_name}
                onChange={(e) => setDetailsForm(prev => ({ ...prev, company_full_name: e.target.value }))}
                placeholder="ТОВ «АТБ-Маркет»"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1 block">Директор</label>
              <input
                type="text"
                value={detailsForm.director}
                onChange={(e) => setDetailsForm(prev => ({ ...prev, director: e.target.value }))}
                placeholder="Прізвище І.П."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1 block">Договір №</label>
                <input
                  type="text"
                  value={detailsForm.contract_number}
                  onChange={(e) => setDetailsForm(prev => ({ ...prev, contract_number: e.target.value }))}
                  placeholder="123/2026"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1 block">Дата договору</label>
                <input
                  type="date"
                  value={detailsForm.contract_date}
                  onChange={(e) => setDetailsForm(prev => ({ ...prev, contract_date: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1 block">Нормогодина, ₴</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={detailsForm.rate_per_hour}
                  onChange={(e) => setDetailsForm(prev => ({ ...prev, rate_per_hour: e.target.value }))}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm text-slate-700">{selectedCompany.company_full_name || <span className="text-slate-400 italic">Не вказано</span>}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm text-slate-700">{selectedCompany.director || <span className="text-slate-400 italic">Не вказано</span>}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileSignature className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm text-slate-700">
                {selectedCompany.contract_number
                  ? <>Договір {selectedCompany.contract_number}{selectedCompany.contract_date && ` від ${new Date(selectedCompany.contract_date).toLocaleDateString('uk-UA')}`}</>
                  : <span className="text-slate-400 italic">Не вказано</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Banknote className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm text-slate-700">{selectedCompany.rate_per_hour != null ? `${Number(selectedCompany.rate_per_hour).toFixed(2)} ₴/год` : <span className="text-slate-400 italic">Не вказано</span>}</span>
            </div>
          </div>
        )}
      </DetailSection>

      {/* Статистика инфраструктуры */}
      <DetailSection title="Інфраструктура" colorScheme="blue" titleIcon={<Monitor />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatBox
            icon={<Monitor />}
            value={selectedCompany.workstations_count.toLocaleString()}
            label="Компьютеры"
            colorScheme="blue"
          />
          <StatBox
            icon={<Server />}
            value={selectedCompany.servers_count.toLocaleString()}
            label="Серверы"
            colorScheme="purple"
          />
          <StatBox
            icon={<Hash />}
            value={selectedCompany.total_endpoints.toLocaleString()}
            label="Всего"
            colorScheme="cyan"
          />
        </div>
      </DetailSection>

      {/* График */}
      <DetailSection title="Динамика" colorScheme="blue" titleIcon={<Building2 />}>
        <InfrastructureChart history={selectedCompanyHistory} loading={historyLoading} />
      </DetailSection>

      {/* История изменений */}
      <DetailSection title="История изменений" colorScheme="blue">
        <InfrastructureHistoryTable
          history={selectedCompanyHistory}
          loading={historyLoading}
          onEdit={canEdit ? handleEditHistoryRecord : undefined}
          onDelete={canDelete ? handleDelete : undefined}
          canDelete={canDelete}
        />
      </DetailSection>
    </GradientDetailCard>
  ) : (
    <ReferenceDetailsEmptyState
      icon={<Building2 className="h-16 w-16" aria-hidden="true" />}
      title="Выберите предприятие"
      description="Нажмите на предприятие в списке слева для просмотра деталей"
    />
  );

  return (
    <>
      <TwoPanelLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={handleCloseDetails}
        rightPanelClassName={cn('overscroll-contain', selectedCompany ? 'bg-blue-50/30' : 'bg-transparent')}
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
