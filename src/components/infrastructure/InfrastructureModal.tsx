'use client';

import React, { useState, useEffect } from 'react';
import { Modal, ErrorAlert, ModalFooter } from '@/components/ui/Modal';
import { useCompanies } from '@/hooks/useCompanies';
import type { Company, CompanyWithInfrastructure, InfrastructureParams } from '@/types/infrastructure';
import { MONTH_NAMES } from '@/types/infrastructure';

interface InfrastructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: InfrastructureParams) => Promise<boolean>;
  userId: string;
  editData?: CompanyWithInfrastructure | null;
  preselectedCompanyId?: string | null;
}

export default function InfrastructureModal({
  isOpen,
  onClose,
  onSave,
  userId,
  editData,
  preselectedCompanyId
}: InfrastructureModalProps) {
  const { companies, loading: loadingCompanies } = useCompanies();

  // Состояния формы
  const [companyId, setCompanyId] = useState<string>('');
  const [periodYear, setPeriodYear] = useState<number>(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState<number>(new Date().getMonth() + 1);
  const [serversCount, setServersCount] = useState<number>(0);
  const [workstationsCount, setWorkstationsCount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!editData?.infrastructure_id;

  // Заполнение формы при редактировании или предвыборе компании
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setCompanyId(editData.company_id);
        setPeriodYear(editData.period_year || new Date().getFullYear());
        setPeriodMonth(editData.period_month || new Date().getMonth() + 1);
        setServersCount(editData.servers_count || 0);
        setWorkstationsCount(editData.workstations_count || 0);
        setNotes(editData.notes || '');
      } else {
        // Новая запись
        setCompanyId(preselectedCompanyId || '');
        setPeriodYear(new Date().getFullYear());
        setPeriodMonth(new Date().getMonth() + 1);
        setServersCount(0);
        setWorkstationsCount(0);
        setNotes('');
      }
      setError(null);
    }
  }, [isOpen, editData, preselectedCompanyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyId) {
      setError('Выберите предприятие');
      return;
    }

    if (serversCount < 0 || workstationsCount < 0) {
      setError('Количество не может быть отрицательным');
      return;
    }

    setLoading(true);
    setError(null);

    const params: InfrastructureParams = {
      action: isEditMode ? 'update' : 'create',
      infrastructureId: editData?.infrastructure_id ?? undefined,
      companyId,
      periodYear,
      periodMonth,
      serversCount,
      workstationsCount,
      notes: notes.trim() || undefined,
      userId
    };

    const success = await onSave(params);

    setLoading(false);

    if (success) {
      onClose();
    } else {
      setError('Ошибка при сохранении данных');
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  // Генерируем года для выбора (текущий и 2 предыдущих)
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditMode ? 'Редактирование инфраструктуры' : 'Добавление инфраструктуры'}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit}>
        <ErrorAlert message={error} />

        <div className="space-y-4">
          {/* Предприятие */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Предприятие <span className="text-red-500">*</span>
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading || loadingCompanies || isEditMode}
              required
            >
              <option value="">Выберите предприятие</option>
              {companies.map((company) => (
                <option key={company.company_id} value={company.company_id}>
                  {company.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Период: Год и Месяц */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Год <span className="text-red-500">*</span>
              </label>
              <select
                value={periodYear}
                onChange={(e) => setPeriodYear(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading || isEditMode}
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Месяц <span className="text-red-500">*</span>
              </label>
              <select
                value={periodMonth}
                onChange={(e) => setPeriodMonth(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading || isEditMode}
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={index + 1} value={index + 1}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Авгверы и Рабочие станции */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Авгвери <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={serversCount}
                onChange={(e) => setServersCount(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Рабочие станции <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={workstationsCount}
                onChange={(e) => setWorkstationsCount(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Итого */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Всього:</span>
              <span className="font-semibold text-gray-800">
                {serversCount + workstationsCount} од.
              </span>
            </div>
          </div>

          {/* Примечания */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Примечания
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Дополнительная информация..."
              disabled={loading}
            />
          </div>
        </div>

        <ModalFooter
          onCancel={handleClose}
          loading={loading}
          isEditMode={isEditMode}
          submitLabel="Сохранить"
          editLabel="Сохранить изменения"
        />
      </form>
    </Modal>
  );
}
