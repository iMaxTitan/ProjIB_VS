'use client';

import React, { useState } from 'react';
import { useInfrastructure } from '@/hooks/useInfrastructure';
import InfrastructureModal from './InfrastructureModal';
import InfrastructureHistoryTable from './InfrastructureHistoryTable';
import InfrastructureChart from './InfrastructureChart';
import { isDataFresh, getPeriodLabel } from '@/types/infrastructure';
import type { CompanyWithInfrastructure } from '@/types/infrastructure';
import type { UserInfo } from '@/types/azure';

interface CompaniesInfrastructurePageProps {
  user: UserInfo;
}

export default function CompaniesInfrastructurePage({ user }: CompaniesInfrastructurePageProps) {
  const {
    companies,
    stats,
    selectedCompanyHistory,
    loading,
    historyLoading,
    error,
    selectedCompanyId,
    refresh,
    selectCompany,
    saveInfrastructure,
    deleteInfrastructure
  } = useInfrastructure();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState<CompanyWithInfrastructure | null>(null);
  const [preselectedCompanyId, setPreselectedCompanyId] = useState<string | null>(null);

  const canEdit = user?.role === 'chief' || user?.role === 'head';
  const canDelete = user?.role === 'chief';

  const selectedCompany = companies.find(c => c.company_id === selectedCompanyId);

  const handleAddNew = () => {
    setEditData(null);
    setPreselectedCompanyId(null);
    setIsModalOpen(true);
  };

  const handleAddForCompany = (companyId: string) => {
    setEditData(null);
    setPreselectedCompanyId(companyId);
    setIsModalOpen(true);
  };

  const handleEdit = (company: CompanyWithInfrastructure) => {
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

  if (loading && companies.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Предприятия</h1>
        {canEdit && (
          <button
            onClick={handleAddNew}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Обновить данные за месяц
          </button>
        )}
      </div>

      {/* Ошибка */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Статистические карточки */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Всего компьютеров</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {stats.totalWorkstations.toLocaleString()}
              </p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Всего серверов</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                {stats.totalServers.toLocaleString()}
              </p>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg">
              <svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Предприятий с серверами</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {stats.companiesWithServers}
              </p>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Загальний обсяг</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {stats.totalEndpoints.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 mt-1">ед. инфраструктуры</p>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Основной контент: таблица и детали */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Таблица компаний */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Инфраструктура предприятий</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Предприятие
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Комп&apos;ютери
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Авгвери
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Период
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {companies.map((company) => {
                    const isFresh = company.period_year && company.period_month
                      ? isDataFresh(company.period_year, company.period_month)
                      : false;
                    const isSelected = selectedCompanyId === company.company_id;

                    return (
                      <tr
                        key={company.company_id}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => selectCompany(isSelected ? null : company.company_id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className={`w-2 h-2 rounded-full mr-3 ${
                              company.has_servers ? 'bg-purple-500' : 'bg-gray-300'
                            }`}></div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {company.company_name}
                              </div>
                              {!isFresh && company.period_year && (
                                <div className="text-xs text-amber-600">
                                  Данные устарели
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {company.workstations_count.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">
                            {company.workstations_percentage.toFixed(1)}%
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {company.servers_count.toLocaleString()}
                          </div>
                          {company.has_servers && (
                            <div className="text-xs text-gray-500">
                              {company.servers_percentage.toFixed(1)}%
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {company.period_year && company.period_month ? (
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              isFresh
                                ? 'bg-green-100 text-green-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {getPeriodLabel(company.period_year, company.period_month)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Нет данных</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            {canEdit && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddForCompany(company.company_id);
                                }}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                title="Добавить запись"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              </button>
                            )}
                            {canEdit && company.infrastructure_id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(company);
                                }}
                                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                                title="Редактировать"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Боковая панель: детали компании */}
        <div className="space-y-4">
          {selectedCompany ? (
            <>
              {/* Информация о компании */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  {selectedCompany.company_name}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Комп&apos;ютери:</span>
                    <span className="font-medium">{selectedCompany.workstations_count.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Авгвери:</span>
                    <span className="font-medium">{selectedCompany.servers_count.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="text-gray-500">Всього:</span>
                    <span className="font-bold text-lg">{selectedCompany.total_endpoints.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* График */}
              <InfrastructureChart
                history={selectedCompanyHistory}
                loading={historyLoading}
              />

              {/* История */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">История изменений</h3>
                <InfrastructureHistoryTable
                  history={selectedCompanyHistory}
                  loading={historyLoading}
                  onDelete={canDelete ? handleDelete : undefined}
                  canDelete={canDelete}
                />
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="mt-4 text-gray-500">Выберите предприятие</p>
              <p className="text-sm text-gray-400">чтобы посмотреть детали и историю</p>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно */}
      <InfrastructureModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={saveInfrastructure}
        userId={user.user_id}
        editData={editData}
        preselectedCompanyId={preselectedCompanyId}
      />
    </div>
  );
}
