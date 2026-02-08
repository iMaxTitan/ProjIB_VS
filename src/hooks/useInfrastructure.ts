'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  getCompaniesWithInfrastructure,
  getCompanyInfrastructureHistory,
  manageInfrastructure
} from '@/lib/services/infrastructure.service';
import type {
  CompanyWithInfrastructure,
  InfrastructureHistory,
  InfrastructureParams,
  InfrastructureStats
} from '@/types/infrastructure';
import { calculateInfrastructureStats } from '@/types/infrastructure';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';

export interface UseInfrastructureResult {
  // Данные
  companies: CompanyWithInfrastructure[];
  stats: InfrastructureStats;
  selectedCompanyHistory: InfrastructureHistory[];

  // Состояние
  loading: boolean;
  historyLoading: boolean;
  error: string | null;
  selectedCompanyId: string | null;

  // Действия
  refresh: () => Promise<void>;
  selectCompany: (companyId: string | null) => void;
  loadHistory: (companyId: string) => Promise<void>;
  saveInfrastructure: (params: InfrastructureParams) => Promise<boolean>;
  deleteInfrastructure: (infrastructureId: string, userId: string) => Promise<boolean>;
}

export function useInfrastructure(): UseInfrastructureResult {
  // Состояния для данных
  const [companies, setCompanies] = useState<CompanyWithInfrastructure[]>([]);
  const [stats, setStats] = useState<InfrastructureStats>({
    totalCompanies: 0,
    companiesWithServers: 0,
    totalServers: 0,
    totalWorkstations: 0,
    totalEndpoints: 0,
    companiesWithFreshData: 0,
    companiesWithStaleData: 0
  });
  const [selectedCompanyHistory, setSelectedCompanyHistory] = useState<InfrastructureHistory[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Состояния UI
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загрузка списка компаний с инфраструктурой
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCompaniesWithInfrastructure();
      setCompanies(data);
      setStats(calculateInfrastructureStats(data));
    } catch (err: unknown) {
      logger.error('Ошибка при загрузке инфраструктуры:', err);
      setError(getErrorMessage(err, 'Ошибка загрузки данных'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка истории для компании
  const loadHistory = useCallback(async (companyId: string) => {
    try {
      setHistoryLoading(true);
      const data = await getCompanyInfrastructureHistory(companyId, 12);
      setSelectedCompanyHistory(data);
    } catch (err: unknown) {
      logger.error('Ошибка при загрузке истории:', err);
      setError(getErrorMessage(err, 'Ошибка загрузки истории'));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Выбор компании
  const selectCompany = useCallback((companyId: string | null) => {
    setSelectedCompanyId(companyId);
    if (companyId) {
      loadHistory(companyId);
    } else {
      setSelectedCompanyHistory([]);
    }
  }, [loadHistory]);

  // Сохранение инфраструктуры
  const saveInfrastructure = useCallback(async (params: InfrastructureParams): Promise<boolean> => {
    try {
      setError(null);
      await manageInfrastructure(params);
      await refresh();

      // Если была выбрана компания, обновляем её историю
      if (selectedCompanyId === params.companyId) {
        await loadHistory(params.companyId);
      }

      return true;
    } catch (err: unknown) {
      logger.error('Ошибка при сохранении инфраструктуры:', err);
      setError(getErrorMessage(err, 'Ошибка сохранения'));
      return false;
    }
  }, [refresh, loadHistory, selectedCompanyId]);

  // Удаление инфраструктуры
  const deleteInfrastructure = useCallback(async (infrastructureId: string, userId: string): Promise<boolean> => {
    try {
      setError(null);
      await manageInfrastructure({
        action: 'delete',
        infrastructureId,
        companyId: '',
        periodYear: 0,
        periodMonth: 0,
        serversCount: 0,
        workstationsCount: 0,
        userId
      });
      await refresh();

      // Если была выбрана компания, обновляем её историю
      if (selectedCompanyId) {
        await loadHistory(selectedCompanyId);
      }

      return true;
    } catch (err: unknown) {
      logger.error('Ошибка при удалении инфраструктуры:', err);
      setError(getErrorMessage(err, 'Ошибка удаления'));
      return false;
    }
  }, [refresh, loadHistory, selectedCompanyId]);

  // Начальная загрузка
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    companies,
    stats,
    selectedCompanyHistory,
    loading,
    historyLoading,
    error,
    selectedCompanyId,
    refresh,
    selectCompany,
    loadHistory,
    saveInfrastructure,
    deleteInfrastructure
  };
}


